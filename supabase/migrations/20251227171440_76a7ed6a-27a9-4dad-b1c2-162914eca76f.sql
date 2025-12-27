-- Create a trigger function to enforce box_id is NOT NULL for transitioning states
CREATE OR REPLACE FUNCTION public.enforce_box_id_for_transitioning_states()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  transitioning_states TEXT[] := ARRAY[
    'ready_for_finishing',
    'ready_for_packaging', 
    'ready_for_boxing'
  ];
BEGIN
  -- Check if the new state is a transitioning state and box_id is null
  IF NEW.current_state = ANY(transitioning_states) AND NEW.box_id IS NULL THEN
    RAISE EXCEPTION 'box_id is required when transitioning to state: %. Items must be assigned to a box before moving to this state.', NEW.current_state;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on batches table
DROP TRIGGER IF EXISTS enforce_box_id_transition_trigger ON public.batches;
CREATE TRIGGER enforce_box_id_transition_trigger
  BEFORE INSERT OR UPDATE ON public.batches
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_box_id_for_transitioning_states();