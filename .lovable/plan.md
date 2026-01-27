

## Fix: Items that Don't Need Packing Shouldn't Show as Completed in Packaging Phase

### Problem

Items with `needs_packing = false` on their product skip the packaging phase entirely (going from Finishing → directly to Boxing). However, these items are currently being counted as "completed" in the Packaging phase, which is incorrect since they were never packaged.

### Root Cause

The current logic determines "completed" items by checking if a batch's state index is greater than the phase's "in progress" state index. This doesn't account for items that skip phases based on product/order configuration.

**Current logic in OrderDetail.tsx:**
```typescript
const completed = activeBatches
  .filter((b) => getAllStates().indexOf(b.current_state) > stateIndex)
  .reduce((sum, b) => sum + b.quantity, 0);
```

This counts ALL items past `in_packaging` as "completed" for packaging, including items that skipped packaging entirely.

### Affected Files

| File | Issue |
|------|-------|
| `src/pages/OrderDetail.tsx` | `getPhaseStats()` counts skipped items as completed |
| `src/pages/OrderPackaging.tsx` | Completed tab shows items that skipped packaging |
| `src/components/OrderTimeline.tsx` | Timeline shows incorrect completion counts |

### Solution Approach

Filter completed items based on whether they actually went through the phase:

1. **For Packaging phase**: Only count items where `product.needs_packing = true`
2. **For Boxing phase**: Only count items where `order_item.needs_boxing = true`

### Implementation Details

#### 1. Update `OrderDetail.tsx` - getPhaseStats function

Modify the `getPhaseStats` function to accept a filter condition that excludes items that skip the phase.

**Before:**
```typescript
const getPhaseStats = (inState: string, readyState: string | undefined, phaseName: string): PhaseStats => {
  // ... waiting and inProgress logic ...
  const completed = activeBatches
    .filter((b) => getAllStates().indexOf(b.current_state) > stateIndex)
    .reduce((sum, b) => sum + b.quantity, 0);
  // ...
};
```

**After:**
```typescript
const getPhaseStats = (
  inState: string, 
  readyState: string | undefined, 
  phaseName: string,
  phaseFilter?: (batch: Batch) => boolean  // Optional filter for phase-specific items
): PhaseStats => {
  // Apply filter to all counts if provided
  const relevantBatches = phaseFilter 
    ? activeBatches.filter(phaseFilter) 
    : activeBatches;
  
  const waiting = readyState
    ? relevantBatches.filter((b) => b.current_state === readyState).reduce((sum, b) => sum + b.quantity, 0)
    : 0;
  const inProgress = relevantBatches.filter((b) => b.current_state === inState).reduce((sum, b) => sum + b.quantity, 0);
  const stateIndex = getAllStates().indexOf(inState as UnitState);
  const completed = relevantBatches
    .filter((b) => getAllStates().indexOf(b.current_state) > stateIndex)
    .reduce((sum, b) => sum + b.quantity, 0);
  // ... rest unchanged
};
```

**Usage:**
```typescript
// Packaging: only count items where needs_packing is true
const packagingStats = getPhaseStats(
  "in_packaging", 
  "ready_for_packaging", 
  "packaging",
  (b) => b.product?.needs_packing === true
);

// Boxing: only count items where needs_boxing is true (requires order_item lookup)
const boxingStats = getPhaseStats(
  "in_boxing", 
  "ready_for_boxing", 
  "boxing",
  (b) => {
    const orderItem = orderItems.find(oi => oi.id === b.order_item_id);
    return orderItem?.needs_boxing !== false;
  }
);
```

#### 2. Update `OrderPackaging.tsx` - Completed batches query

Filter completedBatches to only include items that actually went through packaging (products with `needs_packing = true`).

**Current query (lines 143-148):**
```typescript
// Fetch completed items for this phase (moved to next phases)
supabase.from('order_batches')
  .select('...')
  .eq('order_id', id)
  .eq('is_terminated', false)
  .in('current_state', ['ready_for_boxing', 'in_boxing', 'ready_for_shipment', 'shipped'])
```

**Updated approach:**
After fetching, filter to only include items where the product `needs_packing = true`:

```typescript
// In the data processing step, filter completed batches
const completedWithData = completedRes.data
  ?.filter((batch: any) => batch.product?.needs_packing === true)  // Only items that went through packaging
  .map((batch: any) => ({
    ...batch,
    box: batch.box_id ? boxMap.get(batch.box_id) : null,
    order_item: batch.order_item_id ? orderItemMap.get(batch.order_item_id) : null,
  })) || [];
```

#### 3. Update `OrderTimeline.tsx` - Stage completion logic

The timeline should exclude items from stages they didn't pass through. This requires passing product/order_item information to the timeline component.

**Option A**: Update `BatchInfo` interface to include `needs_packing` and filter in `getStageStatus`:

```typescript
// In getStageStatus, for packaging stages:
if (stageKey === 'ready_for_packaging' || stageKey === 'in_packaging') {
  // Only count items that need packing
  const packingBatches = batches.filter(b => b.needs_packing !== false);
  // ... use packingBatches for this stage's calculations
}
```

**Option B**: Calculate effective totals per stage based on what items apply:

```typescript
const getEffectiveTotalForStage = (stageKey: string) => {
  if (stageKey === 'ready_for_packaging' || stageKey === 'in_packaging') {
    return batches.filter(b => b.needs_packing !== false)
      .reduce((sum, b) => sum + b.total_quantity, 0);
  }
  if (stageKey === 'ready_for_boxing' || stageKey === 'in_boxing') {
    return batches.filter(b => b.needs_boxing !== false)
      .reduce((sum, b) => sum + b.total_quantity, 0);
  }
  return totalItems;
};
```

### Summary of Changes

| File | Change |
|------|--------|
| `src/pages/OrderDetail.tsx` | Add phase filter to `getPhaseStats()` for packaging (needs_packing) and boxing (needs_boxing) |
| `src/pages/OrderPackaging.tsx` | Filter `completedBatches` to only items with `needs_packing = true` |
| `src/components/OrderTimeline.tsx` | Update stage calculations to account for items that skip phases |

### Technical Considerations

1. **Backward compatibility**: Existing items that skipped packaging already have the correct state (they went directly to boxing). The fix only affects how counts are displayed.

2. **Default values**: When `needs_packing` is undefined/null, default to `true` (most items need packing). Same for `needs_boxing`.

3. **Extra inventory**: Extra batches follow the same phase-skipping logic, so the same filters should apply when counting extra inventory items in completed sections.

