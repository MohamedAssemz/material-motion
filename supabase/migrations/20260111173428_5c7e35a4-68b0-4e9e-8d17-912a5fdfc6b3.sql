-- ============================================
-- SYSTEM CONSTRAINTS FOR BATCH INTEGRITY
-- ============================================

-- 1. Ensure order_batches always belong to an order
-- First, check for any orphaned batches and handle them
DELETE FROM order_batches WHERE order_id IS NULL;

-- Make order_id NOT NULL
ALTER TABLE order_batches 
ALTER COLUMN order_id SET NOT NULL;

-- 2. Create function to sync order_item quantity with sum of batches
CREATE OR REPLACE FUNCTION sync_order_item_quantity()
RETURNS TRIGGER AS $$
DECLARE
  affected_order_item_id UUID;
  new_quantity INTEGER;
BEGIN
  -- Determine which order_item_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_order_item_id := OLD.order_item_id;
  ELSE
    affected_order_item_id := NEW.order_item_id;
    
    -- If order_item_id changed, also update the old one
    IF TG_OP = 'UPDATE' AND OLD.order_item_id IS DISTINCT FROM NEW.order_item_id THEN
      -- Update old order item
      SELECT COALESCE(SUM(quantity), 0) INTO new_quantity
      FROM order_batches
      WHERE order_item_id = OLD.order_item_id
        AND is_terminated = false;
      
      UPDATE order_items SET quantity = new_quantity WHERE id = OLD.order_item_id;
    END IF;
  END IF;
  
  -- Skip if no order_item_id
  IF affected_order_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate new quantity as sum of active batches
  SELECT COALESCE(SUM(quantity), 0) INTO new_quantity
  FROM order_batches
  WHERE order_item_id = affected_order_item_id
    AND is_terminated = false;
  
  -- Update order_items.quantity
  UPDATE order_items SET quantity = new_quantity WHERE id = affected_order_item_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for order_batches changes
DROP TRIGGER IF EXISTS sync_order_item_quantity_trigger ON order_batches;
CREATE TRIGGER sync_order_item_quantity_trigger
AFTER INSERT OR UPDATE OR DELETE ON order_batches
FOR EACH ROW
EXECUTE FUNCTION sync_order_item_quantity();

-- 3. Validate order batch integrity
CREATE OR REPLACE FUNCTION validate_order_batch()
RETURNS TRIGGER AS $$
BEGIN
  -- Rule: Order batches must have a valid order_id
  IF NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'Order batch must belong to an order (order_id cannot be null)';
  END IF;
  
  -- Rule: Quantity must be positive
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Batch quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS validate_order_batch_trigger ON order_batches;
CREATE TRIGGER validate_order_batch_trigger
BEFORE INSERT OR UPDATE ON order_batches
FOR EACH ROW
EXECUTE FUNCTION validate_order_batch();

-- 4. Validate extra batch integrity
CREATE OR REPLACE FUNCTION validate_extra_batch()
RETURNS TRIGGER AS $$
BEGIN
  -- Rule: Extra batches CANNOT have an order_id when inventory_state is AVAILABLE
  -- (They can have order_id when RESERVED)
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

DROP TRIGGER IF EXISTS validate_extra_batch_trigger ON extra_batches;
CREATE TRIGGER validate_extra_batch_trigger
BEFORE INSERT OR UPDATE ON extra_batches
FOR EACH ROW
EXECUTE FUNCTION validate_extra_batch();

-- 5. Prevent boxes from having independent quantity tracking
-- (Boxes only have items_list for display purposes, never authoritative quantities)
-- Add a comment to document this constraint
COMMENT ON COLUMN boxes.items_list IS 'Informational only - for display. Quantities are owned by order_batches, not boxes.';
COMMENT ON COLUMN extra_boxes.items_list IS 'Informational only - for display. Quantities are owned by extra_batches, not boxes.';

-- 6. Create a function to validate batch-container relationship
CREATE OR REPLACE FUNCTION check_batch_container_integrity()
RETURNS TRIGGER AS $$
DECLARE
  transitioning_states TEXT[] := ARRAY[
    'ready_for_finishing',
    'ready_for_packaging', 
    'ready_for_boxing',
    'ready_for_receiving'
  ];
BEGIN
  -- For ORDER batches in transitioning states, box_id is required
  -- (This complements the existing enforce_box_id_for_transitioning_states trigger)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS check_order_batch_container_trigger ON order_batches;
CREATE TRIGGER check_order_batch_container_trigger
BEFORE INSERT OR UPDATE ON order_batches
FOR EACH ROW
EXECUTE FUNCTION check_batch_container_integrity();

-- 7. Validate extra batch box linkage
CREATE OR REPLACE FUNCTION check_extra_batch_box_integrity()
RETURNS TRIGGER AS $$
BEGIN
  -- Verify extra_box exists if assigned
  IF NEW.box_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM extra_boxes WHERE id = NEW.box_id AND is_active = true) THEN
      RAISE EXCEPTION 'Invalid or inactive extra_box_id: %', NEW.box_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS check_extra_batch_box_trigger ON extra_batches;
CREATE TRIGGER check_extra_batch_box_trigger
BEFORE INSERT OR UPDATE ON extra_batches
FOR EACH ROW
EXECUTE FUNCTION check_extra_batch_box_integrity();