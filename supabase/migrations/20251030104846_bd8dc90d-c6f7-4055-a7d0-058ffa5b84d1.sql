-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM (
  'manufacture_lead',
  'manufacturer', 
  'packaging_manager',
  'packer',
  'boxing_manager',
  'boxer',
  'qc',
  'admin',
  'viewer'
);

-- Create enum for unit states
CREATE TYPE public.unit_state AS ENUM (
  'waiting_for_rm',
  'in_manufacturing',
  'manufactured',
  'waiting_for_pm',
  'in_packaging',
  'packaged',
  'waiting_for_bm',
  'in_boxing',
  'boxed',
  'qced',
  'finished'
);

-- Create profiles table (linked to auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create trigger to auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email)
  );
  RETURN new;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Products table (110 products)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  lead_time_days INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_products_sku ON public.products(sku);

-- Raw materials table
CREATE TABLE public.raw_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.raw_materials ENABLE ROW LEVEL SECURITY;

-- Bill of Materials (BOM) mapping
CREATE TABLE public.product_bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  raw_material_id UUID REFERENCES public.raw_materials(id) ON DELETE CASCADE NOT NULL,
  quantity NUMERIC NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.product_bom ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_product_bom_product ON public.product_bom(product_id);

-- Orders table
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'waiting_for_rm',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_by ON public.orders(created_by);

-- Order items (line items)
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_order_items_order ON public.order_items(order_id);

-- Units table (per-unit tracking)
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  serial_no TEXT,
  state unit_state NOT NULL DEFAULT 'waiting_for_rm',
  assigned_to UUID REFERENCES auth.users(id),
  qr_code_data TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  version INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_units_state ON public.units(state);
CREATE INDEX idx_units_order ON public.units(order_id);
CREATE INDEX idx_units_order_item ON public.units(order_item_id);
CREATE INDEX idx_units_assigned_to ON public.units(assigned_to);

-- Unit history (audit trail)
CREATE TABLE public.unit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  prev_state TEXT,
  new_state TEXT NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  reason TEXT,
  eta TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.unit_history ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_unit_history_unit ON public.unit_history(unit_id, created_at DESC);

-- Unit stage ETA tracking
CREATE TABLE public.unit_stage_eta (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  stage TEXT NOT NULL,
  started_by UUID REFERENCES auth.users(id),
  eta TIMESTAMPTZ NOT NULL,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.unit_stage_eta ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_unit_stage_eta_unit ON public.unit_stage_eta(unit_id);
CREATE INDEX idx_unit_stage_eta_check ON public.unit_stage_eta(eta, notified) WHERE notified = false;

-- Raw material receipts
CREATE TABLE public.raw_material_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ DEFAULT now(),
  details JSONB DEFAULT '{}'::jsonb
);

ALTER TABLE public.raw_material_receipts ENABLE ROW LEVEL SECURITY;

-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_role app_role,
  target_user UUID REFERENCES auth.users(id),
  message TEXT NOT NULL,
  order_id UUID REFERENCES public.orders(id),
  unit_ids UUID[],
  type TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_notifications_target_user ON public.notifications(target_user, is_read, created_at DESC);
CREATE INDEX idx_notifications_target_role ON public.notifications(target_role, is_read, created_at DESC);

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.units;
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for products (read by all authenticated)
CREATE POLICY "Authenticated users can view products"
  ON public.products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage products"
  ON public.products FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for raw_materials
CREATE POLICY "Authenticated users can view raw materials"
  ON public.raw_materials FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage raw materials"
  ON public.raw_materials FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for product_bom
CREATE POLICY "Authenticated users can view BOM"
  ON public.product_bom FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage BOM"
  ON public.product_bom FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for orders
CREATE POLICY "Authenticated users can view orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Manufacture leads can create orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manufacture_lead') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Leads and admins can update orders"
  ON public.orders FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'manufacture_lead') OR 
    public.has_role(auth.uid(), 'admin')
  );

-- RLS Policies for order_items
CREATE POLICY "Authenticated users can view order items"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Leads can manage order items"
  ON public.order_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'manufacture_lead') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for units (complex - based on roles and states)
CREATE POLICY "Authenticated users can view units"
  ON public.units FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Leads can create units"
  ON public.units FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'manufacture_lead') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Role-based unit updates"
  ON public.units FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'manufacturer') OR
    public.has_role(auth.uid(), 'packer') OR
    public.has_role(auth.uid(), 'packaging_manager') OR
    public.has_role(auth.uid(), 'boxing_manager') OR
    public.has_role(auth.uid(), 'boxer') OR
    public.has_role(auth.uid(), 'qc')
  );

-- RLS Policies for unit_history
CREATE POLICY "Authenticated users can view unit history"
  ON public.unit_history FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert unit history"
  ON public.unit_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = changed_by);

-- RLS Policies for unit_stage_eta
CREATE POLICY "Authenticated users can view ETAs"
  ON public.unit_stage_eta FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create ETAs"
  ON public.unit_stage_eta FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = started_by);

CREATE POLICY "Authenticated users can update own ETAs"
  ON public.unit_stage_eta FOR UPDATE
  TO authenticated
  USING (auth.uid() = started_by OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for raw_material_receipts
CREATE POLICY "Authenticated users can view receipts"
  ON public.raw_material_receipts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Leads and admins can manage receipts"
  ON public.raw_material_receipts FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'manufacture_lead') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for notifications
CREATE POLICY "Users can view their notifications"
  ON public.notifications FOR SELECT
  TO authenticated
  USING (
    auth.uid() = target_user OR
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role = target_role
    )
  );

CREATE POLICY "Users can update their notifications"
  ON public.notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = target_user);

CREATE POLICY "System can create notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger to update updated_at timestamp on units
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_units_updated_at
  BEFORE UPDATE ON public.units
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();