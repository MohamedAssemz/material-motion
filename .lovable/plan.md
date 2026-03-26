

# Fix: Special Items Phase Stats & Extra Move Directly

## Issue 1: Special items incorrectly counted as completed in earlier phases

**Root cause**: `getPhaseStats` in `OrderDetail.tsx` counts any batch past a phase's state index as "completed" for that phase. A special item starting at packaging (e.g., `in_packaging`) has a state index higher than manufacturing and finishing, so it's counted as completed for both — even though it never went through them.

**Fix**: In `getPhaseStats`, filter out batches where the order item's `initial_state` indicates the batch skipped this phase entirely. A batch skips a phase if its `initial_state` is at or after the phase being measured.

For example, if `initial_state = 'in_packaging'`, the batch skips manufacturing and finishing. The logic maps each phase to a set of initial states that would skip it:
- Manufacturing: skipped by `in_finishing`, `in_packaging`, `in_boxing`
- Finishing: skipped by `in_packaging`, `in_boxing`
- Packaging: skipped by `in_boxing`
- Boxing: never skipped

This filter applies to `pastStateBatches` calculation (line ~642).

**File**: `src/pages/OrderDetail.tsx` — `getPhaseStats` function

## Issue 2: "Move directly" errors for special items with `ready_for_boxing`

**Root cause**: In `ExtraItemsTab.tsx`, `handleMoveDirectly` routes special items to `ready_for_boxing` with `box_id: null`. But the DB trigger `enforce_box_id_for_transitioning_states` requires `box_id` for `ready_for_boxing`.

**Fix**: Special items from extra inventory should go directly to `ready_for_shipment` instead of `ready_for_boxing` when using "Move directly". They don't need boxing processing — the whole point is they skip to shipment after their initial phase.

```typescript
// In handleMoveDirectly:
const targetState = batch.is_special ? "ready_for_shipment" : directState;
```

Same fix needed in `handleAssignToBox` — when assigning special items to a box, set state to `ready_for_boxing` (which requires `box_id`, and box is provided in that flow — so it works). But for "Move directly" (no box), use `ready_for_shipment`.

**File**: `src/components/ExtraItemsTab.tsx` — `handleMoveDirectly` function (line ~441)

## Files Summary

| File | Change |
|------|--------|
| `src/pages/OrderDetail.tsx` | Filter special items from phase stats for phases they skipped |
| `src/components/ExtraItemsTab.tsx` | Route special items to `ready_for_shipment` in `handleMoveDirectly` |

