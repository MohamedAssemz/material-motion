-- First, update the validate_order_batch function to require order_item_id
CREATE OR REPLACE FUNCTION public.validate_order_batch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Rule: Order batches must have a valid order_id
  IF NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'Order batch must belong to an order (order_id cannot be null)';
  END IF;
  
  -- Rule: Order batches must have a valid order_item_id
  IF NEW.order_item_id IS NULL THEN
    RAISE EXCEPTION 'Order batch must be linked to an order item (order_item_id cannot be null)';
  END IF;
  
  -- Rule: Quantity must be positive
  IF NEW.quantity <= 0 THEN
    RAISE EXCEPTION 'Batch quantity must be greater than 0';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS validate_order_batch_trigger ON order_batches;
CREATE TRIGGER validate_order_batch_trigger
  BEFORE INSERT OR UPDATE ON order_batches
  FOR EACH ROW
  EXECUTE FUNCTION validate_order_batch();