-- Add needs_boxing column to order_items table
-- This is a per-order-item decision (some items in an order may need boxing, others may not)
ALTER TABLE public.order_items 
ADD COLUMN needs_boxing BOOLEAN NOT NULL DEFAULT true;