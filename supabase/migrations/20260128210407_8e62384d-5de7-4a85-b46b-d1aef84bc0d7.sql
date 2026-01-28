-- Allow anonymous users to view boxes (for public box lookup)
CREATE POLICY "Public can view boxes"
  ON public.boxes FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view extra boxes
CREATE POLICY "Public can view extra boxes"
  ON public.extra_boxes FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view shipments  
CREATE POLICY "Public can view shipments"
  ON public.shipments FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view order batches
CREATE POLICY "Public can view order batches"
  ON public.order_batches FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view extra batches
CREATE POLICY "Public can view extra batches"
  ON public.extra_batches FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view products
CREATE POLICY "Public can view products"
  ON public.products FOR SELECT
  TO anon
  USING (true);

-- Also add policies for batch lookup page support
-- Allow anonymous users to view orders (for batch lookup)
CREATE POLICY "Public can view orders"
  ON public.orders FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view units (for batch lookup)
CREATE POLICY "Public can view units"
  ON public.units FOR SELECT
  TO anon
  USING (true);