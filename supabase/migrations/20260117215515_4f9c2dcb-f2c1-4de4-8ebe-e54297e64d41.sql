-- Fix RLS policy to be more restrictive
DROP POLICY IF EXISTS "Users can insert extra batch history" ON public.extra_batch_history;

CREATE POLICY "Leads and admins can insert extra batch history" 
  ON public.extra_batch_history FOR INSERT 
  WITH CHECK (
    has_role(auth.uid(), 'manufacture_lead'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );