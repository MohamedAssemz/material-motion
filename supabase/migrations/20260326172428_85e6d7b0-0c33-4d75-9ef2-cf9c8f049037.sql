
-- Add is_special and initial_state to order_items
ALTER TABLE order_items ADD COLUMN is_special boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN initial_state text DEFAULT NULL;

-- Add is_special to order_batches
ALTER TABLE order_batches ADD COLUMN is_special boolean NOT NULL DEFAULT false;

-- Add is_special to extra_batches
ALTER TABLE extra_batches ADD COLUMN is_special boolean NOT NULL DEFAULT false;

-- Update move_order_batches_to_extra RPC to copy is_special
CREATE OR REPLACE FUNCTION public.move_order_batches_to_extra(p_selections jsonb, p_target_box_id uuid, p_phase text, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      SELECT id, quantity, order_item_id, order_id,
             manufacturing_machine_id, finishing_machine_id,
             packaging_machine_id, boxing_machine_id,
             is_special
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
        AND is_special = v_batch.is_special
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
        -- Create new extra batch with machine IDs from source
        SELECT generate_extra_batch_code() INTO v_extra_code;

        INSERT INTO extra_batches (
          qr_code_data, product_id, quantity, current_state,
          inventory_state, box_id, order_id, order_item_id, created_by,
          manufacturing_machine_id, finishing_machine_id,
          packaging_machine_id, boxing_machine_id,
          is_special
        ) VALUES (
          COALESCE(v_extra_code, 'EB-' || substr(md5(random()::text), 1, 8)),
          v_product_id, v_use_qty, v_extra_state,
          'AVAILABLE', p_target_box_id, NULL, NULL, p_user_id,
          v_batch.manufacturing_machine_id, v_batch.finishing_machine_id,
          v_batch.packaging_machine_id, v_batch.boxing_machine_id,
          v_batch.is_special
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
$function$;

-- Update commit_extra_inventory to respect is_special initial state
CREATE OR REPLACE FUNCTION public.commit_extra_inventory(p_order_id uuid, p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_batch record;
  v_consumed_qty integer;
  v_unretrieved_qty integer;
  v_total_released integer := 0;
  v_total_requeued integer := 0;
  v_summary jsonb := '[]'::jsonb;
  v_order_item record;
  v_batch_code text;
  v_initial_state text;
  v_is_special boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM orders WHERE id = p_order_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'Order must be in_progress to commit extra inventory';
  END IF;

  FOR v_order_item IN
    SELECT 
      eb.order_item_id,
      eb.product_id,
      SUM(eb.quantity) as reserved_qty
    FROM extra_batches eb
    WHERE eb.order_id = p_order_id
      AND eb.inventory_state = 'RESERVED'
    GROUP BY eb.order_item_id, eb.product_id
  LOOP
    SELECT COALESCE(SUM(h.quantity), 0) INTO v_consumed_qty
    FROM extra_batch_history h
    WHERE h.event_type = 'CONSUMED'
      AND h.consuming_order_id = p_order_id
      AND h.consuming_order_item_id = v_order_item.order_item_id;

    v_unretrieved_qty := v_order_item.reserved_qty;

    -- Look up order_item to determine if special and its initial_state
    SELECT oi.is_special, oi.initial_state INTO v_is_special, v_initial_state
    FROM order_items oi
    WHERE oi.id = v_order_item.order_item_id;

    FOR v_batch IN
      SELECT id, quantity, current_state, box_id
      FROM extra_batches
      WHERE order_id = p_order_id
        AND order_item_id = v_order_item.order_item_id
        AND inventory_state = 'RESERVED'
      FOR UPDATE
    LOOP
      UPDATE extra_batches
      SET inventory_state = 'AVAILABLE',
          order_id = NULL,
          order_item_id = NULL,
          updated_at = now()
      WHERE id = v_batch.id;

      INSERT INTO extra_batch_history (
        extra_batch_id, event_type, quantity, from_state,
        source_order_id, source_order_item_id, product_id, performed_by, notes
      ) VALUES (
        v_batch.id, 'RELEASED', v_batch.quantity, v_batch.current_state,
        p_order_id, v_order_item.order_item_id, v_order_item.product_id, p_user_id,
        'Commit: unretrieved reservation released'
      );

      v_total_released := v_total_released + v_batch.quantity;
    END LOOP;

    IF v_unretrieved_qty > 0 THEN
      SELECT generate_batch_code() INTO v_batch_code;

      INSERT INTO order_batches (
        order_id, product_id, order_item_id, current_state,
        quantity, created_by, qr_code_data, is_special
      ) VALUES (
        p_order_id, v_order_item.product_id, v_order_item.order_item_id,
        COALESCE(v_initial_state, 'in_manufacturing'), v_unretrieved_qty, p_user_id, v_batch_code,
        COALESCE(v_is_special, false)
      );

      v_total_requeued := v_total_requeued + v_unretrieved_qty;
    END IF;

    IF v_unretrieved_qty > 0 AND v_order_item.order_item_id IS NOT NULL THEN
      UPDATE order_items
      SET deducted_to_extra = GREATEST(0, deducted_to_extra - v_unretrieved_qty)
      WHERE id = v_order_item.order_item_id;
    END IF;

    v_summary := v_summary || jsonb_build_object(
      'product_id', v_order_item.product_id,
      'order_item_id', v_order_item.order_item_id,
      'reserved', v_order_item.reserved_qty + v_consumed_qty,
      'consumed', v_consumed_qty,
      'unretrieved', v_unretrieved_qty
    );
  END LOOP;

  RETURN jsonb_build_object(
    'total_released', v_total_released,
    'total_requeued', v_total_requeued,
    'details', v_summary
  );
END;
$function$;

-- Update assign_machine_to_batches to inherit is_special on split
CREATE OR REPLACE FUNCTION public.assign_machine_to_batches(p_batch_ids uuid[], p_machine_id uuid, p_machine_column text, p_requested_qty integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
           created_by, eta, lead_time_days, from_extra_state, box_id, is_special
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

      -- Insert remainder batch (no machine) - inherit from_extra_state, box_id, and is_special
      INSERT INTO order_batches (
        order_id, product_id, order_item_id, current_state,
        quantity, created_by, eta, lead_time_days, from_extra_state, box_id, is_special
      ) VALUES (
        v_batch.order_id, v_batch.product_id, v_batch.order_item_id,
        v_batch.current_state, v_batch.quantity - v_remaining,
        v_batch.created_by, v_batch.eta, v_batch.lead_time_days,
        v_batch.from_extra_state, v_batch.box_id, v_batch.is_special
      );

      v_assigned := v_assigned + v_remaining;
      v_remaining := 0;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('assigned', v_assigned);
END;
$function$;
