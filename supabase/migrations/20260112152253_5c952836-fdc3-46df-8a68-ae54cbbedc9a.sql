-- Add RLS policy to allow boxing roles to insert order_batches (for batch splitting)
CREATE POLICY "Boxing roles can insert batches during boxing"
ON public.order_batches
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'boxing_manager'::app_role) OR has_role(auth.uid(), 'boxer'::app_role))
  AND current_state IN ('ready_for_receiving', 'received')
);