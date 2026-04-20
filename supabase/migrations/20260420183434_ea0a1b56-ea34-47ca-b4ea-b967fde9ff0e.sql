-- Audit logs table
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  user_name text,
  user_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  module text NOT NULL,
  order_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes
CREATE INDEX idx_audit_logs_order_id_created_at ON public.audit_logs (order_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_module_created_at ON public.audit_logs (module, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user
CREATE POLICY "Authenticated users can view audit logs"
ON public.audit_logs
FOR SELECT
USING (true);

-- INSERT: admin OR any phase manager
CREATE POLICY "Admins and managers can insert audit logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'manufacturing_manager'::app_role)
  OR has_role(auth.uid(), 'finishing_manager'::app_role)
  OR has_role(auth.uid(), 'packaging_manager'::app_role)
  OR has_role(auth.uid(), 'boxing_manager'::app_role)
);

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_logs;