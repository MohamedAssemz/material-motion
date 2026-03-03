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
           created_by, eta, lead_time_days, from_extra_state
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

      -- Insert remainder batch (no machine) - inherit from_extra_state
      INSERT INTO order_batches (
        order_id, product_id, order_item_id, current_state,
        quantity, created_by, eta, lead_time_days, from_extra_state
      ) VALUES (
        v_batch.order_id, v_batch.product_id, v_batch.order_item_id,
        v_batch.current_state, v_batch.quantity - v_remaining,
        v_batch.created_by, v_batch.eta, v_batch.lead_time_days,
        v_batch.from_extra_state
      );

      v_assigned := v_assigned + v_remaining;
      v_remaining := 0;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('assigned', v_assigned);
END;
$function$;