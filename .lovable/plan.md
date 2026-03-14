

# Fix Plan: Manufacturing Translations + Search Bar RTL

## Bug 1: Manufacturing Page Missing Translations

The page uses translation keys that don't exist in `translations.ts`. Need to add these keys and translate remaining hardcoded strings in the box assignment dialog.

**Missing translation keys to add to `src/lib/translations.ts`:**
- `phase.active_tab` → "Active" / "نشط"
- `phase.extra_tab` → "Extra" / "إضافي"  
- `phase.processed_tab` → "Processed" / "تمت المعالجة"
- `phase.select_quantities` → "Select quantities to assign" / "اختر الكميات للتعيين"
- `phase.select_label` → "Select" / "اختر"
- `phase.in_manufacturing` → "In Manufacturing" / "قيد التصنيع"
- `phase.added_to_extra_order` → "Added to Extra from this Order" / "أُضيف للإضافي من هذا الطلب"
- `phase.or` → "OR" / "أو"
- `phase.select_available_box` → "Select Available Box" / "اختر صندوق متاح"
- `phase.assign_items` → "Assign {n} Items" / "تعيين {n} عنصر"

**Hardcoded strings in `OrderManufacturing.tsx` (lines 873-958) to translate:**
- Line 887-889: SearchableSelect placeholders ("Select a machine...", "Search machines...", "No manufacturing machines found")
- Line 897: "Box Selection" divider
- Line 902: "Search Box by Code" label
- Line 907: "Enter box number (e.g., 42)" placeholder
- Line 919: "Selected" text
- Line 925: "OR" divider
- Line 930: "Select Available Box" label
- Lines 939-941: "Loading...", "Select a box...", "Search boxes...", "No boxes available"
- Line 949-954: "Cancel", "Assign X Items"
- Lines 757-763: "Boxing" / "No Boxing" badges

## Bug 2: Search Bar RTL Issues (Icon + Text Clipping)

**Root cause:** All search inputs use `left-3` for icon positioning and `pl-10` for text padding. The CSS RTL overrides in `index.css` handle `pl-10` (flips to `padding-right`), but `left-3` has NO RTL override — only `left-0`, `left-4`, `left-6` exist. This means in RTL the padding flips to the right but the icon stays on the left, causing collision.

**Text clipping:** The Input component's `py-2` combined with the Arabic font can clip descenders. The Catalog search already uses `h-11 py-3` which helps, but others use default `h-10 py-2`.

**Fix approach — add `left-3` RTL override + use logical properties:**

1. **Add `left-3` to `index.css` RTL overrides** (line ~208):
   ```css
   [dir="rtl"] .left-3   { left: unset;  right: 0.75rem; }
   ```

2. **Change all search icon instances** from `left-3` to `start-3` (Tailwind logical property) across ~10 files. Change `pl-10` to `ps-10` on corresponding inputs. This is cleaner and doesn't rely on CSS overrides.

**Files to update for search icon RTL (change `left-3` → `start-3`, `pl-10` → `ps-10`):**
- `src/pages/Catalog.tsx`
- `src/pages/Boxes.tsx`
- `src/pages/ExtraInventory.tsx`
- `src/pages/Customers.tsx`
- `src/pages/OrderFinishing.tsx`
- `src/pages/OrderPackaging.tsx`
- `src/pages/OrderBoxing.tsx`
- `src/components/BoxReceiveDialog.tsx`
- `src/components/BoxScanDialog.tsx`
- `src/components/BoxScanPopup.tsx`
- `src/components/BoxAssignmentDialog.tsx`
- `src/components/ExtraBoxSelectionDialog.tsx`
- `src/components/MoveToExtraDialog.tsx`
- `src/components/ExtraInventoryDialog.tsx`

3. **Add `ps-10` RTL override to `index.css`** (since Tailwind v3 may not support `ps-*` natively, add it):
   ```css
   [dir="rtl"] .ps-10 { padding-inline-start: 2.5rem; }
   ```
   Actually, simpler: just add the `left-3` RTL override to `index.css` and keep using `pl-10` (which already has an RTL override). This is the minimal fix — one line in CSS fixes all 14 files.

**Final approach:** Add `[dir="rtl"] .left-3 { left: unset; right: 0.75rem; }` to `index.css`. This single CSS line fixes the icon position across all search bars. The `pl-10` override already exists. No component changes needed for the icon fix.

For text clipping, ensure Arabic search inputs have adequate height — already fine on most since `h-10` is standard. If specific inputs clip, add `leading-normal` class.

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/translations.ts` | Add ~15 missing `phase.*` keys |
| `src/pages/OrderManufacturing.tsx` | Replace hardcoded strings in dialog (lines 887-954) and badges (757-763) with `t()` calls |
| `src/index.css` | Add `[dir="rtl"] .left-3` override (1 line) |

