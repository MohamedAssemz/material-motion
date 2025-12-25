-- Raw Material Versions table for immutable version history
CREATE TABLE public.raw_material_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shipments (Kartonas) table for sealed shipment boxes
CREATE TABLE public.shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_code TEXT NOT NULL UNIQUE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'created',
  created_by UUID REFERENCES auth.users(id),
  sealed_at TIMESTAMP WITH TIME ZONE,
  sealed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Shipment items to track what's in each shipment
CREATE TABLE public.shipment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.batches(id),
  quantity INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add shipping_type and estimated_fulfillment_time to orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS shipping_type TEXT DEFAULT 'domestic',
ADD COLUMN IF NOT EXISTS estimated_fulfillment_time TIMESTAMP WITH TIME ZONE;

-- Add flagged and redo_required fields to batches for tracking
ALTER TABLE public.batches
ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS flagged_reason TEXT,
ADD COLUMN IF NOT EXISTS flagged_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS flagged_at TIMESTAMP WITH TIME ZONE;

-- Generate shipment code function
CREATE OR REPLACE FUNCTION public.generate_shipment_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('generate_shipment_code'));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(shipment_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.shipments
  WHERE shipment_code ~ '^SHP-[0-9]+$';
  
  new_code := 'SHP-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_code;
END;
$$;

-- Enable RLS on new tables
ALTER TABLE public.raw_material_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for raw_material_versions
CREATE POLICY "Authenticated users can view raw material versions"
ON public.raw_material_versions FOR SELECT
USING (true);

CREATE POLICY "Leads and admins can manage raw material versions"
ON public.raw_material_versions FOR ALL
USING (has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for shipments
CREATE POLICY "Authenticated users can view shipments"
ON public.shipments FOR SELECT
USING (true);

CREATE POLICY "Boxing managers and admins can manage shipments"
ON public.shipments FOR ALL
USING (has_role(auth.uid(), 'boxing_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for shipment_items
CREATE POLICY "Authenticated users can view shipment items"
ON public.shipment_items FOR SELECT
USING (true);

CREATE POLICY "Boxing managers and admins can manage shipment items"
ON public.shipment_items FOR ALL
USING (has_role(auth.uid(), 'boxing_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create indexes for performance
CREATE INDEX idx_raw_material_versions_order_id ON public.raw_material_versions(order_id);
CREATE INDEX idx_shipments_order_id ON public.shipments(order_id);
CREATE INDEX idx_shipment_items_shipment_id ON public.shipment_items(shipment_id);
CREATE INDEX idx_batches_is_flagged ON public.batches(is_flagged) WHERE is_flagged = true;