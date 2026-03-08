
## Goal (confirmed)
- Keep the **Order Raw Materials** feature **exactly as-is** (OrderCreate raw materials input + RawMaterialsDrawer timeline + images bucket + `raw_material_versions` table).
- Remove **Redo/Terminate/Flag** feature end-to-end (UI + backend columns + counters + indexes).
- Remove **unit-tracking** tables (`units`, `unit_history`, `unit_stage_eta`) and anything that depends on them.
- Remove standalone **BOM/raw-material inventory** tables (`raw_materials`, `product_bom`, `raw_material_receipts`) while keeping the order raw materials timeline untouched.
- Remove **parent/variant product** tables (`parent_products`, `product_sizes`, `product_colors`) and preserve **customer→product suggestions** in OrderCreate.
- Keep **batch scanning / batch codes** (`qr_code_data`) and lookup/scanning flows.

---

## Phase 0 — Safe prerequisites (data cleanup before schema drops)
1. **Delete terminated batches** (currently 5 rows where `order_batches.is_terminated = true`) so they do not “reappear” after we remove the termination feature.
2. Ensure there are no active features depending on those terminated batches (they are currently excluded everywhere via `is_terminated=false`).

---

## Phase 1 — Database schema migration (structure only)
### A) Remove redo/terminate/flagging from orders/batches
- **Drop columns** from `public.order_batches`:
  - `is_terminated`, `terminated_by`, `terminated_reason`
  - `is_redo`, `redo_by`, `redo_reason`
  - `is_flagged`, `flagged_by`, `flagged_reason`
- **Drop columns** from `public.orders`:
  - `termination_counter`, `redo_counter`
- **Drop related indexes** on dropped columns (examples seen in DB):
  - `idx_order_batches_order_terminated`
  - `idx_batches_redo`
  - `idx_batches_terminated`
  - `idx_batches_is_flagged`

### B) Remove unit-tracking tables + their dependencies
- Update `public.machine_production` so it no longer blocks dropping `units`:
  - `ALTER TABLE public.machine_production ALTER COLUMN unit_id DROP NOT NULL`
  - `ALTER TABLE public.machine_production DROP CONSTRAINT machine_production_unit_id_fkey`
  (We keep the table for now to avoid breaking existing dashboard/analytics reads, but it becomes independent of units.)
- **Drop trigger/function** used only by units notifications:
  - Drop trigger `unit_update_notification` (will disappear when dropping table, but explicitly dropping is safer).
  - Drop function `public.notify_unit_update()`
  - Drop function `public.check_late_units()`
- **Drop tables**:
  - `public.unit_stage_eta`
  - `public.unit_history`
  - `public.units`

### C) Remove BOM/raw-material inventory tables (NOT the order raw materials timeline)
- Drop tables (order-independent inventory/BOM):
  - `public.product_bom`
  - `public.raw_material_receipts`
  - `public.raw_materials`
- Keep unchanged:
  - `public.raw_material_versions`
  - storage bucket `raw-material-images`

### D) Remove parent/variant product tables while preserving suggestions
**New mapping table (flat products, per your current catalog design):**
- Create `public.product_customers` (name can vary) with:
  - `id uuid pk default gen_random_uuid()`
  - `product_id uuid references public.products(id) on delete cascade not null`
  - `customer_id uuid references public.customers(id) on delete cascade not null`
  - `unique(product_id, customer_id)`
  - RLS: authenticated SELECT, admin ALL

**Then drop legacy variant tables:**
- Drop function: `public.generate_parent_sku()` (depends on `parent_products`)
- Drop tables:
  - `public.product_colors`
  - `public.product_sizes`
  - `public.parent_products`
- Drop legacy columns from `public.products`:
  - `parent_product_id`, `size_id`, `color_id`
- Drop legacy mapping table after backfill (see Phase 2):
  - `public.product_potential_customers` (since it currently relies on parent products)

### E) Fix `generate_batch_code()` to be consistent (and remove legacy dependency)
- `generate_batch_code()` currently checks uniqueness against `public.batches` (legacy). Update it to check `order_batches.qr_code_data` (and optionally `extra_batches.qr_code_data`) so code generation is consistent with the current system.

---

## Phase 2 — One-time data backfill (data operations, not schema)
1. Backfill `product_customers` from existing `product_potential_customers` + `products.parent_product_id` **before** dropping the parent columns/tables:
   - For each row in `product_potential_customers(parent_product_id, customer_id)`, insert `(product_id, customer_id)` for **all** products whose `products.parent_product_id = product_potential_customers.parent_product_id`.
2. Verify counts (expected: `product_customers` rows >= existing 2 legacy mappings).
3. After verification, proceed to drop `product_potential_customers` (Phase 1D).

---

## Phase 3 — Frontend cleanup (remove redo/terminate/flag + remove unit usage; keep order raw materials)
### A) Remove redo/terminate/flag UI and logic
- Delete unused components:
  - `src/components/FlaggedItemsDialog.tsx`
  - `src/components/BatchActionDialog.tsx` (currently not imported anywhere)
