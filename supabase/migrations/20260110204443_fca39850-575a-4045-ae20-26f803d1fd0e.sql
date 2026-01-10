-- Remove the origin_state column from batches table
ALTER TABLE public.batches DROP COLUMN IF EXISTS origin_state;