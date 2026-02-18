-- Fix unrestricted notification INSERT policy
-- Drop the overly permissive policy and replace with admin-only
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;

CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
