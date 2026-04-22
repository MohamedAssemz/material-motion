ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_quantity_check;
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS check_deducted_to_extra_valid;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_nonnegative CHECK (quantity >= 0);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_deducted_nonnegative CHECK (deducted_to_extra >= 0);