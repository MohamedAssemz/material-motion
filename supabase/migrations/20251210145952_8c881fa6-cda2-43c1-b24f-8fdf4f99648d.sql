-- Add delete policy for orders
CREATE POLICY "Leads and admins can delete orders" 
ON public.orders 
FOR DELETE 
USING (has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));