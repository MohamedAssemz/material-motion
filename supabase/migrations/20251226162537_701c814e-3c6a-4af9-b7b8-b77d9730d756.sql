-- Create parent_products table for base product definitions
CREATE TABLE public.parent_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  parent_sku TEXT NOT NULL UNIQUE,
  needs_packing BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create product_sizes table for size options
CREATE TABLE public.product_sizes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id UUID NOT NULL REFERENCES public.parent_products(id) ON DELETE CASCADE,
  size_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(parent_product_id, size_name)
);

-- Create product_colors table for color options
CREATE TABLE public.product_colors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id UUID NOT NULL REFERENCES public.parent_products(id) ON DELETE CASCADE,
  color_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(parent_product_id, color_name)
);

-- Create product_potential_customers junction table
CREATE TABLE public.product_potential_customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_product_id UUID NOT NULL REFERENCES public.parent_products(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(parent_product_id, customer_id)
);

-- Add parent_product_id reference to products table for variant tracking
ALTER TABLE public.products ADD COLUMN parent_product_id UUID REFERENCES public.parent_products(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN size_id UUID REFERENCES public.product_sizes(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD COLUMN color_id UUID REFERENCES public.product_colors(id) ON DELETE SET NULL;

-- Enable RLS on all new tables
ALTER TABLE public.parent_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_colors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_potential_customers ENABLE ROW LEVEL SECURITY;

-- RLS policies for parent_products
CREATE POLICY "Authenticated users can view parent products"
ON public.parent_products FOR SELECT
USING (true);

CREATE POLICY "Admins can manage parent products"
ON public.parent_products FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for product_sizes
CREATE POLICY "Authenticated users can view product sizes"
ON public.product_sizes FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product sizes"
ON public.product_sizes FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for product_colors
CREATE POLICY "Authenticated users can view product colors"
ON public.product_colors FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product colors"
ON public.product_colors FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- RLS policies for product_potential_customers
CREATE POLICY "Authenticated users can view product potential customers"
ON public.product_potential_customers FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product potential customers"
ON public.product_potential_customers FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Function to generate parent SKU
CREATE OR REPLACE FUNCTION public.generate_parent_sku()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  new_sku TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('generate_parent_sku'));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(parent_sku FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.parent_products
  WHERE parent_sku ~ '^SKU-[0-9]+$';
  
  new_sku := 'SKU-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_sku;
END;
$$;