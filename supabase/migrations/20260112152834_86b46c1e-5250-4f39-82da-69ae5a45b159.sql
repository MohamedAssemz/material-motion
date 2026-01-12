-- Update RLS policy to use correct state names
DROP POLICY IF EXISTS "Boxing roles can update batches in boxing states" ON public.order_batches;
DROP POLICY IF EXISTS "Boxing roles can insert batches during boxing" ON public.order_batches;

CREATE POLICY "Boxing roles can update batches in boxing states"
ON public.order_batches
FOR UPDATE
USING (
  (has_role(auth.uid(), 'boxing_manager'::app_role) OR has_role(auth.uid(), 'boxer'::app_role))
  AND current_state IN ('ready_for_boxing', 'in_boxing', 'ready_for_shipment')
);

CREATE POLICY "Boxing roles can insert batches during boxing"
ON public.order_batches
FOR INSERT
WITH CHECK (
  (has_role(auth.uid(), 'boxing_manager'::app_role) OR has_role(auth.uid(), 'boxer'::app_role))
  AND current_state IN ('ready_for_shipment', 'shipped')
);