-- Fix generate_box_code to handle concurrent inserts with advisory lock
CREATE OR REPLACE FUNCTION public.generate_box_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_num INTEGER;
  new_code TEXT;
BEGIN
  -- Use advisory lock to prevent concurrent issues
  PERFORM pg_advisory_xact_lock(hashtext('generate_box_code'));
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(box_code FROM 5) AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.boxes
  WHERE box_code ~ '^BOX-[0-9]+$';
  
  new_code := 'BOX-' || LPAD(next_num::TEXT, 4, '0');
  RETURN new_code;
END;
$function$;

-- Make order_id nullable for EXTRA batch types
ALTER TABLE public.batches ALTER COLUMN order_id DROP NOT NULL;

-- Add constraint to ensure ORDER batches have order_id
ALTER TABLE public.batches ADD CONSTRAINT batches_order_id_required_for_orders
  CHECK (batch_type = 'EXTRA' OR order_id IS NOT NULL);

-- Update batches current_state text values to match new states
UPDATE public.batches SET current_state = 
  CASE current_state
    WHEN 'waiting_for_rm' THEN 'pending_rm'
    WHEN 'manufactured' THEN 'ready_for_finishing'
    WHEN 'waiting_for_pm' THEN 'ready_for_packaging'
    WHEN 'packaged' THEN 'ready_for_boxing'
    WHEN 'waiting_for_bm' THEN 'ready_for_boxing'
    WHEN 'boxed' THEN 'ready_for_receiving'
    WHEN 'qced' THEN 'ready_for_receiving'
    WHEN 'finished' THEN 'received'
    ELSE current_state
  END;

-- Update orders status to match new states  
UPDATE public.orders SET status = 
  CASE status
    WHEN 'waiting_for_rm' THEN 'pending_rm'
    WHEN 'manufactured' THEN 'ready_for_finishing'
    WHEN 'waiting_for_pm' THEN 'ready_for_packaging'
    WHEN 'packaged' THEN 'ready_for_boxing'
    WHEN 'waiting_for_bm' THEN 'ready_for_boxing'
    WHEN 'boxed' THEN 'ready_for_receiving'
    WHEN 'qced' THEN 'ready_for_receiving'
    WHEN 'finished' THEN 'received'
    ELSE status
  END;