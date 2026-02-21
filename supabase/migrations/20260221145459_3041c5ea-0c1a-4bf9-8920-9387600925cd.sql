
-- ============================================================
-- 1. DATABASE INDEXES
-- ============================================================

-- order_batches indexes
CREATE INDEX IF NOT EXISTS idx_order_batches_order_terminated ON public.order_batches (order_id, is_terminated);
CREATE INDEX IF NOT EXISTS idx_order_batches_current_state ON public.order_batches (current_state);
CREATE INDEX IF NOT EXISTS idx_order_batches_box_id ON public.order_batches (box_id);
CREATE INDEX IF NOT EXISTS idx_order_batches_product_id ON public.order_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_order_batches_shipment_id ON public.order_batches (shipment_id);
CREATE INDEX IF NOT EXISTS idx_order_batches_order_item_id ON public.order_batches (order_item_id);

-- extra_batches indexes
CREATE INDEX IF NOT EXISTS idx_extra_batches_box_id ON public.extra_batches (box_id);
CREATE INDEX IF NOT EXISTS idx_extra_batches_inv_state ON public.extra_batches (inventory_state, current_state);
CREATE INDEX IF NOT EXISTS idx_extra_batches_product_id ON public.extra_batches (product_id);
CREATE INDEX IF NOT EXISTS idx_extra_batches_order_id ON public.extra_batches (order_id);

-- shipments indexes
CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments (order_id);

-- order_items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items (order_id);

-- extra_batch_history indexes
CREATE INDEX IF NOT EXISTS idx_extra_batch_history_source_order ON public.extra_batch_history (source_order_id);
CREATE INDEX IF NOT EXISTS idx_extra_batch_history_consuming_order ON public.extra_batch_history (consuming_order_id);

-- ============================================================
-- 2. ATOMIC FUNCTION: move_order_batches_to_extra
-- ============================================================

