
-- Drop storage policies that depend on has_role
DROP POLICY IF EXISTS "Admins can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete product images" ON storage.objects;

-- Also check for raw-material-images storage policies
DROP POLICY IF EXISTS "Admins can upload raw material images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update raw material images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete raw material images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view product images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view raw material images" ON storage.objects;

-- Drop ALL policies on storage.objects to be safe
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
  END LOOP;
END;
$$;

-- Now drop all public schema policies
-- notifications
DROP POLICY IF EXISTS "Users can view their notifications" ON public.notifications;
DROP POLICY IF EXISTS "System can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their notifications" ON public.notifications;

-- user_roles
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- boxes
DROP POLICY IF EXISTS "Authenticated users can view boxes" ON public.boxes;
DROP POLICY IF EXISTS "Leads and admins can manage boxes" ON public.boxes;
DROP POLICY IF EXISTS "Public can view boxes" ON public.boxes;

-- brands
DROP POLICY IF EXISTS "Admins can manage brands" ON public.brands;
DROP POLICY IF EXISTS "Authenticated users can view brands" ON public.brands;

-- categories
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Authenticated users can view categories" ON public.categories;

-- extra_boxes
DROP POLICY IF EXISTS "Authenticated users can view extra boxes" ON public.extra_boxes;
DROP POLICY IF EXISTS "Leads and admins can manage extra boxes" ON public.extra_boxes;
DROP POLICY IF EXISTS "Public can view extra boxes" ON public.extra_boxes;

-- order_comments
DROP POLICY IF EXISTS "Authenticated users can create order comments" ON public.order_comments;
DROP POLICY IF EXISTS "Authenticated users can view order comments" ON public.order_comments;

-- machines
DROP POLICY IF EXISTS "Admins can manage machines" ON public.machines;
DROP POLICY IF EXISTS "Authenticated users can view machines" ON public.machines;

-- order_items
DROP POLICY IF EXISTS "Authenticated users can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Leads can manage order items" ON public.order_items;

-- units
DROP POLICY IF EXISTS "Authenticated users can view units" ON public.units;
DROP POLICY IF EXISTS "Leads can create units" ON public.units;
DROP POLICY IF EXISTS "Public can view units" ON public.units;
DROP POLICY IF EXISTS "Role-based unit updates" ON public.units;

-- shipments
DROP POLICY IF EXISTS "Authenticated users can view shipments" ON public.shipments;
DROP POLICY IF EXISTS "Boxing managers and admins can manage shipments" ON public.shipments;
DROP POLICY IF EXISTS "Public can view shipments" ON public.shipments;

-- product_bom
DROP POLICY IF EXISTS "Admins can manage BOM" ON public.product_bom;
DROP POLICY IF EXISTS "Authenticated users can view BOM" ON public.product_bom;

-- extra_batches
DROP POLICY IF EXISTS "Authenticated users can view extra batches" ON public.extra_batches;
DROP POLICY IF EXISTS "Leads and admins can manage extra batches" ON public.extra_batches;
DROP POLICY IF EXISTS "Public can view extra batches" ON public.extra_batches;

-- product_categories
DROP POLICY IF EXISTS "Admins can manage product categories" ON public.product_categories;
DROP POLICY IF EXISTS "Authenticated users can view product categories" ON public.product_categories;

-- extra_batch_history
DROP POLICY IF EXISTS "Leads and admins can insert extra batch history" ON public.extra_batch_history;
DROP POLICY IF EXISTS "Users can view extra batch history" ON public.extra_batch_history;

-- orders
DROP POLICY IF EXISTS "Authenticated users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Leads and admins can delete orders" ON public.orders;
DROP POLICY IF EXISTS "Leads and admins can update orders" ON public.orders;
DROP POLICY IF EXISTS "Manufacture leads can create orders" ON public.orders;
DROP POLICY IF EXISTS "Public can view orders" ON public.orders;

-- customers
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;
DROP POLICY IF EXISTS "Leads and admins can manage customers" ON public.customers;

-- order_batches
DROP POLICY IF EXISTS "Authenticated users can view batches" ON public.order_batches;
DROP POLICY IF EXISTS "Boxing roles can insert batches during boxing" ON public.order_batches;
DROP POLICY IF EXISTS "Boxing roles can update batches in boxing states" ON public.order_batches;
DROP POLICY IF EXISTS "Leads and admins can manage batches" ON public.order_batches;
DROP POLICY IF EXISTS "Public can view order batches" ON public.order_batches;

