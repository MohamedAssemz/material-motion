
-- Add optional dimension/weight columns to shipments table
ALTER TABLE public.shipments ADD COLUMN length_cm numeric NULL;
ALTER TABLE public.shipments ADD COLUMN width_cm numeric NULL;
ALTER TABLE public.shipments ADD COLUMN height_cm numeric NULL;
ALTER TABLE public.shipments ADD COLUMN weight_kg numeric NULL;
