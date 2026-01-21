-- Add machine tracking columns for finishing, packaging, and boxing phases
ALTER TABLE order_batches
ADD COLUMN finishing_machine_id UUID REFERENCES machines(id),
ADD COLUMN packaging_machine_id UUID REFERENCES machines(id),
ADD COLUMN boxing_machine_id UUID REFERENCES machines(id);