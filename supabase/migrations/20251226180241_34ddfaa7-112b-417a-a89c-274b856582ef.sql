-- Allow multiple active ORDER/EXTRA batches to share the same physical box
-- (boxes now store multi-item contents in boxes.items_list)
DROP INDEX IF EXISTS public.unique_active_batch_per_box;