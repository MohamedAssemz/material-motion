
-- Add size column to extra_batches
ALTER TABLE public.extra_batches ADD COLUMN size text;

-- Update move_order_batches_to_extra RPC to include size from order_items
CREATE OR REPLACE FUNCTION public.move_order_batches_to_extra(
  p_phase text,
  p_selections jsonb,
  p_target_box_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_size text;
BEGIN
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

  FOR v_selection IN SELECT * FROM jsonb_array_elements(p_selections)
  LOOP
    v_product_id := (v_selection->>'product_id')::uuid;
    v_sel_qty := (v_selection->>'quantity')::integer;
    
    IF v_sel_qty <= 0 THEN CONTINUE; END IF;

    v_remaining := v_sel_qty;

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

      -- Lookup size from order_items
      v_size := NULL;
      IF v_batch.order_item_id IS NOT NULL THEN
        SELECT oi.size INTO v_size FROM order_items oi WHERE oi.id = v_batch.order_item_id;
      END IF;

      IF v_batch.order_item_id IS NOT NULL THEN
        v_deductions := jsonb_set(
          v_deductions,
          ARRAY[v_batch.order_item_id::text],
          to_jsonb(COALESCE((v_deductions->>v_batch.order_item_id::text)::integer, 0) + v_use_qty)
        );
      END IF;

      -- Merge check now includes size
      SELECT id, quantity INTO v_existing_extra
      FROM extra_batches
      WHERE box_id = p_target_box_id
        AND product_id = v_product_id
        AND current_state = v_extra_state
        AND inventory_state = 'AVAILABLE'
        AND is_special = v_batch.is_special
        AND size IS NOT DISTINCT FROM v_size
      LIMIT 1
      FOR UPDATE;

      IF v_existing_extra.id IS NOT NULL THEN
        UPDATE extra_batches
        SET quantity = v_existing_extra.quantity + v_use_qty,
            updated_at = now()
        WHERE id = v_existing_extra.id;

        v_new_extra_id := v_existing_extra.id;
      ELSE
        SELECT generate_extra_batch_code() INTO v_extra_code;

        INSERT INTO extra_batches (
          qr_code_data, product_id, quantity, current_state,
          inventory_state, box_id, order_id, order_item_id, created_by,
          manufacturing_machine_id, finishing_machine_id,
          packaging_machine_id, boxing_machine_id,
          is_special, size
        ) VALUES (
          COALESCE(v_extra_code, 'EB-' || substr(md5(random()::text), 1, 8)),
          v_product_id, v_use_qty, v_extra_state,
          'AVAILABLE', p_target_box_id, NULL, NULL, p_user_id,
          v_batch.manufacturing_machine_id, v_batch.finishing_machine_id,
          v_batch.packaging_machine_id, v_batch.boxing_machine_id,
          v_batch.is_special, v_size
        )
        RETURNING id INTO v_new_extra_id;

        v_existing_extra.id := v_new_extra_id;
        v_existing_extra.quantity := v_use_qty;
      END IF;

      INSERT INTO extra_batch_history (
        extra_batch_id, event_type, quantity, from_state,
        source_order_id, source_order_item_id, product_id, performed_by
      ) VALUES (
        v_new_extra_id, 'CREATED', v_use_qty, p_phase,
        v_batch.order_id, v_batch.order_item_id, v_product_id, p_user_id
      );

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

-- Update sync_extra_box_items_list trigger to group by size
CREATE OR REPLACE FUNCTION public.sync_extra_box_items_list()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_box_id UUID;
  items_summary JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_box_id := OLD.box_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.box_id IS DISTINCT FROM NEW.box_id THEN
    IF OLD.box_id IS NOT NULL THEN
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'product_id', sq.product_id,
            'product_name', sq.product_name,
            'product_sku', sq.product_sku,
            'size', sq.size,
            'quantity', sq.total_qty
          )
        ),
        '[]'::jsonb
      ) INTO items_summary
      FROM (
        SELECT 
          eb.product_id,
          p.name_en as product_name,
          p.sku as product_sku,
          eb.size,
          SUM(eb.quantity) as total_qty
        FROM extra_batches eb
        JOIN products p ON p.id = eb.product_id
        WHERE eb.box_id = OLD.box_id
        GROUP BY eb.product_id, p.name_en, p.sku, eb.size
      ) sq;
      
      UPDATE extra_boxes SET 
        items_list = items_summary,
        content_type = CASE WHEN items_summary = '[]'::jsonb THEN 'EMPTY' ELSE 'EXTRA' END
      WHERE id = OLD.box_id;
    END IF;
    
    affected_box_id := NEW.box_id;
  ELSE
    affected_box_id := COALESCE(NEW.box_id, OLD.box_id);
  END IF;
  
  IF affected_box_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', sq.product_id,
        'product_name', sq.product_name,
        'product_sku', sq.product_sku,
        'size', sq.size,
        'quantity', sq.total_qty
      )
    ),
    '[]'::jsonb
  ) INTO items_summary
  FROM (
    SELECT 
      eb.product_id,
      p.name_en as product_name,
      p.sku as product_sku,
      eb.size,
      SUM(eb.quantity) as total_qty
    FROM extra_batches eb
    JOIN products p ON p.id = eb.product_id
    WHERE eb.box_id = affected_box_id
    GROUP BY eb.product_id, p.name_en, p.sku, eb.size
  ) sq;
  
  UPDATE extra_boxes SET 
    items_list = items_summary,
    content_type = CASE WHEN items_summary = '[]'::jsonb THEN 'EMPTY' ELSE 'EXTRA' END
  WHERE id = affected_box_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;