-- product_sizes
DROP POLICY IF EXISTS "Admins can manage product sizes" ON public.product_sizes;
DROP POLICY IF EXISTS "Authenticated users can view product sizes" ON public.product_sizes;

-- raw_material_receipts
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON public.raw_material_receipts;
DROP POLICY IF EXISTS "Leads and admins can manage receipts" ON public.raw_material_receipts;

-- products
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;
DROP POLICY IF EXISTS "Public can view products" ON public.products;

-- raw_material_versions
DROP POLICY IF EXISTS "Authenticated users can view raw material versions" ON public.raw_material_versions;
DROP POLICY IF EXISTS "Leads and admins can manage raw material versions" ON public.raw_material_versions;

-- raw_materials
DROP POLICY IF EXISTS "Admins can manage raw materials" ON public.raw_materials;
DROP POLICY IF EXISTS "Authenticated users can view raw materials" ON public.raw_materials;

-- extra_products
DROP POLICY IF EXISTS "Authenticated users can view extra products" ON public.extra_products;
DROP POLICY IF EXISTS "Leads and admins can manage extra products" ON public.extra_products;

-- unit_history
DROP POLICY IF EXISTS "Authenticated users can insert unit history" ON public.unit_history;
DROP POLICY IF EXISTS "Authenticated users can view unit history" ON public.unit_history;

-- machine_production
DROP POLICY IF EXISTS "Authenticated users can view machine production" ON public.machine_production;
DROP POLICY IF EXISTS "Workers can record machine production" ON public.machine_production;

-- product_images
DROP POLICY IF EXISTS "Admins can manage product images" ON public.product_images;
DROP POLICY IF EXISTS "Authenticated users can view product images" ON public.product_images;

-- product_potential_customers
DROP POLICY IF EXISTS "Admins can manage product potential customers" ON public.product_potential_customers;
DROP POLICY IF EXISTS "Authenticated users can view product potential customers" ON public.product_potential_customers;

-- unit_stage_eta
DROP POLICY IF EXISTS "Authenticated users can create ETAs" ON public.unit_stage_eta;
DROP POLICY IF EXISTS "Authenticated users can update own ETAs" ON public.unit_stage_eta;
DROP POLICY IF EXISTS "Authenticated users can view ETAs" ON public.unit_stage_eta;

-- profiles
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- parent_products
DROP POLICY IF EXISTS "Admins can manage parent products" ON public.parent_products;
DROP POLICY IF EXISTS "Authenticated users can view parent products" ON public.parent_products;

-- product_colors
DROP POLICY IF EXISTS "Admins can manage product colors" ON public.product_colors;
DROP POLICY IF EXISTS "Authenticated users can view product colors" ON public.product_colors;

-- Now drop has_role function
DROP FUNCTION public.has_role(uuid, app_role);

-- Create new enum
CREATE TYPE public.app_role_new AS ENUM ('admin', 'manufacturing_manager', 'finishing_manager', 'packaging_manager', 'boxing_manager');

-- Migrate columns
ALTER TABLE public.profiles ALTER COLUMN primary_role DROP DEFAULT;
ALTER TABLE public.profiles ALTER COLUMN primary_role TYPE public.app_role_new
  USING CASE primary_role::text
    WHEN 'manufacture_lead' THEN 'manufacturing_manager'::app_role_new
    WHEN 'manufacturer' THEN 'manufacturing_manager'::app_role_new
    WHEN 'packer' THEN 'packaging_manager'::app_role_new
    WHEN 'boxer' THEN 'boxing_manager'::app_role_new
    WHEN 'qc' THEN 'manufacturing_manager'::app_role_new
    WHEN 'viewer' THEN 'manufacturing_manager'::app_role_new
    WHEN 'packaging_manager' THEN 'packaging_manager'::app_role_new
    WHEN 'boxing_manager' THEN 'boxing_manager'::app_role_new
    ELSE COALESCE(NULLIF(primary_role::text, ''), 'manufacturing_manager')::app_role_new
  END;
ALTER TABLE public.profiles ALTER COLUMN primary_role SET DEFAULT 'manufacturing_manager'::app_role_new;

ALTER TABLE public.user_roles ALTER COLUMN role TYPE public.app_role_new
  USING CASE role::text
    WHEN 'manufacture_lead' THEN 'manufacturing_manager'::app_role_new
    WHEN 'manufacturer' THEN 'manufacturing_manager'::app_role_new
    WHEN 'packer' THEN 'packaging_manager'::app_role_new
    WHEN 'boxer' THEN 'boxing_manager'::app_role_new
    WHEN 'qc' THEN 'manufacturing_manager'::app_role_new
    WHEN 'viewer' THEN 'manufacturing_manager'::app_role_new
    WHEN 'packaging_manager' THEN 'packaging_manager'::app_role_new
    WHEN 'boxing_manager' THEN 'boxing_manager'::app_role_new
    ELSE COALESCE(NULLIF(role::text, ''), 'manufacturing_manager')::app_role_new
  END;

