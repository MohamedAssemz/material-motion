CREATE TABLE public.storehouses (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view storehouses"
  ON public.storehouses FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage storehouses"
  ON public.storehouses FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_storehouses_updated_at
BEFORE UPDATE ON public.storehouses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed existing storehouses (use explicit IDs to match existing extra_boxes.storehouse values)
INSERT INTO public.storehouses (id, name, sort_order)
OVERRIDING SYSTEM VALUE
VALUES (1, 'Storehouse 1', 1), (2, 'Storehouse 2', 2);

-- Reset identity to continue after seeded values
SELECT setval(pg_get_serial_sequence('public.storehouses', 'id'), 2, true);