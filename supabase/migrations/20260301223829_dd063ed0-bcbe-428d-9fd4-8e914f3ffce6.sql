
-- Create storage bucket for raw material images
INSERT INTO storage.buckets (id, name, public) VALUES ('raw-material-images', 'raw-material-images', true);

-- Storage policies
CREATE POLICY "Anyone can view raw material images"
ON storage.objects FOR SELECT
USING (bucket_id = 'raw-material-images');

CREATE POLICY "Authenticated users can upload raw material images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'raw-material-images' AND auth.role() = 'authenticated');

CREATE POLICY "Users can delete their own raw material images"
ON storage.objects FOR DELETE
USING (bucket_id = 'raw-material-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Add images column to raw_material_versions
ALTER TABLE public.raw_material_versions ADD COLUMN images jsonb DEFAULT '[]'::jsonb;
