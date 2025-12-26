-- Add items_list JSONB column to boxes to track contents
-- Structure: [{ product_id, product_name, product_sku, quantity, batch_id, batch_type }]
ALTER TABLE public.boxes ADD COLUMN items_list JSONB DEFAULT '[]'::jsonb;

-- Add a content_type column to track what kind of items a box contains
-- Values: 'EMPTY', 'ORDER', 'EXTRA'
ALTER TABLE public.boxes ADD COLUMN content_type TEXT DEFAULT 'EMPTY';

-- Create index for faster queries on content type
CREATE INDEX idx_boxes_content_type ON public.boxes(content_type);

-- Add comment for documentation
COMMENT ON COLUMN public.boxes.items_list IS 'JSON array of items in the box: [{product_id, product_name, product_sku, quantity, batch_id, batch_type}]';
COMMENT ON COLUMN public.boxes.content_type IS 'Type of contents: EMPTY, ORDER, or EXTRA';