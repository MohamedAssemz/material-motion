-- Add shipment_id to order_batches to directly reference which shipment contains this batch
ALTER TABLE public.order_batches 
ADD COLUMN shipment_id uuid REFERENCES public.shipments(id);

-- Migrate existing data from shipment_items to order_batches
UPDATE public.order_batches ob
SET shipment_id = si.shipment_id
FROM public.shipment_items si
WHERE ob.id = si.batch_id;

-- Drop the shipment_items table
DROP TABLE public.shipment_items;