

# Reconcile order quantities with shipped reality

## Problem
When a client shrinks their order mid-production, the user moves the surplus to Extra Inventory and ships the new (smaller) amount. But `order_items.quantity` still reflects the original request, so ISO reports / printed order docs (which read `order_items.quantity`) overstate what was actually shipped. The user needs to lower the order item quantity by exactly the amount that was deducted to extra — without touching batches, extra inventory, or shipment records.

## The key insight
`order_items.deducted_to_extra` already counts every unit moved from this order's batches into the extra pool (incremented in `move_order_batches_to_extra`, decremented in `commit_extra_inventory`). It is the exact, authoritative budget for "units physically removed from this order". Reducing `quantity` by ≤ `deducted_to_extra` is a pure paperwork correction — nothing else changes.

## Logic — how the cap is computed

For an existing order item in an `in_progress` order, the **minimum quantity** the admin can set becomes:

```text
min_qty = max(1, original_qty - waiting_in_manufacturing - deducted_to_extra)
```

- `waiting_in_manufacturing` (existing): batches still in `in_manufacturing` with `eta IS NULL` → can be deleted.
- `deducted_to_extra` (new): units already moved to Extra → reduce on paper only.

The reduction amount `D = original_qty - new_qty` is split:

1. **Paperwork portion** = `min(D, deducted_to_extra)` → just decrement `order_items.deducted_to_extra` by that amount and lower `order_items.quantity`. No batches, no extra inventory touched.
2. **Waiting portion** = remaining `D` → existing logic deletes waiting manufacturing batches (unchanged).

Order is taken paperwork-first so we never destroy live work when surplus already covers the cut.

## Why this is safe (invariants preserved)

- **Extra inventory untouched.** Units moved to Extra stay AVAILABLE in the extra pool — they were physically detached from the order the moment they were moved. We're only correcting the order document.
- **`commit_extra_inventory` still works.** It only iterates `extra_batches` with `inventory_state = 'RESERVED'` for this order. Available extras and the paperwork decrement don't interact with it.
- **Shipment / ISO totals.** Shipped quantities are derived from `order_batches`/`shipments`, not from `order_items.quantity`. Lowering `quantity` aligns the printed/ISO order doc with what was actually shipped.
- **Progress metrics (waiting/in-progress/done counts per phase) are batch-derived** — unaffected.
- **Deletion rule unchanged.** A whole item can still only be deleted if 100% sits in waiting manufacturing batches. Deducted-to-extra units stay in Extra; deleting the item would orphan accounting, so we forbid it (as today).
- **Audit trail.** Every reduction is logged in `order_activity_logs` with a new `paperwork_only` flag and the deducted-portion amount, so ISO auditors can trace the change.
- **No DB schema changes.** `deducted_to_extra` already exists; we only update its value.

## Edge cases handled

- New `deducted_to_extra` value is clamped to `≥ 0` (mirrors `commit_extra_inventory`).
- Re-validation on save re-reads `order_items.deducted_to_extra` and waiting batches (server-side check) so two admins editing concurrently can't over-reduce.
- If a customer later increases the qty back up, existing "increase" branch creates a new manufacturing batch — `deducted_to_extra` is left alone (those extras are still in the pool and unrelated to the new ask).
- Pending orders: no extras can exist yet, so behavior is identical to today.

## UI changes (`EditOrderDialog.tsx`)

- `fetchRemovableQuantities` also fetches each item's `deducted_to_extra` and stores it.
- New tooltip beside the qty input on items where `deducted_to_extra > 0`:
  > "X units already moved to Extra Inventory — you may reduce the order quantity by up to X without affecting production."
- The qty input's `min` becomes `max(1, originalQty − waiting − deductedToExtra)`.
- Deletion rule unchanged (still requires full coverage by waiting batches alone).

## Save flow changes (`handleSave`)

For each existing item with `delta < 0`:

```text
D = |delta|
paperwork = min(D, deducted_to_extra)
fromWaiting = D - paperwork

if paperwork > 0:
    order_items.deducted_to_extra -= paperwork   (clamped ≥ 0)
if fromWaiting > 0:
    deleteManufacturingBatches(item_id, fromWaiting)   (existing helper)
order_items.quantity = new_qty
```

The existing box-occupancy guard runs only when `fromWaiting > 0` (paperwork-only reductions never touch boxes).

## Activity log

Each qty change records: `{ from, to, delta, paperwork_portion, batch_portion }` so the log clearly distinguishes "shrunk to match shipment" from "production work cancelled".

## Files

**Modified**
- `src/components/EditOrderDialog.tsx` — fetch `deducted_to_extra`, expand `getMinQuantity`, split the decrease in `handleSave`, add tooltip, extend activity-log payload, extend re-validation.
- `src/lib/translations.ts` — new keys: `orders.deducted_to_extra_hint`, `orders.paperwork_reduction`.

**New**
- None. No DB migrations, no RPC changes.

