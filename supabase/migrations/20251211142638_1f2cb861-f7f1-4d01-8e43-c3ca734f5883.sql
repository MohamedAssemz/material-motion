-- Add quantity field to batches table (the smallest tracking unit)
ALTER TABLE public.batches ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_batches_order_product_state ON public.batches(order_id, product_id, current_state);