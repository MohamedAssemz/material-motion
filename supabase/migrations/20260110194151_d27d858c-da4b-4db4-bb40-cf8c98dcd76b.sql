-- Allow EXTRA batches to exist in transitioning states without requiring a box.
-- Keep the enforcement for ORDER batches.

CREATE OR REPLACE FUNCTION public.enforce_box_id_for_transitioning_states()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  transitioning_states TEXT[] := ARRAY[
    'ready_for_finishing',
    'ready_for_packaging',
    'ready_for_boxing'
  ];
BEGIN
  -- EXTRA batches are created first, then assigned to a box later.
  IF NEW.batch_type = 'EXTRA' THEN
    RETURN NEW;
  END IF;

  -- For ORDER batches, require a box when entering transitioning states.
  IF NEW.current_state = ANY(transitioning_states) AND NEW.box_id IS NULL THEN
    RAISE EXCEPTION 'box_id is required when transitioning to state: %. Items must be assigned to a box before moving to this state.', NEW.current_state;
  END IF;

  RETURN NEW;
END;
$$;