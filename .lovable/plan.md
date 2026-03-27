

# Catalog Size Multi-Select + UI Improvements

## Overview
Replace size range (from/to) with multi-select sizes, improve product form layout, and enhance product cards and detail view with bilingual content.

## 1. Database Migration

Replace `size_from` and `size_to` columns with a single `sizes` text array column:

```sql
ALTER TABLE products ADD COLUMN sizes text[] DEFAULT '{}';

-- Migrate existing data: expand size_from/size_to ranges into individual sizes
UPDATE products SET sizes = ... (expand range using SIZE_OPTIONS order);

ALTER TABLE products DROP COLUMN size_from;
ALTER TABLE products DROP COLUMN size_to;
```

The migration will expand ranges (e.g. `size_from='S', size_to='XL'`) into `['S','M','L','XL']` using the SIZE_OPTIONS ordering.

## 2. Product Form Dialog (`ProductFormDialog.tsx`)

**Layout changes (field reordering):**
- English fields always on the LEFT column, Arabic fields always on the RIGHT column (regardless of system language)
- Field order within the grid: Names → Descriptions → Colors → Sizes → Brand/Country

**Sizes:** Replace two dropdowns with a single "Size" section using checkboxes (similar to categories selector). Each SIZE_OPTION is a checkbox.

**Colors:** Add placeholder hints — English color input gets `"e.g. Red, Blue"`, Arabic color input gets `"مثال: أحمر، أزرق"`. Hints stay in their respective language regardless of system language.

**Form data model:** Replace `size_from: string` and `size_to: string` with `sizes: string[]`.

**Arabic fields direction:** Arabic inputs keep `dir="rtl"` always. English inputs keep default LTR.

## 3. Product Card (`ProductCard.tsx`)

Show **both** names (EN and AR) on the card:
- Primary: English name
- Secondary (smaller, muted): Arabic name (if exists)

Show **both** colors (EN and AR), separated by `/` if both exist.

Show sizes as comma-separated list (e.g. "S, M, L, XL").

## 4. Product Detail Dialog (`ProductDetailDialog.tsx`)

- Always show both EN and AR names side by side (not conditional on `name_ar` existing)
- Always show both EN and AR descriptions side by side
- Always show both EN and AR colors side by side
- **Sizes**: Show each size as an individual Badge/tag instead of a range label
- **New section: "Quick Product Insights"** — query `order_items` + `order_batches` for this product, grouped by... 

**Note on insights:** The current schema doesn't store size per order_item or per batch — orders are placed for a product (all sizes). So "quantity ordered per size" isn't available from the current data model. We have two options:

1. Show total quantity ordered for this product (without size breakdown) — achievable now
2. Add a `size` column to `order_items` to track which size was ordered — requires schema change + order creation flow update

I'll ask the user about this.

## 5. Catalog Page (`Catalog.tsx`)

- Update size filter to work with `sizes` array (check if selected size is in `product.sizes`)
- Update `prepareProductFormData` to map `sizes` array instead of `size_from`/`size_to`
- Update Product type interface

## 6. Bulk Upload (`BulkUploadDialog.tsx`)

- Change CSV columns from `size_from`/`size_to` to `sizes` (comma-separated in CSV, parsed to array)
- Update template and parsing logic

## 7. Supporting Files

- **`catalogConstants.ts`**: Remove `getSizeRangeLabel`, `isValidSizeRange`, `getSizeIndex`. Add `getSizesLabel(sizes: string[]): string` helper.
- **`catalogHelpers.ts`**: No changes needed (name/color/description helpers unaffected).
- **`translations.ts`**: Replace `catalog.size_from`/`catalog.size_to` with `catalog.sizes`. Add `catalog.quick_insights`, `catalog.total_ordered`, `catalog.color_hint_en`, `catalog.color_hint_ar`.

## 8. Files Changed

| File | Change |
|---|---|
| DB migration | Drop `size_from`/`size_to`, add `sizes text[]` |
| `ProductFormDialog.tsx` | Multi-select sizes, field reorder, color hints, EN-left/AR-right |
| `ProductCard.tsx` | Both names, both colors, comma-separated sizes |
| `ProductDetailDialog.tsx` | All bilingual fields shown, size tags, insights section |
| `Catalog.tsx` | Filter update, type update, form data mapping |
| `BulkUploadDialog.tsx` | CSV column change |
| `catalogConstants.ts` | New helpers for sizes array |
| `translations.ts` | New/updated keys |

## Open Question

The "Quick Product Insights" section requests quantity ordered **per size**. Currently `order_items` doesn't have a `size` column — orders are for a product regardless of size. Should we:
- **A)** Add a `size` column to `order_items` (and update OrderCreate to select a size per item) — enables per-size insights
- **B)** Show total quantity ordered for this product (no size breakdown) — works with current schema

