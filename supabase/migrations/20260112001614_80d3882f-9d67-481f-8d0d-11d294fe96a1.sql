-- Create a function to sync extra_box items_list when extra_batches change
CREATE OR REPLACE FUNCTION public.sync_extra_box_items_list()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_box_id UUID;
  items_summary JSONB;
BEGIN
  -- Determine which box_id was affected
  IF TG_OP = 'DELETE' THEN
    affected_box_id := OLD.box_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.box_id IS DISTINCT FROM NEW.box_id THEN
    -- Box changed - update both old and new box
    -- First update old box
    IF OLD.box_id IS NOT NULL THEN
      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'product_id', sq.product_id,
            'product_name', sq.product_name,
            'product_sku', sq.product_sku,
            'quantity', sq.total_qty
          )
        ),
        '[]'::jsonb
      ) INTO items_summary
      FROM (
        SELECT 
          eb.product_id,
          p.name as product_name,
          p.sku as product_sku,
          SUM(eb.quantity) as total_qty
        FROM extra_batches eb
        JOIN products p ON p.id = eb.product_id
        WHERE eb.box_id = OLD.box_id
        GROUP BY eb.product_id, p.name, p.sku
      ) sq;
      
      UPDATE extra_boxes SET 
        items_list = items_summary,
        content_type = CASE WHEN items_summary = '[]'::jsonb THEN 'EMPTY' ELSE 'EXTRA' END
      WHERE id = OLD.box_id;
    END IF;
    
    affected_box_id := NEW.box_id;
  ELSE
    affected_box_id := COALESCE(NEW.box_id, OLD.box_id);
  END IF;
  
  -- Skip if no box_id
  IF affected_box_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
  -- Aggregate all batches in this box
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', sq.product_id,
        'product_name', sq.product_name,
        'product_sku', sq.product_sku,
        'quantity', sq.total_qty
      )
    ),
    '[]'::jsonb
  ) INTO items_summary
  FROM (
    SELECT 
      eb.product_id,
      p.name as product_name,
      p.sku as product_sku,
      SUM(eb.quantity) as total_qty
    FROM extra_batches eb
    JOIN products p ON p.id = eb.product_id
    WHERE eb.box_id = affected_box_id
    GROUP BY eb.product_id, p.name, p.sku
  ) sq;
  
  -- Update the extra_box
  UPDATE extra_boxes SET 
    items_list = items_summary,
    content_type = CASE WHEN items_summary = '[]'::jsonb THEN 'EMPTY' ELSE 'EXTRA' END
  WHERE id = affected_box_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create trigger on extra_batches
DROP TRIGGER IF EXISTS sync_extra_box_on_batch_change ON extra_batches;
CREATE TRIGGER sync_extra_box_on_batch_change
AFTER INSERT OR UPDATE OR DELETE ON extra_batches
FOR EACH ROW
EXECUTE FUNCTION sync_extra_box_items_list();

-- Fix existing EBOX-0001 (and any others with stale data)
UPDATE extra_boxes eb SET 
  items_list = COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'product_id', sq.product_id,
          'product_name', sq.product_name,
          'product_sku', sq.product_sku,
          'quantity', sq.total_qty
        )
      )
      FROM (
        SELECT 
          batch.product_id,
          p.name as product_name,
          p.sku as product_sku,
          SUM(batch.quantity) as total_qty
        FROM extra_batches batch
        JOIN products p ON p.id = batch.product_id
        WHERE batch.box_id = eb.id
        GROUP BY batch.product_id, p.name, p.sku
      ) sq
    ),
    '[]'::jsonb
  ),
  content_type = CASE 
    WHEN EXISTS (SELECT 1 FROM extra_batches WHERE box_id = eb.id) THEN 'EXTRA' 
    ELSE 'EMPTY' 
  END;