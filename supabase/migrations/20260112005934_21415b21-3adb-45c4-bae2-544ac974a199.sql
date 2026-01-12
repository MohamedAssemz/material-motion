-- Drop the triggers that modify order_items.quantity
-- These triggers violate the business rule that order_items are immutable

DROP TRIGGER IF EXISTS sync_order_item_quantity_trigger ON order_batches;
DROP TRIGGER IF EXISTS sync_order_item_from_extra_trigger ON extra_batches;

-- Drop the functions with CASCADE since they have dependencies
DROP FUNCTION IF EXISTS sync_order_item_quantity() CASCADE;
DROP FUNCTION IF EXISTS sync_order_item_quantity_from_extra() CASCADE;