-- Add minimum_quantity to products (informational only)
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS minimum_quantity integer NOT NULL DEFAULT 0;

-- Backfill missing/empty sizes on extra_batches from origin order_items via history
UPDATE public.extra_batches eb
SET size = oi.size
FROM (
  SELECT DISTINCT ON (h.extra_batch_id)
    h.extra_batch_id, h.source_order_item_id
  FROM public.extra_batch_history h
  WHERE h.source_order_item_id IS NOT NULL
  ORDER BY h.extra_batch_id, h.created_at ASC
) src
JOIN public.order_items oi ON oi.id = src.source_order_item_id
WHERE eb.id = src.extra_batch_id
  AND (eb.size IS NULL OR eb.size = '')
  AND oi.size IS NOT NULL
  AND oi.size <> '';