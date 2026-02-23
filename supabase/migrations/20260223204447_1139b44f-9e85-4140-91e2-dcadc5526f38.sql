
-- Add machine tracking columns to extra_batches (mirrors order_batches)
ALTER TABLE public.extra_batches
  ADD COLUMN manufacturing_machine_id uuid REFERENCES public.machines(id),
  ADD COLUMN finishing_machine_id uuid REFERENCES public.machines(id),
  ADD COLUMN packaging_machine_id uuid REFERENCES public.machines(id),
  ADD COLUMN boxing_machine_id uuid REFERENCES public.machines(id);