ALTER TABLE public.notifications ALTER COLUMN target_role TYPE public.app_role_new
  USING CASE target_role::text
    WHEN 'manufacture_lead' THEN 'manufacturing_manager'::app_role_new
    WHEN 'manufacturer' THEN 'manufacturing_manager'::app_role_new
    WHEN 'packer' THEN 'packaging_manager'::app_role_new
    WHEN 'boxer' THEN 'boxing_manager'::app_role_new
    WHEN 'qc' THEN 'manufacturing_manager'::app_role_new
    WHEN 'viewer' THEN 'manufacturing_manager'::app_role_new
    WHEN 'packaging_manager' THEN 'packaging_manager'::app_role_new
    WHEN 'boxing_manager' THEN 'boxing_manager'::app_role_new
    WHEN 'admin' THEN 'admin'::app_role_new
    ELSE 'admin'::app_role_new
  END;

-- Remove duplicates
DELETE FROM public.user_roles a USING public.user_roles b WHERE a.id > b.id AND a.user_id = b.user_id AND a.role = b.role;

-- Swap enums
DROP TYPE public.app_role;
ALTER TYPE public.app_role_new RENAME TO app_role;

-- Recreate has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$function$;

-- Recreate handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, primary_role)
  VALUES (new.id, new.email, COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    COALESCE((new.raw_user_meta_data->>'primary_role')::public.app_role, 'manufacturing_manager'));
  INSERT INTO public.user_roles (user_id, role)
  VALUES (new.id, COALESCE((new.raw_user_meta_data->>'primary_role')::public.app_role, 'manufacturing_manager'));
  RETURN new;
END;
$function$;

-- Recreate notify_unit_update
CREATE OR REPLACE FUNCTION public.notify_unit_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  order_num TEXT; unit_serial TEXT;
  target_role_current app_role; target_role_next app_role;
BEGIN
  SELECT o.order_number, NEW.serial_no INTO order_num, unit_serial FROM orders o WHERE o.id = NEW.order_id;
  CASE NEW.state
    WHEN 'waiting_for_rm' THEN target_role_current := 'manufacturing_manager'; target_role_next := 'manufacturing_manager';
    WHEN 'in_manufacturing' THEN target_role_current := 'manufacturing_manager'; target_role_next := 'finishing_manager';
    WHEN 'manufactured' THEN target_role_current := 'finishing_manager'; target_role_next := 'packaging_manager';
    WHEN 'waiting_for_pm' THEN target_role_current := 'packaging_manager'; target_role_next := 'packaging_manager';
    WHEN 'in_packaging' THEN target_role_current := 'packaging_manager'; target_role_next := 'boxing_manager';
    WHEN 'waiting_for_bm' THEN target_role_current := 'boxing_manager'; target_role_next := 'boxing_manager';
    WHEN 'in_boxing' THEN target_role_current := 'boxing_manager'; target_role_next := 'admin';
    ELSE target_role_current := 'admin'; target_role_next := 'admin';
  END CASE;
  INSERT INTO notifications (target_role, order_id, unit_ids, type, message)
  VALUES (target_role_current, NEW.order_id, ARRAY[NEW.id], 'unit_update',
    'Unit ' || COALESCE(unit_serial, 'N/A') || ' in order ' || order_num || ' updated to ' || NEW.state);
  IF target_role_next IS DISTINCT FROM target_role_current THEN
    INSERT INTO notifications (target_role, order_id, unit_ids, type, message)
    VALUES (target_role_next, NEW.order_id, ARRAY[NEW.id], 'unit_ready',
      'Unit ' || COALESCE(unit_serial, 'N/A') || ' in order ' || order_num || ' is ready for ' || target_role_next);
  END IF;
  RETURN NEW;
END;
$function$;

-- Recreate ALL RLS policies with new roles

-- profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- user_roles
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- boxes
CREATE POLICY "Authenticated users can view boxes" ON public.boxes FOR SELECT USING (true);
CREATE POLICY "Admins can manage boxes" ON public.boxes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Phase managers can update boxes" ON public.boxes FOR UPDATE
  USING (has_role(auth.uid(), 'manufacturing_manager'::app_role) OR has_role(auth.uid(), 'finishing_manager'::app_role) OR has_role(auth.uid(), 'packaging_manager'::app_role) OR has_role(auth.uid(), 'boxing_manager'::app_role));

