-- Create order_comments table for timeline-based comments
CREATE TABLE public.order_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.order_comments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view comments
CREATE POLICY "Authenticated users can view order comments"
ON public.order_comments
FOR SELECT
USING (true);

-- All authenticated users can create comments
CREATE POLICY "Authenticated users can create order comments"
ON public.order_comments
FOR INSERT
WITH CHECK (auth.uid() = created_by);

-- Create index for faster lookups by order_id
CREATE INDEX idx_order_comments_order_id ON public.order_comments(order_id);

-- Create index for sorting by created_at
CREATE INDEX idx_order_comments_created_at ON public.order_comments(created_at DESC);