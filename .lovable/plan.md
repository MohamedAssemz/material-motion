

# Catalog Restructure: Bilingual Fields + Size Range

## Overview
Two major changes to the catalog system:
1. Replace single `size` with a size **range** (`size_from` / `size_to`)
2. Add bilingual (EN/AR) fields for `name`, `description`, `color`, and `brand`

## Database Changes

### `products` table migration
```sql
-- Replace single size with range
ALTER TABLE products RENAME COLUMN size TO size_from;
ALTER TABLE products ADD COLUMN size_to text;

-- Add bilingual fields
ALTER TABLE products RENAME COLUMN name TO name_en;
ALTER TABLE products ADD COLUMN name_ar text;
ALTER TABLE products RENAME COLUMN description TO description_en;
ALTER TABLE products ADD COLUMN description_ar text;
ALTER TABLE products RENAME COLUMN color TO color_en;
ALTER TABLE products ADD COLUMN color_ar text;
```

### `brands` table migration
```sql
ALTER TABLE brands RENAME COLUMN name TO name_en;
ALTER TABLE brands ADD COLUMN name_ar text;
```

## File Changes

### 1. `src/lib/catalogConstants.ts`
- Add `getSizeRangeLabel(from, to)` helper that returns e.g. "S - XL"
- Add `getSizeIndex(size)` for comparison/validation

### 2. `src/integrations/supabase/types.ts`
- Auto-updated after migration (no manual edit)

### 3. `src/components/catalog/ProductFormDialog.tsx`
- **Form fields**: Replace single "Name" with "English Name" + "Arabic Name" (both required or EN required, AR optional)
- Replace single "Description" with "English Description" + "Arabic Description"
- Replace single "Color" with "English Color" + "Arabic Color"
- Replace single size dropdown with two dropdowns: "Size From" + "Size To" (validate `from <= to` in size order)
- Brand selector already uses `brand_id`, but display label needs to show `name_en` or `name_ar` based on language
- Update `ProductFormData` interface: `name` → `name_en`, add `name_ar`, same for description, color
- Update `handleSubmit` to save all bilingual fields + `size_from`/`size_to`

### 4. `src/components/catalog/ProductCard.tsx`
- `ProductCardData` interface: update field names
- Display `name_en` or `name_ar` based on current language (`useLanguage()`)
- Display size as range: "S - XL" instead of single size
- Display `color_en` or `color_ar` based on language
- Brand name: show `brand.name_en` or `brand.name_ar`

### 5. `src/components/catalog/ProductDetailDialog.tsx`
- Show both English and Arabic names (always show both, labeled)
- Show both descriptions
- Show both colors
- Show size range
- Brand: show both names

### 6. `src/pages/Catalog.tsx`
- Update `Product` interface fields
- Search filter: search across both `name_en` and `name_ar`
- Size filter: change from exact match to range overlap check (if selected size falls within `size_from`-`size_to`)
- Update `prepareProductFormData` mapping
- Brand display in filter dropdown: show `name_en`/`name_ar` based on language

### 7. `src/components/catalog/BulkUploadDialog.tsx`
- **Template columns**: `english_name`, `arabic_name`, `english_description`, `arabic_description`, `english_color`, `arabic_color`, `english_brand`, `arabic_brand`, `size_from`, `size_to`, `needs_packing`, `image_url`
- **processRows**: map new columns, validate `size_from <= size_to`
- **Auto-create brands**: When a brand name is detected that doesn't exist in the database, insert it into `brands` table (using `name_en` from `english_brand` column, `name_ar` from `arabic_brand` column) before processing products. Build brand map after auto-creation.
- Preview table: show new columns

### 8. `src/components/catalog/BrandListDialog.tsx`
- Brand form: add "English Name" + "Arabic Name" fields
- List display: show `name_en` / `name_ar` based on language
- Save: insert/update both `name_en` and `name_ar`

### 9. `src/pages/CatalogBrands.tsx`
- Same bilingual updates as BrandListDialog

### 10. `src/pages/Products.tsx`
- Update field references (`name` → `name_en`/`name_ar`, etc.)

### 11. `src/pages/OrderCreate.tsx`
- Product selector: display `name_en`/`name_ar` based on language
- Fetches `name_en, name_ar` (or aliased as `name` via a helper)

### 12. Other pages referencing `product.name`
- `ExtraInventory.tsx`, `BatchLookup.tsx`, `BoxLookup.tsx`, reports, etc.
- Create a helper `getProductName(product, language)` that returns `name_en` or `name_ar`
- Apply across all pages

### 13. `src/lib/translations.ts`
- Add translation keys for new labels: `catalog.english_name`, `catalog.arabic_name`, `catalog.english_description`, `catalog.arabic_description`, `catalog.english_color`, `catalog.arabic_color`, `catalog.size_from`, `catalog.size_to`, `catalog.english_brand`, `catalog.arabic_brand`

### 14. RTL Considerations
- All new form fields use standard components that already support RTL
- Arabic text inputs will naturally render RTL
- Two-column layout for EN/AR name fields side by side

## Validation Rules
- `name_en` is required; `name_ar` is optional
- `size_from` must come before or equal `size_to` in the SIZE_OPTIONS order
- If only one size is specified, both `size_from` and `size_to` are set to that value
- Bulk upload: brands not found are auto-created (new requirement)

## Downstream Impact
- Order batches store `product_id` — no schema change needed there
- Reports that display product names need the language-aware helper
- The `products` page (simple admin view) needs field updates

