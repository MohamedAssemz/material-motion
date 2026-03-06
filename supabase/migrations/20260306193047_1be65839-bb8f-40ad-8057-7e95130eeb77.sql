
-- Update default value for order_batches.current_state
ALTER TABLE public.order_batches ALTER COLUMN current_state SET DEFAULT 'in_manufacturing';

-- Update default value for orders.status
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'pending';

-- Migrate any existing pending_rm batches to in_manufacturing
UPDATE public.order_batches SET current_state = 'in_manufacturing' WHERE current_state = 'pending_rm';

-- Update manufacturing manager RLS policy to remove pending_rm/waiting_for_rm
DROP POLICY IF EXISTS "Manufacturing manager can update manufacturing batches" ON public.order_batches;
CREATE POLICY "Manufacturing manager can update manufacturing batches"
ON public.order_batches
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'manufacturing_manager'::app_role))
WITH CHECK (current_state = ANY (ARRAY['in_manufacturing'::text, 'ready_for_finishing'::text]));
