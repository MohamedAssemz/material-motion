

## Fix: Production Rate Shows 19 Instead of Correct Count

### Problem

The Production Rate section in Manufacturing currently shows 19 assignable items, but the actual count should reflect only items that were **genuinely processed through manufacturing in this order** — excluding items retrieved from extra inventory.

### Root Cause

On line 202-204 of `OrderManufacturing.tsx`, `completedBatches` excludes batches from later extra states but **does not exclude `extra_manufacturing`**:

```typescript
const filteredCompleted = allCompleted.filter(
  (b: any) => !['extra_finishing', 'extra_packaging', 'extra_boxing'].includes(b.from_extra_state)
);
```

This means the 20 items retrieved from `extra_manufacturing` are included in `completedBatches`. The `processedBatchesForRate` memo then tries to subtract retrieved quantities, but batch splitting during the force-empty/re-process workflow causes an off-by-one mismatch (20 retrieved batches minus 20 subtracted = should be 0, but splitting artifacts cause it to land on 19 instead of the true count).

### Fix

**`src/pages/OrderManufacturing.tsx` (line 203):** Add `extra_manufacturing` to the exclusion list so retrieved items are never included in the production rate source data:

```typescript
const filteredCompleted = allCompleted.filter(
  (b: any) => !['extra_manufacturing', 'extra_finishing', 'extra_packaging', 'extra_boxing'].includes(b.from_extra_state)
);
```

Apply the same pattern to the other phase pages:

- **`src/pages/OrderFinishing.tsx`:** Add `'extra_finishing'` to its exclusion list
- **`src/pages/OrderPackaging.tsx`:** Add `'extra_packaging'` to its exclusion list  
- **`src/pages/OrderBoxing.tsx`:** Add `'extra_boxing'` to its exclusion list

Also apply the same fix in `MachineProductionTab.tsx`:

- **`src/components/reports/MachineProductionTab.tsx`:** Update query to include `from_extra_state`, and skip machine columns in `flattenBatches` where `from_extra_state` matches the phase (`extra_${type}`)

### Result

For order TESTNOW: Production Rate will show only the items that were actually manufactured in this order, with no contamination from extra inventory retrievals regardless of batch splitting.

