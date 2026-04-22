

# Allow reducing an order item to 0 (paperwork-only) when delete is blocked

## Change
In `EditOrderDialog`, lower the quantity floor from `1` to `0` **only when the line cannot be deleted** (i.e., units already moved to Extra or non-waiting batches exist). Clean lines keep the `≥1` floor so users still use Delete for them.

This lets the user mirror a fully-cancelled customer line on the paperwork (qty → 0) without orphaning the surplus units sitting in Extra Inventory.

## Behavior

For your scenario (qty 100, 50 in Extra, 50 waiting):
- Reduce 100 → 0.
- Existing split logic in `handleSave` runs: `paperwork = min(100, 50) = 50`, `fromWaiting = 50`.
- 50 waiting manufacturing batches are deleted (production cancelled).
- `order_items.deducted_to_extra` goes 50 → 0, `quantity` goes 100 → 0.
- The 50 units in Extra Inventory are untouched — still AVAILABLE, still linked to this `order_item_id` for ISO traceability.
- The order_items row stays alive so `extra_batches`, `extra_batch_history`, `order_item_progress`, and OrderDetail lookups never see dangling references.

## Code touchpoints (`src/components/EditOrderDialog.tsx`)

1. **`getMinQuantity`** — replace the hard `1` floor with a conditional floor:
   ```ts
   const canDelete = removable >= item.originalQuantity;
   const floor = canDelete ? 1 : 0;
   return Math.max(floor, item.originalQuantity - removable - deducted);
   ```

2. **Activity log payload** (`changes.push({...})` for `qty_changed`) — add `zeroed: item.quantity === 0` so the timeline can render "line zeroed (paperwork)" distinctly from a partial decrease.

3. **Tooltip copy** — extend the existing `orders.deducted_to_extra_hint` text (EN/AR) to mention "you may reduce all the way to 0 to mirror a fully-cancelled line."

No changes to `canDeleteItem`, `revalidateConstraints`, the split-reduction math, or any DB/RPC. Delete remains blocked when extras exist (correct — that would orphan audit rows).

## Files

**Modified**
- `src/components/EditOrderDialog.tsx` — relax `getMinQuantity` floor; add `zeroed` flag to activity-log change entries.
- `src/lib/translations.ts` — extend `orders.deducted_to_extra_hint` copy.

**No DB migrations. No RPC changes. No new files.**

