

# Enforce Editing Constraints: Decrease/Delete Limited to Idle Manufacturing Batches

## Problem
Currently, admins can decrease or delete any order item without restriction on batch states. The new rules are:
1. **Decrease**: Only allowed by the amount of units still in `in_manufacturing` state AND not marked as "started working" (no entry in `order_item_progress` for the manufacturing phase).
2. **Delete**: Only allowed if the item's **entire** quantity is in `in_manufacturing` AND not started working.

## Changes

### File: `src/components/EditOrderDialog.tsx`

**1. Fetch constraints on dialog open**

When the dialog opens for an `in_progress` order, query two things per existing item:
- Count of batches in `in_manufacturing` state (sum of quantities) → `removableQty`
- Whether the item has an entry in `order_item_progress` with `phase = 'manufacturing'` → if yes, `removableQty = 0`

Store this as a map: `Record<itemId, { removableQty: number }>`.

**2. Enforce minimum quantity on the input**

For each existing item, set `min` on `NumericInput` to `item.originalQuantity - removableQty` (i.e., the quantity that has already progressed beyond manufacturing or is being worked on). This prevents decreasing below what's removable.

**3. Block delete button**

Disable the delete (trash) button for items where `removableQty < item.originalQuantity`. Show a tooltip or visual cue explaining the item can't be deleted because some units have progressed.

**4. Validate on save**

Before processing decreases/deletions in `handleSave`, re-validate the constraints server-side (re-fetch manufacturing batch counts and progress status) to prevent race conditions.

**5. Update `deleteBatchesByPriority`**

Restrict it to only delete batches in `in_manufacturing` state (remove the loop over other states for decrease scenarios). The priority list is no longer relevant for decreases — only `in_manufacturing` batches without "started working" are eligible.

### UI Behavior Summary

- Quantity input minimum is dynamically calculated: `originalQty - removableQty`
- If `removableQty === 0`, the input is effectively locked at original quantity (increase only)
- Delete button grayed out with indicator when item can't be fully removed
- Error toast if validation fails on save (e.g., someone started working between dialog open and save)

### Technical Detail

```text
fetchRemovableQuantities():
  For each order item:
    1. Check order_item_progress for (order_id, order_item_id, phase='manufacturing')
       → if exists: removableQty = 0
    2. Else: SELECT SUM(quantity) FROM order_batches 
             WHERE order_item_id = X AND current_state = 'in_manufacturing'
       → removableQty = result
```