- Update pages/components that reference removed fields:
  - `src/pages/OrderManufacturing.tsx`
    - Remove Terminate/Redo buttons + dialogs + handlers + state (`terminateDialogOpen`, `redoDialogOpen`, etc.)
    - Remove selects referencing `is_flagged`, `is_redo`
    - Remove `.eq("is_terminated", false)` filters everywhere
  - `src/pages/OrderDetail.tsx`
    - Remove Flagged/Redo alert card + “View Details”
    - Remove `FlaggedItemsDialog` import/usage
    - Update batches select to omit `is_terminated/is_redo/is_flagged`
    - Replace `activeBatches = ...filter(!is_terminated)` with `activeBatches = order.batches`
  - `src/pages/Dashboard.tsx`
    - Remove flagged-batch queries + alert list
    - Remove `.eq('is_terminated', false)` usage
  - `src/pages/Analytics.tsx`
    - Remove “Total Terminations/Total Redos” counters and any reads of those columns
    - Remove selecting `is_redo/is_terminated` from `order_batches`
  - Phase/queue pages and supporting dialogs that filter by `is_terminated`:
    - `src/pages/Orders.tsx`, `QueueManufacturing.tsx`, `QueueFinishing.tsx`, `QueuePackaging.tsx`, `QueueBoxing.tsx`
    - `src/pages/OrderFinishing.tsx`, `src/pages/OrderPackaging.tsx`, `src/pages/OrderBoxing.tsx`
    - `src/pages/Boxes.tsx`
    - `src/components/BoxScanDialog.tsx`, `BoxDetailsDialog.tsx`, `BoxLookupScanDialog.tsx`, `ExtraInventoryDialog.tsx`
    - `src/pages/BoxLookup.tsx`

**Important implementation note for `OrderBoxing.tsx`:**
- It currently “consolidates” ready-for-shipment batches by setting `is_terminated=true` on the source batch.
- With termination removed, we will **remove the consolidation step** and simply:
  - For full move: update `current_state` to `ready_for_shipment`, `box_id=null`
  - For partial move: insert a new batch as it already does
  This avoids needing DELETE permissions for managers.

### B) Remove unit table usage
- `src/pages/Reports.tsx`
  - Stop fetching `unit_history` and `units`
  - Pass empty arrays or refactor `ProductionFlowTab` to use available data sources (see below)
- `src/components/reports/ProductionFlowTab.tsx`
  - Refactor away from units-based analytics.
  - Minimal replacement approach (keeps the tab functional without unit tables):
    - Use `machine_production` (still exists) if/when it gets data; otherwise show “No production flow data available”
    - Or switch to batch-based snapshots (counts by `order_batches.current_state` over time is not directly available without a history table, so this tab will become more limited unless we add a batch-history table later)

### C) Preserve Order Raw Materials feature exactly
- Do **not** modify:
  - `src/components/RawMaterialsDrawer.tsx`
  - `src/components/RawMaterialImageUpload.tsx`
  - Raw materials section in `src/pages/OrderCreate.tsx`
  - `raw_material_versions` table/policies
  - `raw-material-images` bucket

---

## Phase 4 — Catalog + OrderCreate suggestions migration (preserve behavior)
### A) Update OrderCreate suggestions logic (no parent products)
- `src/pages/OrderCreate.tsx`
  - Remove `parent_product_id` from Product interface and all “parent mapping” logic.
  - Load suggestions from `product_customers`:
    - build `Map<customer_id, Set<product_id>>`
  - Suggested products list becomes: `products.filter(p => suggestedProductIds.has(p.id))`

### B) Update catalog customer mapping editing
- `src/components/catalog/ProductFormDialog.tsx`
  - Replace writes to `product_potential_customers` with `product_customers`
- `src/pages/Catalog.tsx`
  - Update product fetch join to show potential customers from `product_customers`

---

## Testing checklist (end-to-end, role-based)
1. Admin:
   - Create order (raw materials text + images still saved to timeline)
   - Manufacturing: Assign to box + Assign to Extra works (no redo/terminate UI)
   - Boxing: Move to ready for shipment + create shipment works
   - Catalog: set potential customers, then OrderCreate “Suggested for this customer” works
2. Managers (manufacturing/finishing/packaging/boxing):
   - Can perform normal phase actions; no termination/redo actions exist
3. Lookup/scanning:
   - BatchLookup and BoxLookup/scan still work with `qr_code_data`
4. Reports/Analytics/Dashboard:
   - Pages load without referencing removed tables/columns; production flow tab shows safe empty-state if needed

---

## Deliverables summary
- Backend: removes unused/legacy unit + BOM + parent-product structures; removes redo/termination/flagging entirely; keeps raw materials timeline intact; keeps scanning intact.
- Frontend: removes all redo/termination UI/logic and all references to dropped columns; preserves raw materials workflow; preserves customer-product suggestions without parent products.
