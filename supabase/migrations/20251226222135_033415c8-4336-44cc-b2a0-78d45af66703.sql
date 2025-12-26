-- Add order_item_id to batches table to preserve order item identity
-- This is critical: same product with different needs_boxing must remain separate

ALTER TABLE public.batches 
ADD COLUMN order_item_id uuid REFERENCES public.order_items(id);

-- Create index for efficient lookups
CREATE INDEX idx_batches_order_item_id ON public.batches(order_item_id);

-- Add comment explaining the importance
COMMENT ON COLUMN public.batches.order_item_id IS 'Links batch to specific order item. Critical for preserving order item identity - same product with different needs_boxing flags must remain separate.';