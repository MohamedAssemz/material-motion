-- Create batches table for tracking unit groups with unique codes
CREATE TABLE public.batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_code TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE NOT NULL,
  product_id UUID REFERENCES public.products(id) NOT NULL,
  current_state TEXT NOT NULL DEFAULT 'waiting_for_rm',
  eta TIMESTAMP WITH TIME ZONE,
  lead_time_days INTEGER,
  qr_code_data TEXT,
  parent_batch_id UUID REFERENCES public.batches(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add batch_id to units table
ALTER TABLE public.units ADD COLUMN batch_id UUID REFERENCES public.batches(id);

-- Add damaged tracking columns to units
ALTER TABLE public.units ADD COLUMN is_damaged BOOLEAN DEFAULT false;
ALTER TABLE public.units ADD COLUMN damage_reason TEXT;
ALTER TABLE public.units ADD COLUMN damage_action TEXT CHECK (damage_action IN ('redo', 'terminated'));
ALTER TABLE public.units ADD COLUMN damaged_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.units ADD COLUMN damaged_by UUID;
ALTER TABLE public.units ADD COLUMN original_state TEXT;

-- Create machines table for tracking production equipment
CREATE TABLE public.machines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('manufacturing', 'packaging')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create machine_production table to track output per machine
CREATE TABLE public.machine_production (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  machine_id UUID REFERENCES public.machines(id) ON DELETE CASCADE NOT NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  batch_id UUID REFERENCES public.batches(id),
  state_transition TEXT NOT NULL,
  recorded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  country TEXT,
  is_domestic BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add customer_id to orders
ALTER TABLE public.orders ADD COLUMN customer_id UUID REFERENCES public.customers(id);

-- Enable RLS on new tables
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_production ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Batches policies
CREATE POLICY "Authenticated users can view batches" ON public.batches FOR SELECT USING (true);
CREATE POLICY "Leads and admins can manage batches" ON public.batches FOR ALL USING (
  has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Machines policies
CREATE POLICY "Authenticated users can view machines" ON public.machines FOR SELECT USING (true);
CREATE POLICY "Admins can manage machines" ON public.machines FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Machine production policies
CREATE POLICY "Authenticated users can view machine production" ON public.machine_production FOR SELECT USING (true);
CREATE POLICY "Workers can record machine production" ON public.machine_production FOR INSERT WITH CHECK (
  has_role(auth.uid(), 'manufacturer'::app_role) OR 
  has_role(auth.uid(), 'packer'::app_role) OR 
  has_role(auth.uid(), 'admin'::app_role)
);

-- Customers policies
CREATE POLICY "Authenticated users can view customers" ON public.customers FOR SELECT USING (true);
CREATE POLICY "Leads and admins can manage customers" ON public.customers FOR ALL USING (
  has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role)
);

-- Function to generate unique batch code
CREATE OR REPLACE FUNCTION public.generate_batch_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'B-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    SELECT EXISTS(SELECT 1 FROM public.batches WHERE batch_code = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$$;

-- Trigger for updated_at on batches
CREATE TRIGGER update_batches_updated_at
  BEFORE UPDATE ON public.batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Enable realtime for batches
ALTER PUBLICATION supabase_realtime ADD TABLE public.batches;