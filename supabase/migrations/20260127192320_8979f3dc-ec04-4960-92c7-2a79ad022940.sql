
-- =============================================
-- CATALOG MANAGEMENT SYSTEM - DATABASE SCHEMA
-- =============================================

-- 1. Create categories table
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Create brands table
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Create product_images table
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_main BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Create product_categories junction table
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(product_id, category_id)
);

-- 5. Add new columns to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS size TEXT,
  ADD COLUMN IF NOT EXISTS color TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- 6. Create index for better query performance
CREATE INDEX idx_products_brand_id ON public.products(brand_id);
CREATE INDEX idx_products_size ON public.products(size);
CREATE INDEX idx_products_country ON public.products(country);
CREATE INDEX idx_product_images_product_id ON public.product_images(product_id);
CREATE INDEX idx_product_categories_product_id ON public.product_categories(product_id);
CREATE INDEX idx_product_categories_category_id ON public.product_categories(category_id);

-- =============================================
-- ENABLE RLS ON ALL NEW TABLES
-- =============================================

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

-- =============================================
-- RLS POLICIES - CATEGORIES
-- =============================================

CREATE POLICY "Authenticated users can view categories"
ON public.categories FOR SELECT
USING (true);

CREATE POLICY "Admins can manage categories"
ON public.categories FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS POLICIES - BRANDS
-- =============================================

CREATE POLICY "Authenticated users can view brands"
ON public.brands FOR SELECT
USING (true);

CREATE POLICY "Admins can manage brands"
ON public.brands FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS POLICIES - PRODUCT IMAGES
-- =============================================

CREATE POLICY "Authenticated users can view product images"
ON public.product_images FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product images"
ON public.product_images FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- RLS POLICIES - PRODUCT CATEGORIES
-- =============================================

CREATE POLICY "Authenticated users can view product categories"
ON public.product_categories FOR SELECT
USING (true);

CREATE POLICY "Admins can manage product categories"
ON public.product_categories FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- =============================================
-- STORAGE BUCKET FOR PRODUCT IMAGES
-- =============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Admins can upload product images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update product images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete product images"
ON storage.objects FOR DELETE
USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'));

-- =============================================
-- MIGRATE EXISTING SIZE/COLOR DATA
-- =============================================

-- Migrate size data from product_sizes to products.size
UPDATE public.products p
SET size = ps.size_name
FROM public.product_sizes ps
WHERE p.size_id = ps.id AND p.size IS NULL;

-- Migrate color data from product_colors to products.color
UPDATE public.products p
SET color = pc.color_name
FROM public.product_colors pc
WHERE p.color_id = pc.id AND p.color IS NULL;

-- =============================================
-- UPDATE product_potential_customers TO USE product_id
-- =============================================

-- Add product_id column if not exists
ALTER TABLE public.product_potential_customers
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;

-- Create index for new column
CREATE INDEX IF NOT EXISTS idx_product_potential_customers_product_id 
ON public.product_potential_customers(product_id);
