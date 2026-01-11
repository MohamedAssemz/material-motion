-- Extra batches must always be assigned to an extra box
-- First, delete any orphaned extra batches without a box
DELETE FROM extra_batches WHERE box_id IS NULL;

-- Make box_id NOT NULL
ALTER TABLE extra_batches 
ALTER COLUMN box_id SET NOT NULL;

-- Update the validation trigger to enforce this
CREATE OR REPLACE FUNCTION validate_extra_batch()
RETURNS TRIGGER AS $$
BEGIN
  -- Rule: Extra batches MUST have a box_id (cannot exist without an EBox container)
  IF NEW.box_id IS NULL THEN
    RAISE EXCEPTION 'Extra batch must be assigned to an extra box (box_id cannot be null)';
  END IF;

  -- Rule: Extra batches CANNOT have an order_id when inventory_state is AVAILABLE
  IF NEW.inventory_state = 'AVAILABLE' AND NEW.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Available extra batches cannot be linked to an order';
  END IF;
  
  -- Rule: Reserved extra batches MUST have an order_id
  IF NEW.inventory_state = 'RESERVED' AND NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'Reserved extra batches must be linked to an order';
  END IF;
  
  -- Rule: Quantity must be positive
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Extra batch quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;