-- brands
CREATE POLICY "Admins can manage brands" ON public.brands FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view brands" ON public.brands FOR SELECT USING (true);

-- categories
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view categories" ON public.categories FOR SELECT USING (true);

-- extra_boxes
CREATE POLICY "Authenticated users can view extra boxes" ON public.extra_boxes FOR SELECT USING (true);
CREATE POLICY "Admins can manage extra boxes" ON public.extra_boxes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- order_comments
CREATE POLICY "Authenticated users can view order comments" ON public.order_comments FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create order comments" ON public.order_comments FOR INSERT WITH CHECK (auth.uid() = created_by);

-- machines
CREATE POLICY "Admins can manage machines" ON public.machines FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view machines" ON public.machines FOR SELECT USING (true);

-- order_items
CREATE POLICY "Authenticated users can view order items" ON public.order_items FOR SELECT USING (true);
CREATE POLICY "Admins can manage order items" ON public.order_items FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- units
CREATE POLICY "Authenticated users can view units" ON public.units FOR SELECT USING (true);
CREATE POLICY "Admins can create units" ON public.units FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Role-based unit updates" ON public.units FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manufacturing_manager'::app_role) OR has_role(auth.uid(), 'finishing_manager'::app_role) OR has_role(auth.uid(), 'packaging_manager'::app_role) OR has_role(auth.uid(), 'boxing_manager'::app_role));

