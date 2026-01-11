-- Fix the trigger function to remove reference to removed batch_type column
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
  -- pending_rm and in_manufacturing states don't require a box.
  IF NEW.current_state = ANY(transitioning_states) AND NEW.box_id IS NULL THEN
    RAISE EXCEPTION 'box_id is required when transitioning to state: %. Items must be assigned to a box before moving to this state.', NEW.current_state;
  END IF;

  RETURN NEW;
END;
$function$;