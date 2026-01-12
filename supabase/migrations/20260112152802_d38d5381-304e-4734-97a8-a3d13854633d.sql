-- Fix the trigger to use correct state names and NOT require box for ready_for_shipment
CREATE OR REPLACE FUNCTION public.check_batch_container_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  transitioning_states TEXT[] := ARRAY[
    'ready_for_finishing',
    'ready_for_packaging', 
    'ready_for_boxing'
  ];
BEGIN
  -- For ORDER batches in transitioning states, box_id is required
  -- ready_for_shipment and shipped states do NOT require a box
  IF NEW.current_state = ANY(transitioning_states) AND NEW.box_id IS NULL THEN
    RAISE EXCEPTION 'Order batches in state "%" must be assigned to a box', NEW.current_state;
  END IF;
  
  -- Verify box exists if assigned
  IF NEW.box_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM boxes WHERE id = NEW.box_id AND is_active = true) THEN
      RAISE EXCEPTION 'Invalid or inactive box_id: %', NEW.box_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Also update the enforce_box_id_for_transitioning_states function
CREATE OR REPLACE FUNCTION public.enforce_box_id_for_transitioning_states()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  transitioning_states TEXT[] := ARRAY[
    'ready_for_finishing',
    'ready_for_packaging',
    'ready_for_boxing'
  ];
BEGIN
  -- For order_batches, require a box when entering transitioning states.
  -- pending_rm, in_manufacturing, ready_for_shipment, and shipped states don't require a box.
  IF NEW.current_state = ANY(transitioning_states) AND NEW.box_id IS NULL THEN
    RAISE EXCEPTION 'box_id is required when transitioning to state: %. Items must be assigned to a box before moving to this state.', NEW.current_state;
  END IF;

  RETURN NEW;
END;
$function$;