ALTER TABLE public.orders DROP CONSTRAINT orders_priority_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_priority_check CHECK (priority IN ('low', 'normal', 'high'));