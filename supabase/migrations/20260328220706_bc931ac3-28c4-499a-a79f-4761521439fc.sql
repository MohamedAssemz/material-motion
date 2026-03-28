
CREATE TABLE public.order_item_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  order_item_id uuid NOT NULL,
  phase text NOT NULL,
  marked_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (order_id, order_item_id, phase)
);

ALTER TABLE public.order_item_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view order item progress"
  ON public.order_item_progress FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage order item progress"
  ON public.order_item_progress FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Manufacturing managers can manage manufacturing progress"
  ON public.order_item_progress FOR ALL
  USING (has_role(auth.uid(), 'manufacturing_manager'::app_role) AND phase = 'manufacturing');

CREATE POLICY "Finishing managers can manage finishing progress"
  ON public.order_item_progress FOR ALL
  USING (has_role(auth.uid(), 'finishing_manager'::app_role) AND phase = 'finishing');

CREATE POLICY "Packaging managers can manage packaging progress"
  ON public.order_item_progress FOR ALL
  USING (has_role(auth.uid(), 'packaging_manager'::app_role) AND phase = 'packaging');

CREATE POLICY "Boxing managers can manage boxing progress"
  ON public.order_item_progress FOR ALL
  USING (has_role(auth.uid(), 'boxing_manager'::app_role) AND phase = 'boxing');
