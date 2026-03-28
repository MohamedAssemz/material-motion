

# Fix "column products_1.name does not exist" Error

## Root Cause
The `products` table has columns `name_en` and `name_ar` — not `name`. Several files still reference `products(name, sku)` or `products(name)` in Supabase queries, and use `product.name` in code.

## Files to Fix

| File | Issue |
|------|-------|
| `src/components/ExtraInventoryDialog.tsx` | Query uses `products(id, name, sku)` → change to `products(id, name_en, name_ar, sku)`. Code references `batch.product.name` → `batch.product.name_en` |
| `src/components/BoxScanPopup.tsx` | Query uses `products(id, name, sku)` → `products(id, name_en, sku)`. Code uses `product.name` → `product.name_en` |
| `src/components/BoxReceiveDialog.tsx` | Multiple queries use `products(id, name, sku)` → `products(id, name_en, sku)`. Code uses `product.name` → `product.name_en` |
| `src/components/BoxScanDialog.tsx` | Code uses `product.name` → `product.name_en` (need to check query too) |
| `src/pages/BoxLookup.tsx` | Three queries use `products(name, sku)` → `products(name_en, sku)`. Code uses `product.name` → `product.name_en` |
| `src/pages/Analytics.tsx` | Query uses `products(name)` → `products(name_en)`. Code uses `product.name` → `product.name_en` |

## Changes Per File
For each file:
1. Update the Supabase `.select()` string: replace `name` with `name_en` (and add `name_ar` where bilingual display is needed)
2. Update all TypeScript references from `.name` to `.name_en`
3. Update any interfaces/types that have `name: string` to `name_en: string`

