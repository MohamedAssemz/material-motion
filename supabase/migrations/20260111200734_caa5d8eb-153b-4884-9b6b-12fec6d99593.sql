-- Add order_item_id to extra_batches to properly track which order item the reserved batch fulfills
ALTER TABLE public.extra_batches 
ADD COLUMN order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL;

-- Update the validate_extra_batch trigger to require order_item_id when RESERVED
CREATE OR REPLACE FUNCTION public.validate_extra_batch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Rule: Extra batches MUST have a box_id (cannot exist without an EBox container)
  IF NEW.box_id IS NULL THEN
    RAISE EXCEPTION 'Extra batch must be assigned to an extra box (box_id cannot be null)';
  END IF;

  -- Rule: Extra batches CANNOT have an order_id when inventory_state is AVAILABLE
  IF NEW.inventory_state = 'AVAILABLE' AND NEW.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'Available extra batches cannot be linked to an order';
  END IF;
  
  -- Rule: Reserved extra batches MUST have an order_id AND order_item_id
  IF NEW.inventory_state = 'RESERVED' THEN
    IF NEW.order_id IS NULL THEN
      RAISE EXCEPTION 'Reserved extra batches must be linked to an order';
    END IF;
    IF NEW.order_item_id IS NULL THEN
      RAISE EXCEPTION 'Reserved extra batches must be linked to an order item';
    END IF;
  END IF;
  
  -- Rule: AVAILABLE batches must NOT have order_item_id
  IF NEW.inventory_state = 'AVAILABLE' AND NEW.order_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'Available extra batches cannot be linked to an order item';
  END IF;
  
  -- Rule: Quantity must be positive
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Extra batch quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update sync_order_item_quantity to include RESERVED extra batches
CREATE OR REPLACE FUNCTION public.sync_order_item_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_order_item_id UUID;
  new_quantity INTEGER;
  order_batches_qty INTEGER;
  extra_batches_qty INTEGER;
BEGIN
  -- Determine which order_item_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_order_item_id := OLD.order_item_id;
  ELSE
    affected_order_item_id := NEW.order_item_id;
    
    -- If order_item_id changed, also update the old one
    IF TG_OP = 'UPDATE' AND OLD.order_item_id IS DISTINCT FROM NEW.order_item_id THEN
      -- Calculate for old order item
      SELECT COALESCE(SUM(quantity), 0) INTO order_batches_qty
      FROM order_batches
      WHERE order_item_id = OLD.order_item_id
        AND is_terminated = false;
      
      SELECT COALESCE(SUM(quantity), 0) INTO extra_batches_qty
      FROM extra_batches
      WHERE order_item_id = OLD.order_item_id
        AND inventory_state = 'RESERVED';
      
      UPDATE order_items SET quantity = order_batches_qty + extra_batches_qty WHERE id = OLD.order_item_id;
    END IF;
  END IF;
  
  -- Skip if no order_item_id
  IF affected_order_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate new quantity as sum of active order batches
  SELECT COALESCE(SUM(quantity), 0) INTO order_batches_qty
  FROM order_batches
  WHERE order_item_id = affected_order_item_id
    AND is_terminated = false;
  
  -- Add reserved extra batches for this order item
  SELECT COALESCE(SUM(quantity), 0) INTO extra_batches_qty
  FROM extra_batches
  WHERE order_item_id = affected_order_item_id
    AND inventory_state = 'RESERVED';
  
  -- Update order_items.quantity = order_batches + reserved extra_batches
  UPDATE order_items SET quantity = order_batches_qty + extra_batches_qty WHERE id = affected_order_item_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Create a trigger on extra_batches to also sync order_item quantity when extra batches change
CREATE OR REPLACE FUNCTION public.sync_order_item_quantity_from_extra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  affected_order_item_id UUID;
  order_batches_qty INTEGER;
  extra_batches_qty INTEGER;
BEGIN
  -- Determine which order_item_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_order_item_id := OLD.order_item_id;
  ELSE
    affected_order_item_id := NEW.order_item_id;
    
    -- If order_item_id changed, also update the old one
    IF TG_OP = 'UPDATE' AND OLD.order_item_id IS DISTINCT FROM NEW.order_item_id AND OLD.order_item_id IS NOT NULL THEN
      SELECT COALESCE(SUM(quantity), 0) INTO order_batches_qty
      FROM order_batches
      WHERE order_item_id = OLD.order_item_id
        AND is_terminated = false;
      
      SELECT COALESCE(SUM(quantity), 0) INTO extra_batches_qty
      FROM extra_batches
      WHERE order_item_id = OLD.order_item_id
        AND inventory_state = 'RESERVED';
      
      UPDATE order_items SET quantity = order_batches_qty + extra_batches_qty WHERE id = OLD.order_item_id;
    END IF;
  END IF;
  
  -- Skip if no order_item_id
  IF affected_order_item_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Calculate quantities
  SELECT COALESCE(SUM(quantity), 0) INTO order_batches_qty
  FROM order_batches
  WHERE order_item_id = affected_order_item_id
    AND is_terminated = false;
  
  SELECT COALESCE(SUM(quantity), 0) INTO extra_batches_qty
  FROM extra_batches
  WHERE order_item_id = affected_order_item_id
    AND inventory_state = 'RESERVED';
  
  UPDATE order_items SET quantity = order_batches_qty + extra_batches_qty WHERE id = affected_order_item_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Create trigger on extra_batches
DROP TRIGGER IF EXISTS sync_order_item_from_extra_trigger ON extra_batches;
CREATE TRIGGER sync_order_item_from_extra_trigger
AFTER INSERT OR UPDATE OR DELETE ON extra_batches
FOR EACH ROW
EXECUTE FUNCTION sync_order_item_quantity_from_extra();