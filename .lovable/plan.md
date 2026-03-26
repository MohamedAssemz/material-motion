

# Plan: Special Items Flow

## Overview
Special items start at a user-chosen phase (manufacturing, finishing, packaging, or boxing) and follow a shortened cycle: **initial phase → ready_for_boxing → received as ready_for_shipment → shipped**. They skip all intermediate phases.

## Database Changes

### 1. Add columns to `order_items`
```sql
ALTER TABLE order_items ADD COLUMN is_special boolean NOT NULL DEFAULT false;
ALTER TABLE order_items ADD COLUMN initial_state text DEFAULT NULL;
```
`initial_state` stores values like `in_manufacturing`, `in_finishing`, `in_packaging`, `in_boxing`.

### 2. Add `is_special` to `order_batches` and `extra_batches`
```sql
ALTER TABLE order_batches ADD COLUMN is_special boolean NOT NULL DEFAULT false;
ALTER TABLE extra_batches ADD COLUMN is_special boolean NOT NULL DEFAULT false;
```
This flag travels with the batch through the pipeline and into extra inventory.

## Order Creation (`OrderCreate.tsx`)

### 3. UI: Add special item toggle + initial state selector per item row
- Add a "Special" checkbox next to each order item (alongside the existing "Boxing" checkbox)
- When checked, show a dropdown to select initial state: Manufacturing, Finishing, Packaging, Boxing
- Default initial state: `in_manufacturing`

### 4. Batch creation logic
When creating `order_batches` for a special item, set:
- `current_state` = the chosen `initial_state` (e.g., `in_finishing` instead of always `in_manufacturing`)
- `is_special` = `true`

## Phase Page Routing Changes

### 5. Phase completion routing for special items
In each phase page's "assign to box" handler, when the batch `is_special === true`, the next state should be `ready_for_boxing` regardless of which phase it's in. This applies to:

| File | Handler | Change |
|------|---------|--------|
| `OrderManufacturing.tsx` | `handleAssignToBox` | Special items → `ready_for_boxing` instead of `ready_for_finishing` |
| `OrderFinishing.tsx` | `handleAssignToBox` | Special items → `ready_for_boxing` instead of `ready_for_packaging` |
| `OrderPackaging.tsx` | `handleAssignToBox` | Special items → `ready_for_boxing` instead of same |
| `OrderBoxing.tsx` | `handleAcceptBoxes` | Special items arriving as `ready_for_boxing` → routed to `ready_for_shipment` (already happens for `needs_boxing=false`, but special items with `needs_boxing=true` should also go to `ready_for_shipment`) |

The key logic pattern in manufacturing/finishing/packaging:
```typescript
// When assigning completed items to a box:
const nextState = batch.is_special ? 'ready_for_boxing' : normalNextState;
```

In boxing's `handleAcceptBoxes`:
```typescript
// Special items go directly to ready_for_shipment when received
const batchesToShipment = selectedBatches.filter(
  b => b.order_item?.needs_boxing === false || b.is_special
);
```

### 6. Extra inventory preservation
When moving special items to extra (`MoveToExtraDialog` / `move_order_batches_to_extra` RPC):
- The `is_special` flag is already on the batch and will be copied to `extra_batches.is_special`

When retrieving from extra (`ExtraItemsTab`, `ExtraInventoryDialog`):
- Copy `is_special` from the extra batch to the new `order_batch`
- Special items retrieved follow the same shortened cycle

Update `move_order_batches_to_extra` RPC to copy `is_special`.

### 7. ExtraItemsTab move handlers
When `ExtraItemsTab` moves special items back into order:
- "Move directly" and "Assign to box" should set next state to `ready_for_boxing` (not the normal next phase state)

## Queue Pages

### 8. Queue visibility
Special items starting in finishing should appear in the finishing queue, not manufacturing. This already works because queue pages query by `current_state` — batches with `current_state = 'in_finishing'` will appear in the finishing queue naturally.

## StartOrderDialog

### 9. Show special items summary
Update `StartOrderDialog` to group batches by initial state, showing which items start where (e.g., "50 items in Finishing, 50 items in Manufacturing").

## OrderDetail / Timeline

### 10. Display special indicator
- Show a badge on order items table indicating "Special" items and their initial state
- Timeline should still work since it counts by `current_state`

## Translations

### 11. Add translation keys
- `order.special_item` / `order.initial_state` / `order.select_initial_state`
- Phase labels for the dropdown

## Files Summary

| File | Change |
|------|--------|
| Migration SQL | Add `is_special` + `initial_state` columns |
| `src/pages/OrderCreate.tsx` | Special checkbox + initial state dropdown per item; batch creation with custom `current_state` |
| `src/pages/OrderManufacturing.tsx` | Route special items to `ready_for_boxing` on completion |
| `src/pages/OrderFinishing.tsx` | Route special items to `ready_for_boxing` on completion |
| `src/pages/OrderPackaging.tsx` | Route special items to `ready_for_boxing` on completion |
| `src/pages/OrderBoxing.tsx` | Route special items to `ready_for_shipment` on receive |
| `src/components/ExtraItemsTab.tsx` | Preserve `is_special`; route special items to `ready_for_boxing` |
| `src/components/ExtraInventoryDialog.tsx` | Copy `is_special` when reserving |
| `src/components/StartOrderDialog.tsx` | Show batches grouped by initial state |
| `src/pages/OrderDetail.tsx` | Show special badge on items |
| `src/lib/translations.ts` | Add ~5 translation keys |
| Migration SQL (RPC update) | Update `move_order_batches_to_extra` to copy `is_special` |
| Migration SQL (RPC update) | Update `commit_extra_inventory` to respect `is_special` initial state |

