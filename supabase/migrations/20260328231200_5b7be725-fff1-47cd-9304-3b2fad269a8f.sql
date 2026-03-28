
CREATE TABLE public.shipping_cartons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  length_cm NUMERIC NOT NULL DEFAULT 0,
  width_cm NUMERIC NOT NULL DEFAULT 0,
  height_cm NUMERIC NOT NULL DEFAULT 0,
  weight_kg NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shipping_cartons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage shipping cartons" ON public.shipping_cartons FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view shipping cartons" ON public.shipping_cartons FOR SELECT USING (true);

INSERT INTO public.shipping_cartons (name, length_cm, width_cm, height_cm) VALUES ('Small', 66, 28.5, 33);
