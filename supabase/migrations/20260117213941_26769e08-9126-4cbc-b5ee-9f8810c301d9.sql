-- Add source tracking columns to extra_batches
-- These track where the extra batch originated from (order movement)
-- Separate from order_id/order_item_id which track reservation status

ALTER TABLE public.extra_batches 
ADD COLUMN source_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
ADD COLUMN source_order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL;

-- Add index for querying by source order
CREATE INDEX idx_extra_batches_source_order ON public.extra_batches(source_order_id) WHERE source_order_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.extra_batches.source_order_id IS 'The order this extra batch was originally created from (for traceability)';
COMMENT ON COLUMN public.extra_batches.source_order_item_id IS 'The order item this extra batch was originally created from (for traceability)';