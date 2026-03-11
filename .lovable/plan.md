

# Arabic Translation & RTL Completion Plan

This plan covers all 8 items from your to-do list. Each page/component needs (a) `useLanguage` integration, (b) hardcoded strings replaced with `t()` keys, and (c) RTL layout fixes where applicable. New translation keys will be added to `src/lib/translations.ts`.

---

## 1. Dashboard: Fix Production Pipeline Chart (RTL)

**Problem**: X-axis is flipped and Y-axis values render inside the axis line.

**Fix in `Dashboard.tsx`** (line ~385-388):
- Set `mirror={false}` explicitly on YAxis (already set but ineffective due to margin)
- Increase left margin in RTL mode to push Y-axis labels outside the bars: `margin={{ left: isRTL ? 0 : 20, right: isRTL ? 40 : 20 }}`
- Set YAxis `tickMargin={10}` to add space between labels and the axis line
- For the throughput bar chart (~line 559): same margin/tickMargin adjustments

## 2. Manufacturing Phase Page (`OrderManufacturing.tsx`)

Already partially translated (uses `t()` for headers/stats). Remaining:
- Translate tab labels, dialog content, button text, and batch table headers still hardcoded
- Review lines 700-976 for remaining English strings in dialogs/tabs

## 3. Catalog Page (`Catalog.tsx`)

Already mostly translated. Fix:
- `"Category"` placeholder on line 433 → `t('catalog.categories')`
- Any remaining hardcoded strings in filter/dialog areas

## 4. Queue Pages: Column-to-Value Alignment (RTL)

**Pages**: `QueueManufacturing.tsx`, `QueueFinishing.tsx`, `QueuePackaging.tsx`, `QueueBoxing.tsx`

**Fix**: Add RTL-aware text alignment to `TableHead` and `TableCell`. In RTL, table text should right-align naturally via the global `dir="rtl"`, but the `text-left` class on `TableHead` component overrides this.

**Fix in `src/components/ui/table.tsx`**: Change the `TableHead` className from hardcoded `text-left` to `text-start` so it respects `dir` attribute. This fixes ALL tables across the app.

## 5. Box Details Dialog (`BoxDetailsDialog.tsx`)

All strings are hardcoded English. Add `useLanguage` and translate:
- "Created", "Active", "Yes"/"No", "Order", "Products", "No batches in this box"
- Table headers: "Product SKU", "Product Name", "Total Qty", "Inv State"
- Buttons: "Force Empty", "Print Label", "Close"
- Alert dialog: "Force Empty Box" title/description, "Cancel"

Add ~15 new translation keys under `box_details.*`.

## 6. Warehouse (Boxes) Page: Column Alignment + Extra Status Names

**Column alignment**: Fixed globally by the `text-left` → `text-start` change in `table.tsx` (item 4).

**Extra status names**: The `formatState()` function in `Boxes.tsx` likely returns English state names. Need to make it use `t()` for state labels like "in_manufacturing" → Arabic equivalent.

## 7. Machines Page

**No `useLanguage` at all.** Full translation needed:
- Add `useLanguage` import
- Translate: header ("Machines", "Manage production equipment"), TYPE_CONFIG labels, "Add Machine" dialog, "No machines yet", "Active"/"Inactive", delete confirmation
- **RTL fix for Switch**: The machine card uses `flex` with `gap-3`. The Switch overflows because admin action buttons use `shrink-0`. Fix: wrap admin actions to prevent overflow, or constrain the action div width.
- Add ~20 new translation keys under `machines.*`

## 8. Analytics Page

Already has `useLanguage`. Remaining hardcoded strings:
- Chart axis labels and state names in badges (line 384: `batch.current_state.replace(/_/g, ' ')`)
- "ETA:" prefix (line 394)
- Make charts RTL-aware (add `orientation`, `reversed` props like Dashboard)

## 9. Reports Tabs (all 5 components)

None of the report tab components use `useLanguage`:
- `OrderPerformanceTab.tsx`
- `ProductionFlowTab.tsx`
- `MachineProductionTab.tsx`
- `InventoryBoxesTab.tsx`
- `CatalogInsightsTab.tsx`

Each needs full translation of headers, chart labels, filter labels, KPI titles, and empty states. This is the largest chunk (~100+ new translation keys).

Also `Reports.tsx` parent page needs chart RTL adjustments.

## 10. User Management (`Admin.tsx`)

No `useLanguage`. Full translation needed:
- Header: "User Management", "Create User"
- Table headers: "User", "Primary Role", "Additional Roles", "Actions"
- Role labels (already in AVAILABLE_ROLES but hardcoded English)
- "Access Denied", "Last admin", "You" badge
- Toast messages
- Add ~15 keys under `admin.*`

Also translate `CreateUserDialog.tsx`, `EditUserDialog.tsx`, `DeleteUserDialog.tsx`.

---

## Global RTL Fix (High Impact)

**`src/components/ui/table.tsx` line ~56**: Change `text-left` to `text-start` in `TableHead`. This single change fixes column alignment across ALL tables in RTL mode.

## Translation Keys Summary

~180 new keys to add to `translations.ts`, organized by section:
- `machines.*` (~20)
- `admin.*` (~25)
- `box_details.*` (~15)
- `reports.perf.*`, `reports.flow.*`, `reports.machine.*`, `reports.inventory.*`, `reports.catalog.*` (~100)
- `analytics.*` additions (~10)
- Misc fixes (~10)

## Files to Edit

1. `src/lib/translations.ts` — add all new keys
2. `src/components/ui/table.tsx` — `text-left` → `text-start`
3. `src/pages/Dashboard.tsx` — chart margin/tickMargin fixes
4. `src/pages/Machines.tsx` — full translation + RTL fix
5. `src/pages/Admin.tsx` — full translation
6. `src/components/CreateUserDialog.tsx` — translate
7. `src/components/EditUserDialog.tsx` — translate
8. `src/components/DeleteUserDialog.tsx` — translate
9. `src/components/BoxDetailsDialog.tsx` — translate
10. `src/pages/Analytics.tsx` — RTL charts + remaining strings
11. `src/pages/Catalog.tsx` — minor placeholder fix
12. `src/pages/OrderManufacturing.tsx` — remaining strings
13. `src/pages/Boxes.tsx` — formatState translation
14. `src/pages/Reports.tsx` — already translated, verify
15. `src/components/reports/OrderPerformanceTab.tsx` — full translation
16. `src/components/reports/ProductionFlowTab.tsx` — full translation
17. `src/components/reports/MachineProductionTab.tsx` — full translation
18. `src/components/reports/InventoryBoxesTab.tsx` — full translation
19. `src/components/reports/CatalogInsightsTab.tsx` — full translation

