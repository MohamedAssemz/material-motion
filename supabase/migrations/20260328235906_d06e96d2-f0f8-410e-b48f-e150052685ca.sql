
CREATE TABLE public.product_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sizes" ON public.product_sizes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sizes" ON public.product_sizes
  FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.product_sizes (label, sort_order) VALUES
  ('XXS', 1), ('XS', 2), ('S', 3), ('M', 4), ('L', 5), ('XL', 6),
  ('2XL', 7), ('3XL', 8), ('4XL', 9), ('5XL', 10), ('6XL', 11),
  ('5cm', 12), ('6cm', 13), ('7.5cm', 14), ('8cm', 15), ('10cm', 16),
  ('12cm', 17), ('15cm', 18), ('20cm', 19),
  ('Size 3', 20), ('Size 4', 21), ('Size 5', 22), ('Size 6', 23),
  ('Size 7', 24), ('Size 8', 25), ('Size 9', 26), ('Size 10', 27),
  ('Kids', 28), ('Family', 29), ('One Size', 30);
