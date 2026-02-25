

## Fix Extra Inventory Consumption Tracking, Production Rate Quantities, and Packaging Reference

### Issue 1: Extra-consumed items shown as completed in wrong phases

**Root Cause**: The phase pages (Manufacturing, Finishing, Packaging) query `extra_batch_history` for `CONSUMED` events to subtract skipped-phase items from the completed count. However, **no CONSUMED events are ever written**. The `ExtraItemsTab` component creates new `order_batches` from extra inventory (at states like `ready_for_packaging`, `ready_for_boxing`) but never logs a `CONSUMED` event in `extra_batch_history`. This means `extraConsumedSkipped` is always 0, and the subtraction has no effect.

For example: if an order consumes `extra_boxing` items via the Extra tab in the Finishing page, new `order_batches` are created at `ready_for_boxing`. These batches then appear in Manufacturing's completed query (which fetches all batches past manufacturing state), inflating the count.

**Fix**: Add `CONSUMED` history logging in `ExtraItemsTab` when extra batches are consumed. Both `handleMoveToReady` and `handleAssignToBox` will insert a `CONSUMED` record into `extra_batch_history` with:
- `event_type = 'CONSUMED'`
- `from_state = batch.current_state` (e.g., `extra_finishing`, `extra_boxing`)
- `consuming_order_id = orderId`
- `consuming_order_item_id = batch.order_item_id`
- `product_id`, `quantity`, `performed_by`

This makes the existing subtraction logic in all phase pages work correctly.

**File**: `src/components/ExtraItemsTab.tsx`

---

### Issue 2: Production rate entry shows wrong quantity for extra batches

**Root Cause**: In `fetchAddedToExtra` (all phase pages), the code:
1. Fetches `extra_batch_history` CREATED events to get `extra_batch_id`s
2. Then fetches the actual `extra_batches` records by those IDs
3. Uses the **current** `extra_batch.quantity` for the production rate

The problem: if an extra batch was merged with items from multiple orders (consolidation), or had additional items added to it later, its current quantity is larger than what was originally added from this specific order. For example, 50 items were added to extra from this order, but the extra batch was merged with 20 from another source, making the batch quantity 70.

**Fix**: Instead of fetching the current extra_batch quantity, use the **history quantities** directly. The `extra_batch_history` CREATED events already have the correct per-event quantities. Build the production rate data from history records, using the `extra_batch_id` only for machine assignment lookups (since machine IDs are on the extra_batch record).

**Files**: `src/pages/OrderManufacturing.tsx`, `src/pages/OrderFinishing.tsx`, `src/pages/OrderPackaging.tsx`, `src/pages/OrderBoxing.tsx`

Changes in `fetchAddedToExtra`:
- Use history `quantity` values directly for the rate section data instead of re-fetching extra_batch quantities
- Still fetch extra_batches for machine IDs, but use the history quantity for display
- Group by `extra_batch_id` to aggregate history quantities per batch, then cap at the current extra_batch quantity (in case some was consumed since)

---

### Issue 3: Packaging reference dropdown doesn't reflect fulfilled items

**Root Cause**: In `OrderCreate.tsx`, the packaging reference dropdown shows ALL valid order items regardless of how much capacity remains. When all shipment rows for a given item_index already sum to the item's full quantity, the dropdown still shows that item (with `maxQty` of 0 or negative, but it's still visible and selectable).

**Fix**: Filter the dropdown items to only show order items that still have remaining capacity. Calculate remaining capacity per item index across all packaging rows, and exclude items where remaining capacity is 0 or less.

**File**: `src/pages/OrderCreate.tsx`

Change in the packaging reference table rendering:
- For each dropdown, compute remaining capacity for each valid item (item quantity minus total already allocated across ALL rows including the current one)
- Filter the `SelectItem` list to only include items where remaining > 0 OR the item is already selected in the current row (so the user can see what they picked)

---

### Summary of Changes

| File | Change |
|------|--------|
| `src/components/ExtraItemsTab.tsx` | Add CONSUMED history logging in `handleMoveToReady` and `handleAssignToBox` |
| `src/pages/OrderManufacturing.tsx` | Use history quantities instead of current extra_batch quantities for production rate |
| `src/pages/OrderFinishing.tsx` | Same as above |
| `src/pages/OrderPackaging.tsx` | Same as above |
| `src/pages/OrderBoxing.tsx` | Same as above |
| `src/pages/OrderCreate.tsx` | Filter packaging reference dropdown to hide fully-allocated items |

No database changes required.