CREATE OR REPLACE FUNCTION public.move_order_batches_to_extra(
  p_selections jsonb,
  p_target_box_id uuid,
  p_phase text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_selection jsonb;
  v_batch record;
  v_use_qty integer;
  v_remaining integer;
  v_extra_state text;
  v_existing_extra record;
  v_new_extra_id uuid;
  v_extra_code text;
  v_batch_id uuid;
  v_batch_qty integer;
  v_order_item_id uuid;
  v_product_id uuid;
  v_sel_qty integer;
  v_deductions jsonb := '{}';
  v_total_moved integer := 0;
  v_order_id uuid;
BEGIN
  -- Map phase to extra state
  v_extra_state := CASE p_phase
    WHEN 'in_manufacturing' THEN 'extra_manufacturing'
    WHEN 'in_finishing' THEN 'extra_finishing'
    WHEN 'in_packaging' THEN 'extra_packaging'
    WHEN 'in_boxing' THEN 'extra_boxing'
    ELSE NULL
  END;

  IF v_extra_state IS NULL THEN
    RAISE EXCEPTION 'Invalid phase: %', p_phase;
  END IF;

  -- Process each selection
  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_product_id := (v_selection->>'product_id')::uuid;
    v_sel_qty := (v_selection->>'quantity')::integer;
    
    IF v_sel_qty <= 0 THEN CONTINUE; END IF;

    v_remaining := v_sel_qty;

    -- Iterate over matching order batches (largest first)
    FOR v_batch IN
      SELECT id, quantity, order_item_id, order_id
      FROM order_batches
      WHERE id = ANY(
        SELECT (j->>'batch_id')::uuid
        FROM jsonb_array_elements(v_selection->'batches') j
      )
      AND current_state = p_phase
      ORDER BY quantity DESC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;

      v_use_qty := LEAST(v_batch.quantity, v_remaining);
      v_remaining := v_remaining - v_use_qty;
      v_order_id := v_batch.order_id;

      -- Track deduction per order_item
      IF v_batch.order_item_id IS NOT NULL THEN
        v_deductions := jsonb_set(
          v_deductions,
          ARRAY[v_batch.order_item_id::text],
          to_jsonb(COALESCE((v_deductions->>v_batch.order_item_id::text)::integer, 0) + v_use_qty)
        );
      END IF;

      -- Check for existing extra batch to merge
      SELECT id, quantity INTO v_existing_extra
      FROM extra_batches
      WHERE box_id = p_target_box_id
        AND product_id = v_product_id
        AND current_state = v_extra_state
        AND inventory_state = 'AVAILABLE'
      LIMIT 1
      FOR UPDATE;

      IF v_existing_extra.id IS NOT NULL THEN
        -- Merge
        UPDATE extra_batches
        SET quantity = v_existing_extra.quantity + v_use_qty,
            updated_at = now()
        WHERE id = v_existing_extra.id;

        v_new_extra_id := v_existing_extra.id;
      ELSE
        -- Create new extra batch
        SELECT generate_extra_batch_code() INTO v_extra_code;

        INSERT INTO extra_batches (
          qr_code_data, product_id, quantity, current_state,
          inventory_state, box_id, order_id, order_item_id, created_by
        ) VALUES (
          COALESCE(v_extra_code, 'EB-' || substr(md5(random()::text), 1, 8)),
          v_product_id, v_use_qty, v_extra_state,
          'AVAILABLE', p_target_box_id, NULL, NULL, p_user_id
        )
        RETURNING id INTO v_new_extra_id;

        -- After first insert, subsequent merges will find this batch
        v_existing_extra.id := v_new_extra_id;
        v_existing_extra.quantity := v_use_qty;
      END IF;

      -- Insert history
      INSERT INTO extra_batch_history (
        extra_batch_id, event_type, quantity, from_state,
        source_order_id, source_order_item_id, product_id, performed_by
      ) VALUES (
        v_new_extra_id, 'CREATED', v_use_qty, p_phase,
        v_batch.order_id, v_batch.order_item_id, v_product_id, p_user_id
      );

      -- Update or delete the order batch
      IF v_batch.quantity - v_use_qty <= 0 THEN
        DELETE FROM order_batches WHERE id = v_batch.id;
      ELSE
        UPDATE order_batches
        SET quantity = v_batch.quantity - v_use_qty, updated_at = now()
        WHERE id = v_batch.id;
      END IF;

      v_total_moved := v_total_moved + v_use_qty;
    END LOOP;
  END LOOP;

  -- Update deducted_to_extra on order_items
  DECLARE
    v_oi_id text;
    v_deduct_qty integer;
  BEGIN
    FOR v_oi_id, v_deduct_qty IN
      SELECT key, value::integer FROM jsonb_each_text(v_deductions)
    LOOP
      UPDATE order_items
      SET deducted_to_extra = deducted_to_extra + v_deduct_qty
      WHERE id = v_oi_id::uuid;
    END LOOP;
  END;

  RETURN jsonb_build_object('total_moved', v_total_moved);
END;
$$;

-- ============================================================
-- 3. ATOMIC FUNCTION: assign_machine_to_batches
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_machine_to_batches(
  p_batch_ids uuid[],
  p_machine_id uuid,
  p_machine_column text,
  p_requested_qty integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_batch record;
  v_remaining integer := p_requested_qty;
  v_assigned integer := 0;
BEGIN
  -- Validate machine column
  IF p_machine_column NOT IN (
    'manufacturing_machine_id', 'finishing_machine_id',
    'packaging_machine_id', 'boxing_machine_id'
  ) THEN
    RAISE EXCEPTION 'Invalid machine column: %', p_machine_column;
  END IF;

  IF p_requested_qty <= 0 THEN
    RAISE EXCEPTION 'Requested quantity must be positive';
  END IF;

  -- Lock and iterate batches sorted by quantity ascending
  FOR v_batch IN
    SELECT id, quantity, order_id, product_id, order_item_id, current_state,
           created_by, eta, lead_time_days
    FROM order_batches
    WHERE id = ANY(p_batch_ids)
    ORDER BY quantity ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0;

    IF v_batch.quantity <= v_remaining THEN
      -- Fully assign
      EXECUTE format(
        'UPDATE order_batches SET %I = $1 WHERE id = $2',
        p_machine_column
      ) USING p_machine_id, v_batch.id;

      v_remaining := v_remaining - v_batch.quantity;
      v_assigned := v_assigned + v_batch.quantity;
    ELSE
      -- Partial: update this batch with assigned portion
      EXECUTE format(
        'UPDATE order_batches SET quantity = $1, %I = $2 WHERE id = $3',
        p_machine_column
      ) USING v_remaining, p_machine_id, v_batch.id;

      -- Insert remainder batch (no machine)
      INSERT INTO order_batches (
        order_id, product_id, order_item_id, current_state,
        quantity, created_by, eta, lead_time_days
      ) VALUES (
        v_batch.order_id, v_batch.product_id, v_batch.order_item_id,
        v_batch.current_state, v_batch.quantity - v_remaining,
        v_batch.created_by, v_batch.eta, v_batch.lead_time_days
      );

      v_assigned := v_assigned + v_remaining;
      v_remaining := 0;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('assigned', v_assigned);
END;
$$;
