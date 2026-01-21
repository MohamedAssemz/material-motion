-- Add manufacturing machine tracking to order_batches
ALTER TABLE order_batches
ADD COLUMN manufacturing_machine_id UUID REFERENCES machines(id);