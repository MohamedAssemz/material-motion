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

    -- Current reserved_qty already has consumed quantities subtracted,
    -- so reserved_qty IS the unretrieved amount
    v_unretrieved_qty := v_order_item.reserved_qty;

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
        quantity, created_by, qr_code_data
      ) VALUES (
        p_order_id, v_order_item.product_id, v_order_item.order_item_id,
        'in_manufacturing', v_unretrieved_qty, p_user_id, v_batch_code
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