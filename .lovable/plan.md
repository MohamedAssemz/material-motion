

## Arabic Translation & RTL Enhancement - Phased Approach

Given the size of this application (~27 pages, ~50+ components), I'll divide this into 4 manageable phases.

---

### Phase 1: Core RTL Infrastructure (This Phase)
**Goal**: Make RTL layout work correctly system-wide

**Changes:**
1. **`src/components/ui/sheet.tsx`** — Add RTL-aware side detection: sheets that open from "right" in LTR should open from "left" in RTL (and vice versa)
2. **`src/index.css`** — Expand RTL utilities:
   - `gap-x`, `ml-*`, `mr-*`, `pl-*`, `pr-*` logical equivalents
   - `text-left`/`text-right` flipping
   - `left-*`/`right-*` positioning swaps
3. **`src/components/ui/drawer.tsx`** — Add RTL text alignment in headers
4. **`src/components/ui/dialog.tsx`** — Ensure close button position flips in RTL

---

### Phase 2: Expand Translations File
**Goal**: Add all missing keys for full Arabic coverage

**Changes to `src/lib/translations.ts`:**
- Add ~200 more keys covering:
  - Table headers (columns, sorting labels)
  - Form labels & placeholders (all inputs)
  - Toast messages (success, error, warnings)
  - Empty states & loading messages
  - Date/time labels (Today, Yesterday, etc.)
  - Dialog titles & buttons
  - Queue-specific actions
  - Dashboard alerts & KPIs

---

### Phase 3: Page-by-Page Translation Integration
**Goal**: Replace hardcoded strings with `t()` calls

**Priority order (batch by functional area):**
1. **Core pages**: Dashboard, Orders, OrderDetail
2. **Queue pages**: QueueManufacturing/Finishing/Packaging/Boxing + their Order* counterparts
3. **Inventory pages**: Boxes, ExtraInventory, Warehouse
4. **Catalog pages**: Catalog, CatalogBrands, CatalogCategories, Products
5. **Admin pages**: Admin, Machines, Customers, Reports, Auth

---

### Phase 4: Component-Level Translation
**Goal**: Translate all shared components

- Dialogs: BoxAssignmentDialog, ShipmentDialog, LeadTimeDialog, etc.
- Cards: BatchCard, UnitCard, ProductCard
- Tables: TablePagination, all table headers
- Forms: All input labels and validation messages

---

### Starting with Phase 1 Now

**Files to modify:**
1. `src/components/ui/sheet.tsx` — RTL-aware side prop
2. `src/index.css` — Comprehensive RTL utility classes
3. `src/components/ui/dialog.tsx` — Close button RTL positioning

This establishes the foundation so that when translations are added, the layout flips correctly.

