
## Scale & Harden: Indexes, Atomic Transactions, and Pagination

### Overview

Three production-readiness improvements: (1) database indexes for fast queries at scale, (2) Postgres functions for atomic batch operations, and (3) client-side pagination on the three heaviest list pages.

---

### 1. Database Indexes (Migration)

Create a single migration adding indexes on the most frequently queried columns:

**order_batches:**
- `(order_id, is_terminated)` -- used by every phase page and order detail
- `(current_state)` -- used for queue pages and filtering
- `(box_id)` -- used by Boxes page aggregation
- `(product_id)` -- used by grouping logic
- `(shipment_id)` -- used by boxing/shipment queries
- `(order_item_id)` -- used by ProductionRateSection grouping

**extra_batches:**
- `(box_id)` -- used by extra box aggregation
- `(inventory_state, current_state)` -- used by ExtraInventoryDialog filtering
- `(product_id)` -- used by grouping
- `(order_id)` -- used by reserved batch lookups

**shipments:**
- `(order_id)` -- used by OrderBoxing and OrderDetail

**order_items:**
- `(order_id)` -- used by every order detail/phase page

**extra_batch_history:**
- `(source_order_id)` -- used by "added to extra" aggregations
- `(consuming_order_id)` -- used by "reserved/consumed" lookups

All indexes use `CREATE INDEX IF NOT EXISTS` and `CONCURRENTLY` is not used (migration context).

---

### 2. Atomic Postgres Functions (Migration)

Two new database functions to replace multi-step client-side operations:

**A. `move_order_batches_to_extra(...)` -- replaces MoveToExtraDialog's handleConfirm logic**

Parameters:
- `p_selections jsonb` -- array of `{ batch_id, quantity, order_item_id, product_id }`
- `p_target_box_id uuid`
- `p_phase text` (e.g. `in_manufacturing`)
- `p_user_id uuid`

Inside a single transaction:
1. Validate all source batches exist and are in the expected phase
2. For each selection: reduce or delete the order batch
3. Check for existing extra batch in target box (same product + state) and merge, or create new
4. Insert extra_batch_history records
5. Update order_items.deducted_to_extra
6. Return a summary jsonb

**B. `assign_machine_to_batches(...)` -- replaces ProductionRateSection's handleAssign logic**

Parameters:
- `p_batch_ids uuid[]` -- unassigned batch IDs to pick from
- `p_machine_id uuid`
- `p_machine_column text` -- column name to set
- `p_requested_qty integer`

Inside a single transaction:
1. Lock and sort the specified batches
2. Fully assign batches until remaining qty is less than next batch
3. If partial: update the batch with assigned qty + machine, insert a new batch for the remainder (copying order_id, product_id, order_item_id, current_state)
4. Return count of assigned

Both functions use `SECURITY DEFINER` and validate inputs.

**Client-side changes:**

- **`MoveToExtraDialog.tsx`**: Replace the `handleConfirm` loop (~lines 158-297) with a single `supabase.rpc('move_order_batches_to_extra', { ... })` call
- **`ProductionRateSection.tsx`**: Replace `handleAssign` (~lines 167-273) with a single `supabase.rpc('assign_machine_to_batches', { ... })` call

---

### 3. Pagination

Add pagination (25 rows per page) to three pages using the existing `Pagination` UI component already in the project (`src/components/ui/pagination.tsx`).

**A. Orders page (`src/pages/Orders.tsx`)**

- Add `currentPage` state, reset to 1 when filters/tab change
- Slice `filteredOrders` by page: `filteredOrders.slice((page-1)*25, page*25)`
- Render `Pagination` component below the table
- The data fetch stays the same (orders are already fetched with status computation), pagination is applied to the filtered result

**B. Boxes page (`src/pages/Boxes.tsx`)**

- Add `orderPage` and `extraPage` states
- Slice `orderBoxes` and `extraBoxes` arrays by page
- Render pagination below each tab's table

**C. Extra Inventory page (`src/pages/ExtraInventory.tsx`)**

- Add `currentPage` state
- Slice the `batches` array by page
- Render pagination below the batches table

Each pagination renders: Previous, page numbers (with ellipsis for large sets), Next. Using the existing `Pagination*` components from `src/components/ui/pagination.tsx`.

---

### Summary of Changes

| File | Change |
|------|--------|
| New migration SQL | Indexes on 6 tables + 2 new Postgres functions |
| `src/components/MoveToExtraDialog.tsx` | Replace loop with single RPC call |
| `src/components/ProductionRateSection.tsx` | Replace assign logic with single RPC call |
| `src/pages/Orders.tsx` | Add pagination state + UI below table |
| `src/pages/Boxes.tsx` | Add pagination state + UI for both tabs |
| `src/pages/ExtraInventory.tsx` | Add pagination state + UI below table |
