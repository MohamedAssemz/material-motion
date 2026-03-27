
-- Add sizes array column
ALTER TABLE products ADD COLUMN sizes text[] DEFAULT '{}';

-- Migrate existing size_from/size_to data into sizes array
DO $$
DECLARE
  size_options text[] := ARRAY['XXS','XS','S','M','L','XL','2XL','3XL','4XL','5XL','6XL'];
  rec record;
  from_idx int;
  to_idx int;
  result_sizes text[];
  i int;
BEGIN
  FOR rec IN SELECT id, size_from, size_to FROM products WHERE size_from IS NOT NULL OR size_to IS NOT NULL
  LOOP
    from_idx := array_position(size_options, rec.size_from);
    to_idx := array_position(size_options, rec.size_to);
    
    IF from_idx IS NULL AND to_idx IS NOT NULL THEN
      from_idx := to_idx;
    ELSIF to_idx IS NULL AND from_idx IS NOT NULL THEN
      to_idx := from_idx;
    END IF;
    
    IF from_idx IS NOT NULL AND to_idx IS NOT NULL THEN
      result_sizes := '{}';
      FOR i IN from_idx..to_idx LOOP
        result_sizes := array_append(result_sizes, size_options[i]);
      END LOOP;
      UPDATE products SET sizes = result_sizes WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- Drop old columns
ALTER TABLE products DROP COLUMN size_from;
ALTER TABLE products DROP COLUMN size_to;
