-- Create boxes table for permanent physical box identification
CREATE TABLE public.boxes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  box_code TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on boxes
ALTER TABLE public.boxes ENABLE ROW LEVEL SECURITY;

-- RLS policies for boxes
CREATE POLICY "Authenticated users can view boxes"
  ON public.boxes FOR SELECT
  USING (true);

CREATE POLICY "Leads and admins can manage boxes"
  ON public.boxes FOR ALL
  USING (has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create batch_type enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_type') THEN
    CREATE TYPE public.batch_type AS ENUM ('ORDER', 'EXTRA');
  END IF;
END $$;

-- Create inventory_state enum
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'inventory_state') THEN
    CREATE TYPE public.inventory_state AS ENUM ('AVAILABLE', 'RESERVED', 'CONSUMED');
  END IF;
END $$;

-- Add new columns to batches table
ALTER TABLE public.batches 
  ADD COLUMN IF NOT EXISTS box_id UUID REFERENCES public.boxes(id),
  ADD COLUMN IF NOT EXISTS batch_type TEXT NOT NULL DEFAULT 'ORDER',
  ADD COLUMN IF NOT EXISTS origin_state TEXT,
  ADD COLUMN IF NOT EXISTS inventory_state TEXT DEFAULT 'AVAILABLE',
  ADD COLUMN IF NOT EXISTS parent_batch_id_split UUID REFERENCES public.batches(id);

-- Create unique constraint: only one active batch per box
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_batch_per_box 
  ON public.batches(box_id) 
  WHERE box_id IS NOT NULL AND is_terminated = false AND (batch_type = 'ORDER' OR (batch_type = 'EXTRA' AND inventory_state = 'AVAILABLE'));

-- Create index for faster extra inventory queries
CREATE INDEX IF NOT EXISTS idx_batches_extra_available 
  ON public.batches(batch_type, inventory_state) 
  WHERE batch_type = 'EXTRA' AND inventory_state = 'AVAILABLE';

-- Create index for box lookups
CREATE INDEX IF NOT EXISTS idx_batches_box_id ON public.batches(box_id);

-- Function to generate unique box codes
CREATE OR REPLACE FUNCTION public.generate_box_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(box_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.boxes
  WHERE box_code ~ '^BOX-[0-9]+$';
  
  new_code := 'BOX-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_code;
END;
$function$;