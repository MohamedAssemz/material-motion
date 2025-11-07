-- Update unit states to include new stages
ALTER TYPE unit_state ADD VALUE IF NOT EXISTS 'waiting_for_receiving';
ALTER TYPE unit_state ADD VALUE IF NOT EXISTS 'received';
ALTER TYPE unit_state ADD VALUE IF NOT EXISTS 'finished';

-- Remove lead_time_days from products table
ALTER TABLE products DROP COLUMN IF EXISTS lead_time_days;

-- Add priority to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority text DEFAULT 'normal' CHECK (priority IN ('high', 'normal'));

-- Create extra_products table for surplus items
CREATE TABLE IF NOT EXISTS extra_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid REFERENCES products(id) NOT NULL,
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE extra_products ENABLE ROW LEVEL SECURITY;

-- RLS policies for extra_products
CREATE POLICY "Authenticated users can view extra products"
ON extra_products FOR SELECT
USING (true);

CREATE POLICY "Leads and admins can manage extra products"
ON extra_products FOR ALL
USING (has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for extra_products updated_at
CREATE TRIGGER update_extra_products_updated_at
  BEFORE UPDATE ON extra_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Update unit_stage_eta to store lead_time_days
ALTER TABLE unit_stage_eta ADD COLUMN IF NOT EXISTS lead_time_days integer;