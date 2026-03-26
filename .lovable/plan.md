

# Fix: Special Items in Production Rate + Boxing Rate Filtering

## Problem
1. Special items (e.g., starting at finishing) appear in the production rate of phases they skipped (manufacturing, packaging, etc.)
2. Boxing production rate shows items that were routed directly to `ready_for_shipment` (special items, `needs_boxing=false`) — these weren't actually processed in boxing

## Solution

### 1. Filter special items from production rate in phases they skipped
In each phase page's `processedBatchesForRate` (or equivalent filter), exclude special batches whose `initial_state` indicates they skipped this phase.

**Files**: `OrderManufacturing.tsx`, `OrderFinishing.tsx`, `OrderPackaging.tsx`

```typescript
// Example for manufacturing:
const processedBatchesForRate = completedBatches.filter(b => {
  if (b.is_special) {
    const initialState = b.order_item?.initial_state;
    // Only count in manufacturing if initial_state is in_manufacturing
    return initialState === 'in_manufacturing';
  }
  return true;
});
```

Same pattern for finishing (only count `in_manufacturing` or