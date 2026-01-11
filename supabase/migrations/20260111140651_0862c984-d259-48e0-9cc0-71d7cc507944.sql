
-- Step 1: Create the extra_boxes table for extra inventory boxes
CREATE TABLE public.extra_boxes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  box_code text NOT NULL,
  content_type text DEFAULT 'EMPTY',
  items_list jsonb DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on extra_boxes
ALTER TABLE public.extra_boxes ENABLE ROW LEVEL SECURITY;

-- RLS policies for extra_boxes
CREATE POLICY "Authenticated users can view extra boxes" ON public.extra_boxes FOR SELECT USING (true);
CREATE POLICY "Leads and admins can manage extra boxes" ON public.extra_boxes FOR ALL USING (has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Step 2: Create the extra_batches table
CREATE TABLE public.extra_batches (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES public.orders(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity integer NOT NULL DEFAULT 1,
  current_state text NOT NULL DEFAULT 'extra_manufacturing' CHECK (current_state IN ('extra_manufacturing', 'extra_finishing', 'extra_packaging', 'extra_boxing')),
  inventory_state text NOT NULL DEFAULT 'AVAILABLE' CHECK (inventory_state IN ('AVAILABLE', 'RESERVED')),
  box_id uuid REFERENCES public.extra_boxes(id),
  qr_code_data text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on extra_batches
ALTER TABLE public.extra_batches ENABLE ROW LEVEL SECURITY;

-- RLS policies for extra_batches
CREATE POLICY "Authenticated users can view extra batches" ON public.extra_batches FOR SELECT USING (true);
CREATE POLICY "Leads and admins can manage extra batches" ON public.extra_batches FOR ALL USING (has_role(auth.uid(), 'manufacture_lead'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at on extra_batches
CREATE TRIGGER update_extra_batches_updated_at
  BEFORE UPDATE ON public.extra_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Step 3: Rename batches table to order_batches
ALTER TABLE public.batches RENAME TO order_batches;

-- Step 4: Drop columns not needed in order_batches
ALTER TABLE public.order_batches DROP COLUMN IF EXISTS batch_code;
ALTER TABLE public.order_batches DROP COLUMN IF EXISTS batch_type;
ALTER TABLE public.order_batches DROP COLUMN IF EXISTS inventory_state;
ALTER TABLE public.order_batches DROP COLUMN IF EXISTS parent_batch_id;
ALTER TABLE public.order_batches DROP COLUMN IF EXISTS parent_batch_id_split;
ALTER TABLE public.order_batches DROP COLUMN IF EXISTS is_from_extra;
ALTER TABLE public.order_batches DROP COLUMN IF EXISTS flagged_at;

-- Step 5: Add constraint to current_state for order_batches
ALTER TABLE public.order_batches ADD CONSTRAINT order_batches_current_state_check 
  CHECK (current_state IN ('pending_rm', 'in_manufacturing', 'ready_for_finishing', 'in_finishing', 'ready_for_packaging', 'in_packaging', 'ready_for_boxing', 'in_boxing', 'ready_for_shipment', 'in_shipment'));

-- Step 6: Create function to generate extra batch code
CREATE OR REPLACE FUNCTION public.generate_extra_batch_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    new_code := 'EB-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
    SELECT EXISTS(SELECT 1 FROM public.extra_batches WHERE qr_code_data = new_code) INTO code_exists;
    EXIT WHEN NOT code_exists;
  END LOOP;
  RETURN new_code;
END;
$function$;

-- Step 7: Create function to generate extra box code
CREATE OR REPLACE FUNCTION public.generate_extra_box_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('generate_extra_box_code'));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(box_code FROM 6) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.extra_boxes
  WHERE box_code ~ '^EBOX-[0-9]+$';
  
  new_code := 'EBOX-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_code;
END;
$function$;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.extra_batches;
ALTER PUBLICATION supabase_realtime ADD TABLE public.extra_boxes;