-- shipments
CREATE POLICY "Authenticated users can view shipments" ON public.shipments FOR SELECT USING (true);
CREATE POLICY "Boxing managers and admins can manage shipments" ON public.shipments FOR ALL
  USING (has_role(auth.uid(), 'boxing_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- product_bom
CREATE POLICY "Admins can manage BOM" ON public.product_bom FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view BOM" ON public.product_bom FOR SELECT USING (true);

-- extra_batches
CREATE POLICY "Authenticated users can view extra batches" ON public.extra_batches FOR SELECT USING (true);
CREATE POLICY "Admins can manage extra batches" ON public.extra_batches FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Phase managers can update extra batches" ON public.extra_batches FOR UPDATE
  USING (has_role(auth.uid(), 'manufacturing_manager'::app_role) OR has_role(auth.uid(), 'finishing_manager'::app_role) OR has_role(auth.uid(), 'packaging_manager'::app_role) OR has_role(auth.uid(), 'boxing_manager'::app_role));

-- product_categories
CREATE POLICY "Admins can manage product categories" ON public.product_categories FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view product categories" ON public.product_categories FOR SELECT USING (true);

-- extra_batch_history
CREATE POLICY "Users can view extra batch history" ON public.extra_batch_history FOR SELECT USING (true);
CREATE POLICY "Admins and managers can insert extra batch history" ON public.extra_batch_history FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manufacturing_manager'::app_role) OR has_role(auth.uid(), 'finishing_manager'::app_role) OR has_role(auth.uid(), 'packaging_manager'::app_role) OR has_role(auth.uid(), 'boxing_manager'::app_role));

-- orders
CREATE POLICY "Authenticated users can view orders" ON public.orders FOR SELECT USING (true);
CREATE POLICY "Admins can create orders" ON public.orders FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update orders" ON public.orders FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete orders" ON public.orders FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- customers
CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Admins can manage customers" ON public.customers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- order_batches
CREATE POLICY "Authenticated users can view batches" ON public.order_batches FOR SELECT USING (true);
CREATE POLICY "Admins can manage batches" ON public.order_batches FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Boxing manager can insert batches during boxing" ON public.order_batches FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'boxing_manager'::app_role) AND current_state = ANY(ARRAY['ready_for_shipment'::text, 'shipped'::text]));
CREATE POLICY "Boxing manager can update batches in boxing states" ON public.order_batches FOR UPDATE
  USING (has_role(auth.uid(), 'boxing_manager'::app_role))
  WITH CHECK (current_state = ANY(ARRAY['ready_for_boxing'::text, 'in_boxing'::text, 'ready_for_shipment'::text, 'shipped'::text]));
CREATE POLICY "Manufacturing manager can update manufacturing batches" ON public.order_batches FOR UPDATE
  USING (has_role(auth.uid(), 'manufacturing_manager'::app_role))
  WITH CHECK (current_state = ANY(ARRAY['waiting_for_rm'::text, 'pending_rm'::text, 'in_manufacturing'::text, 'ready_for_finishing'::text]));
CREATE POLICY "Finishing manager can update finishing batches" ON public.order_batches FOR UPDATE
  USING (has_role(auth.uid(), 'finishing_manager'::app_role))
  WITH CHECK (current_state = ANY(ARRAY['ready_for_finishing'::text, 'in_finishing'::text, 'ready_for_packaging'::text]));
CREATE POLICY "Packaging manager can update packaging batches" ON public.order_batches FOR UPDATE
  USING (has_role(auth.uid(), 'packaging_manager'::app_role))
  WITH CHECK (current_state = ANY(ARRAY['ready_for_packaging'::text, 'in_packaging'::text, 'ready_for_boxing'::text]));

-- product_sizes
CREATE POLICY "Admins can manage product sizes" ON public.product_sizes FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view product sizes" ON public.product_sizes FOR SELECT USING (true);

-- raw_material_receipts
CREATE POLICY "Authenticated users can view receipts" ON public.raw_material_receipts FOR SELECT USING (true);
CREATE POLICY "Admins can manage receipts" ON public.raw_material_receipts FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- products
CREATE POLICY "Admins can manage products" ON public.products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view products" ON public.products FOR SELECT USING (true);

-- raw_material_versions
CREATE POLICY "Authenticated users can view raw material versions" ON public.raw_material_versions FOR SELECT USING (true);
CREATE POLICY "Admins can manage raw material versions" ON public.raw_material_versions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- raw_materials
CREATE POLICY "Admins can manage raw materials" ON public.raw_materials FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view raw materials" ON public.raw_materials FOR SELECT USING (true);

-- notifications
CREATE POLICY "Users can view their notifications" ON public.notifications FOR SELECT
  USING ((auth.uid() = target_user) OR EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = notifications.target_role));
CREATE POLICY "System can create notifications" ON public.notifications FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users can update their notifications" ON public.notifications FOR UPDATE USING (auth.uid() = target_user);

-- extra_products
CREATE POLICY "Authenticated users can view extra products" ON public.extra_products FOR SELECT USING (true);
CREATE POLICY "Admins can manage extra products" ON public.extra_products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- unit_history
CREATE POLICY "Authenticated users can view unit history" ON public.unit_history FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert unit history" ON public.unit_history FOR INSERT WITH CHECK (auth.uid() = changed_by);

-- machine_production
CREATE POLICY "Authenticated users can view machine production" ON public.machine_production FOR SELECT USING (true);
CREATE POLICY "Managers can record machine production" ON public.machine_production FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manufacturing_manager'::app_role) OR has_role(auth.uid(), 'finishing_manager'::app_role) OR has_role(auth.uid(), 'packaging_manager'::app_role) OR has_role(auth.uid(), 'boxing_manager'::app_role));

-- product_images
CREATE POLICY "Admins can manage product images" ON public.product_images FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view product images" ON public.product_images FOR SELECT USING (true);

-- product_potential_customers
CREATE POLICY "Admins can manage product potential customers" ON public.product_potential_customers FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view product potential customers" ON public.product_potential_customers FOR SELECT USING (true);

-- unit_stage_eta
CREATE POLICY "Authenticated users can view ETAs" ON public.unit_stage_eta FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create ETAs" ON public.unit_stage_eta FOR INSERT WITH CHECK (auth.uid() = started_by);
CREATE POLICY "Authenticated users can update own ETAs" ON public.unit_stage_eta FOR UPDATE USING ((auth.uid() = started_by) OR has_role(auth.uid(), 'admin'::app_role));

-- parent_products
CREATE POLICY "Admins can manage parent products" ON public.parent_products FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view parent products" ON public.parent_products FOR SELECT USING (true);

-- product_colors
CREATE POLICY "Admins can manage product colors" ON public.product_colors FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can view product colors" ON public.product_colors FOR SELECT USING (true);

-- Storage policies (recreate for product-images and raw-material-images)
CREATE POLICY "Anyone can view product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Admins can upload product images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update product images" ON storage.objects FOR UPDATE USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete product images" ON storage.objects FOR DELETE USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can view raw material images" ON storage.objects FOR SELECT USING (bucket_id = 'raw-material-images');
CREATE POLICY "Admins can upload raw material images" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'raw-material-images' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can update raw material images" ON storage.objects FOR UPDATE USING (bucket_id = 'raw-material-images' AND has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can delete raw material images" ON storage.objects FOR DELETE USING (bucket_id = 'raw-material-images' AND has_role(auth.uid(), 'admin'::app_role));
