-- Fix RLS policy to allow boxing roles to update batches when transitioning TO shipped state
DROP POLICY IF EXISTS "Boxing roles can update batches in boxing states" ON public.order_batches;

CREATE POLICY "Boxing roles can update batches in boxing states"
ON public.order_batches
FOR UPDATE
USING (
  has_role(auth.uid(), 'boxing_manager'::app_role) OR has_role(auth.uid(), 'boxer'::app_role)
)
WITH CHECK (
  current_state IN ('ready_for_boxing', 'in_boxing', 'ready_for_shipment', 'shipped')
);