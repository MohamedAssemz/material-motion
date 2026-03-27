
-- Products: Replace single size with range
ALTER TABLE products RENAME COLUMN size TO size_from;
ALTER TABLE products ADD COLUMN size_to text;

-- Products: Add bilingual fields
ALTER TABLE products RENAME COLUMN name TO name_en;
ALTER TABLE products ADD COLUMN name_ar text;
ALTER TABLE products RENAME COLUMN description TO description_en;
ALTER TABLE products ADD COLUMN description_ar text;
ALTER TABLE products RENAME COLUMN color TO color_en;
ALTER TABLE products ADD COLUMN color_ar text;

-- Brands: Add bilingual name
ALTER TABLE brands RENAME COLUMN name TO name_en;
ALTER TABLE brands ADD COLUMN name_ar text;

-- Update the sync trigger function to use new column names
CREATE OR REPLACE FUNCTION public.sync_extra_box_items_list()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  affected_box_id UUID;
  items_summary JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_box_id := OLD.box_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.box_id IS DISTINCT FROM NEW.box_id THEN
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
          p.name_en as product_name,
          p.sku as product_sku,
          SUM(eb.quantity) as total_qty
        FROM extra_batches eb
        JOIN products p ON p.id = eb.product_id
        WHERE eb.box_id = OLD.box_id
        GROUP BY eb.product_id, p.name_en, p.sku
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
  
  IF affected_box_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  
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
      p.name_en as product_name,
      p.sku as product_sku,
      SUM(eb.quantity) as total_qty
    FROM extra_batches eb
    JOIN products p ON p.id = eb.product_id
    WHERE eb.box_id = affected_box_id
    GROUP BY eb.product_id, p.name_en, p.sku
  ) sq;
  
  UPDATE extra_boxes SET 
    items_list = items_summary,
    content_type = CASE WHEN items_summary = '[]'::jsonb THEN 'EMPTY' ELSE 'EXTRA' END
  WHERE id = affected_box_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$function$;
