
-- Feature 1: Auto-generated sequential order number
-- Add a reference_number field for user-provided order references
ALTER TABLE public.orders ADD COLUMN reference_number text;

-- Create a function to generate sequential order numbers
CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('generate_order_number'));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.orders
  WHERE order_number ~ '^ORD-[0-9]+$';
  
  new_code := 'ORD-' || LPAD(next_num::TEXT, 5, '0');
  RETURN new_code;
END;
$$;

-- Feature 2: Storehouse field for extra_boxes
ALTER TABLE public.extra_boxes ADD COLUMN storehouse integer NOT NULL DEFAULT 1;
