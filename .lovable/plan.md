

## Bug: Production Rate in Completed Tab Shows Retrieved Items

### Problem
The completed tab's Production Rate section feeds ALL `completedBatches` (80 items) — including the 50 that were retrieved from extra inventory and never went through manufacturing. These 50 items should not appear as "needing machine assignment" in Production Rate.

The previous fix intentionally stopped filtering by `from_extra_state` because that field is unreliable (corrupted by merges). But showing everything in Production Rate is also wrong.

### Solution
Since we now have reliable retrieved counts from `extra_batch_history`, we should **exclude retrieved batches from Production Rate** using a hybrid approach:

1. **Filter `completedBatches` by `from_extra_state`** to remove items where `from_extra_state` matches the current phase's extra state (e.g., `extra_manufacturing`). This handles clean data.
2. The Retrieved section already uses `extra_batch_history` as source of truth, so it remains accurate regardless.

This same pattern applies to all 4 phase pages since they all have the same structure.

### Changes

**All 4 phase pages** (`OrderManufacturing.tsx`, `OrderFinishing.tsx`, `OrderPackaging.tsx`, `OrderBoxing.tsx`):

- When setting `completedBatches`, filter OUT batches where `from_extra_state` matches the current phase's extra state. These items bypassed the phase and belong only in the Retrieved section (sourced from history).
- The Production Rate section then only shows items that were actually processed in this phase.
- The Retrieved section continues using `extra_batch_history` as its immutable source of truth.

For Manufacturing specifically (line ~184):
```typescript
const allCompleted = (completedRes.data || []) as any[];
// Filter out batches that skipped this phase (retrieved from extra_manufacturing)
const processedCompleted = allCompleted.filter(
  (b: any) => b.from_extra_state !== 'extra_manufacturing'
);
setCompletedBatches(processedCompleted as unknown as Batch[]);
```

Same pattern for Finishing (`extra_finishing`), Packaging (`extra_packaging`), Boxing (`extra_boxing`).

### Files to modify
| File | Change |
|------|--------|
| `src/pages/OrderManufacturing.tsx` | Filter completedBatches to exclude `from_extra_state = 'extra_manufacturing'` |
| `src/pages/OrderFinishing.tsx` | Filter completedBatches to exclude `from_extra_state = 'extra_finishing'` |
| `src/pages/OrderPackaging.tsx` | Filter completedBatches to exclude `from_extra_state = 'extra_packaging'` |
| `src/pages/OrderBoxing.tsx` | Filter completedBatches to exclude `from_extra_state = 'extra_boxing'` |

