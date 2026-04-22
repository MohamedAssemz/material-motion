

# Three improvements: minimum stock, size column fix, dynamic storehouses

## 1. Minimum Quantity attribute on catalog items (informational)

**Schema**
- Migration: `ALTER TABLE products ADD COLUMN minimum_quantity integer NOT NULL DEFAULT 0;`

**UI — `src/components/catalog/ProductFormDialog.tsx`**
- Add `minimum_quantity` to `ProductFormData` and `initialFormData` (default `0`).
- Add a `NumericInput` field labelled "Minimum Quantity / الحد الأدنى للكمية" with helper text "Informational only — does not affect production logic" / "للعرض فقط — لا يؤثر على منطق الإنتاج".
- Include in insert/update payloads. Load when editing/duplicating.

**Display — `src/components/catalog/ProductDetailDialog.tsx`**
- Show "Minimum Quantity: N" inside the product attributes section so admins can see the threshold (read-only).

**Translations — `src/lib/translations.ts`**
- Add `catalog.minimum_quantity`, `catalog.minimum_quantity_helper`.

No business logic changes — just stored and displayed.

## 2. Fix size column in Extra Inventory ("—" + "common.size" header)

**Two distinct issues, both fixed:**

a. **Missing translation key** — `common.size` is referenced in `src/pages/ExtraInventory.tsx` (lines 468 & 723) but doesn't exist in `translations.ts`. Add to `src/lib/translations.ts`:
```
"common.size": { en: "Size", ar: "المقاس" }
```
This fixes the literal "common.size" header text shown in both EN and AR.

b. **Dash showing for batches that have a size** — DB confirms several `extra_batches` rows have `size = ''` (empty string, not null). The current renderer does `batch.size ? <Badge> : —` and an empty string is falsy so it shows "—". Fix in `src/pages/ExtraInventory.tsx` line 763:
```tsx
{batch.size && batch.size.trim() ? <Badge variant="outline">{batch.size}</Badge> : <span className="text-muted-foreground text-xs">—</span>}
```
Plus a one-time data-cleanup migration to backfill the missing sizes by joining each affected `extra_batch` to its origin `order_item.size` (via the most recent `extra_batch_history.source_order_item_id` for that batch). For rows where no source order_item can be found, leave as null. This corrects the historical rows displayed in the screenshot.

## 3. Dynamic storehouses everywhere (bug: new storehouses don't appear in selectors)

The `storehouses` table exists and the Warehouse Settings page writes to it, but every dropdown still hard-codes Storehouse 1 / Storehouse 2 from translation keys. Replace with dynamic fetches.

**New shared hook — `src/hooks/useStorehouses.ts`**
- Fetches `storehouses` ordered by `sort_order`, subscribes to realtime changes, exposes `{ storehouses, loading, getName(id) }`.

**Files to update — replace hard-coded `<SelectItem value="1">`/`"2"` and `t("warehouse.storehouse_1")`/`_2` lookups with the dynamic list / `getName(id)`:**

- `src/pages/Boxes.tsx`
  - Create-Extra-Boxes dialog (lines ~921–931) → map over `storehouses`.
  - Per-row storehouse `<Select>` in extra-boxes table (lines ~1230–1234) → map over `storehouses`.
  - Storehouse summary cards (currently hard-coded "Storehouse 1 Empty / Storehouse 2 Empty") → render one card per storehouse from the dynamic list.
  - `emptyExtraBoxesS1` / `emptyExtraBoxesS2` derived state → replaced by `groupBy(storehouse_id)`.

- `src/pages/ExtraInventory.tsx`
  - Storehouse filter `<Select>` (lines ~680–684) → dynamic options.
  - Per-row badge (line ~772) → `getName(batch.storehouse)`.
  - Storehouse summary cards (lines ~599–615) → render one card per storehouse instead of hard-coded two.

- `src/pages/WarehouseSettings.tsx` — already dynamic, no change beyond confirming the realtime hook reflects edits.

**Why the user's bug happened:** `Boxes.tsx` create-extra-box dialog only renders `<SelectItem value="1">` and `<SelectItem value="2">`, so any storehouse with `id ≥ 3` is invisible. Switching to a `.map()` over the fetched `storehouses` fixes it everywhere consistently.

**Translations — `src/lib/translations.ts`**
- Keep `warehouse.storehouse` (label) but the per-storehouse names now come from the DB (`storehouses.name`), so `warehouse.storehouse_1` / `_2` / `_1_empty` / `_2_empty` / `_1_batches` / `_2_batches` keys are no longer used and can be removed once all references are migrated. Add generic `warehouse.empty_boxes` and `warehouse.available_units` for the dynamic cards.

## Files

**New**
- `src/hooks/useStorehouses.ts`
- Migration: add `products.minimum_quantity` + backfill `extra_batches.size` from `extra_batch_history`.

**Modified**
- `src/components/catalog/ProductFormDialog.tsx`
- `src/components/catalog/ProductDetailDialog.tsx`
- `src/pages/ExtraInventory.tsx`
- `src/pages/Boxes.tsx`
- `src/lib/translations.ts`

