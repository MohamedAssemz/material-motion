-- Create extra_batch_history table to track all extra batch movements
CREATE TABLE public.extra_batch_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  extra_batch_id UUID REFERENCES public.extra_batches(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('CREATED', 'RESERVED', 'CONSUMED', 'RELEASED')),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  from_state TEXT, -- The state items were moved from (e.g., 'in_manufacturing')
  
  -- Source tracking (for CREATED events)
  source_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  source_order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  
  -- Consumer tracking (for RESERVED/CONSUMED events)
  consuming_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  consuming_order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  
  performed_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.extra_batch_history ENABLE ROW LEVEL SECURITY;

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.extra_batch_history;

-- Indexes for efficient querying
CREATE INDEX idx_ebh_source_order ON public.extra_batch_history(source_order_id) 
  WHERE source_order_id IS NOT NULL;
CREATE INDEX idx_ebh_from_state ON public.extra_batch_history(from_state) 
  WHERE from_state IS NOT NULL;
CREATE INDEX idx_ebh_batch ON public.extra_batch_history(extra_batch_id);
CREATE INDEX idx_ebh_consuming_order ON public.extra_batch_history(consuming_order_id) 
  WHERE consuming_order_id IS NOT NULL;

-- RLS policies
CREATE POLICY "Users can view extra batch history" 
  ON public.extra_batch_history FOR SELECT USING (true);

CREATE POLICY "Users can insert extra batch history" 
  ON public.extra_batch_history FOR INSERT WITH CHECK (true);

-- Remove source columns from extra_batches (now tracked in history)
ALTER TABLE public.extra_batches DROP COLUMN source_order_id;
ALTER TABLE public.extra_batches DROP COLUMN source_order_item_id;

-- Add comments for documentation
COMMENT ON TABLE public.extra_batch_history IS 'Tracks the complete lifecycle of extra batches including creation, reservation, and consumption';
COMMENT ON COLUMN public.extra_batch_history.from_state IS 'The production state items were moved from (e.g., in_manufacturing, in_finishing)';
COMMENT ON COLUMN public.extra_batch_history.source_order_id IS 'The order this extra batch was originally created from';
COMMENT ON COLUMN public.extra_batch_history.consuming_order_id IS 'The order that reserved or consumed this extra batch';