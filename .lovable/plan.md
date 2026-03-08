

## Bug Analysis

The `handleForceEmpty` function in `BoxDetailsDialog.tsx` (lines 153-239) has two issues:

### Bug 1: Extra-origin batches are incorrectly returned to extra inventory
When a batch has `from_extra_state` set (meaning it was retrieved from extra inventory), the current code recreates it as a reserved extra batch and deletes the order batch. This is wrong. Once an item has been retrieved from extra inventory and moved into the order pipeline, force-emptying a box should simply revert it to the previous production state like any other order batch -- not send it back to extra inventory.

The `from_extra_state` flag is only a provenance marker for traceability. It should not affect force-empty behavior.

### Bug 2: State reversion is correct in the map but only applied to non-extra batches
The `previousStateMap` correctly maps states (e.g., `ready_for_finishing` -> `in_manufacturing`), but this logic is inside the `else` branch and only runs for batches without `from_extra_state`.

## Plan

**File: `src/components/BoxDetailsDialog.tsx`**

Simplify the `handleForceEmpty` function for order boxes. Remove the entire `from_extra_state` check branch (lines 162-216). All order batches, regardless of provenance, should be treated the same way:

1. Look up `previousStateMap[batch.current_state]` to get the previous state
2. Update the batch: set `current_state` to the previous state and clear `box_id` to `null`

The revised loop body (lines 158-225) becomes:

```typescript
for (const batch of orderBatches) {
  const prevState = previousStateMap[batch.current_state];
  if (prevState) {
    await supabase
      .from('order_batches')
      .update({ current_state: prevState, box_id: null })
      .eq('id', batch.id);
  }
}
```

This removes the per-batch extra fetch, the history lookup, the extra batch recreation, and the extra box fallback search. All batches revert to their previous production state uniformly, preserving the `from_extra_state` provenance marker for traceability without altering the reversion behavior.

