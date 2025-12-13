-- Add needs_packing flag to products table
ALTER TABLE public.products ADD COLUMN needs_packing boolean DEFAULT true;

-- Add flags to batches table for redo/termination tracking
ALTER TABLE public.batches ADD COLUMN is_redo boolean DEFAULT false;
ALTER TABLE public.batches ADD COLUMN is_terminated boolean DEFAULT false;
ALTER TABLE public.batches ADD COLUMN redo_reason text;
ALTER TABLE public.batches ADD COLUMN terminated_reason text;
ALTER TABLE public.batches ADD COLUMN terminated_by uuid REFERENCES auth.users(id);
ALTER TABLE public.batches ADD COLUMN redo_by uuid REFERENCES auth.users(id);

-- Add global counters to orders table
ALTER TABLE public.orders ADD COLUMN termination_counter integer DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN redo_counter integer DEFAULT 0;

-- Create index for analytics queries
CREATE INDEX idx_batches_redo ON public.batches(is_redo) WHERE is_redo = true;
CREATE INDEX idx_batches_terminated ON public.batches(is_terminated) WHERE is_terminated = true;
CREATE INDEX idx_machine_production_created ON public.machine_production(created_at);
CREATE INDEX idx_batches_eta ON public.batches(eta) WHERE eta IS NOT NULL;