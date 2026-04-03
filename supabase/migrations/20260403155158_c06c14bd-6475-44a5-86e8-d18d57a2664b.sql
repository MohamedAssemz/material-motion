
CREATE TABLE public.order_activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  action text NOT NULL,
  performed_by uuid NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.order_activity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activity logs"
  ON public.order_activity_logs FOR SELECT
  USING (true);

CREATE POLICY "Admins and managers can insert activity logs"
  ON public.order_activity_logs FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'manufacturing_manager'::app_role) OR
    has_role(auth.uid(), 'finishing_manager'::app_role) OR
    has_role(auth.uid(), 'packaging_manager'::app_role) OR
    has_role(auth.uid(), 'boxing_manager'::app_role)
  );

CREATE INDEX idx_order_activity_logs_order_id ON public.order_activity_logs(order_id);
CREATE INDEX idx_order_activity_logs_created_at ON public.order_activity_logs(created_at);
