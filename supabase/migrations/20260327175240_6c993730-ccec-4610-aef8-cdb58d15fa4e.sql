
-- Add name_ar and image_url to categories
ALTER TABLE public.categories ADD COLUMN name_ar text;
ALTER TABLE public.categories ADD COLUMN image_url text;

-- Rename categories.name to name_en for consistency
ALTER TABLE public.categories RENAME COLUMN name TO name_en;

-- Add description to brands
ALTER TABLE public.brands ADD COLUMN description text;

-- Add image_url to brands (separate from logo_url, but we'll use image_url for the upload)
-- Actually brands already have logo_url, let's keep that as the image field
