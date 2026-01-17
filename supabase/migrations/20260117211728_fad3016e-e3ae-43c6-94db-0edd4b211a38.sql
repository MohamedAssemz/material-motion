-- Add deducted_to_extra column to order_items table to track quantities moved to extra inventory
-- This preserves the original quantity while tracking deductions separately
ALTER TABLE public.order_items 
ADD COLUMN IF NOT EXISTS deducted_to_extra integer NOT NULL DEFAULT 0;

-- Add comment explaining the purpose
COMMENT ON COLUMN public.order_items.deducted_to_extra IS 'Quantity of items moved from this order item to extra inventory. Effective quantity = quantity - deducted_to_extra';

-- Add constraint to ensure deducted_to_extra never exceeds original quantity
ALTER TABLE public.order_items
ADD CONSTRAINT check_deducted_to_extra_valid CHECK (deducted_to_extra >= 0 AND deducted_to_extra <= quantity);