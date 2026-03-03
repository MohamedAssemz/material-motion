

## Bug: Retrieved items from later phases inflate earlier phases' Production Rate

### Root Cause

When items are retrieved from extra inventory at a later phase (e.g., `extra_finishing`) and moved directly to the next phase (e.g., `in_packaging`), these batches end up in states like `in_packaging`, `ready_for_shipment`, etc. — which are included in Manufacturing's `completedBatches` query (it fetches ALL states past manufacturing).

The current subtraction logic only subtracts `retrievedFromExtraBatches` which is sourced from `extra_batch_history` filtered to `from_state = 'extra_manufacturing'`. Items retrieved from `extra_finishing`, `extra_packaging`, or `extra_boxing` are NOT subtracted, so they inflate Production Rate in all earlier phases.

### Fix

Filter `completedBatches` to exclude batches whose `from_extra_state` indicates they skipped the current phase entirely. The phase hierarchy is: manufacturing → finishing → packaging → boxing. An item retrieved from a later phase's extra state never went through earlier phases in this order.

| Phase | Exclude `from_extra_state` values |
|-------|----------------------------------|
| Manufacturing | `extra_finishing`, `extra_packaging`, `extra_boxing` |
| Finishing | `extra_packaging`, `extra_boxing` |
| Packaging | `extra_boxing` |
| Boxing | (none — already correct) |

Items with `from_extra_state` matching the current phase (e.g., `extra_manufacturing` in Manufacturing) are already handled by the existing `processedBatchesForRate` subtraction using `extra_batch_history`.

### Changes

**`src/pages/OrderManufacturing.tsx`** (~line 211):
After fetching `allCompleted`, filter out batches that skipped manufacturing:
```typescript
const allCompleted = (completedRes.data || []) as any[];
const filteredCompleted = allCompleted.filter(
  (b: any) => !['extra_finishing', 'extra_packaging', 'extra_boxing'].includes(b.from_extra_state)
);
setCompletedBatches(filteredCompleted as unknown as Batch[]);
```

**`src/pages/OrderFinishing.tsx`** (~line 239):
Same pattern, excluding batches that skipped finishing:
```typescript
const filteredCompleted = completedWithData.filter(
  (b: any) => !['extra_packaging', 'extra_boxing'].includes(b.from_extra_state)
);
setCompletedBatches(filteredCompleted as Batch[]);
```

**`src/pages/OrderPackaging.tsx`**:
Exclude batches that skipped packaging:
```typescript
const filteredCompleted = completedWithData.filter(
  (b: any) => b.from_extra_state !== 'extra_boxing'
);
setCompletedBatches(filteredCompleted as Batch[]);
```

**`src/pages/OrderBoxing.tsx`**: No change needed — boxing is the last phase.

### Files to modify
- `src/pages/OrderManufacturing.tsx`
- `src/pages/OrderFinishing.tsx`
- `src/pages/OrderPackaging.tsx`

