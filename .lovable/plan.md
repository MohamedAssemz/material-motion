

# Fix: Packaging Completed Count + Empty State for Special Items

## Problem
1. `completedBatches` still includes special items that skipped packaging — the filter at line 239 only excludes `from_extra_state` but not special items by `initial_state`
2. This inflates the completed card count (50) and tab label "Completed (50)"
3. The empty state at line 1127 checks `completedGroups.length === 0 && completedBatches.length === 0` but also needs to account for `processedBatchesForRate` and `addedToExtraItems` being empty

## Changes

### File: `src/pages/OrderPackaging.tsx`

**1. Filter special items from `completedBatches` at the source (line 239-241)**

Add the special item exclusion to `filteredCompleted` so all downstream consumers (counts, groups, tab labels) are correct:

```typescript
const filteredCompleted = allCompletedWithData.filter((b: any) => {
  if (['extra_packaging', 'extra_boxing'].includes(b.from_extra_state)) return false;
  // Exclude special items that didn't start in packaging
  if (b.is_special && b.order_item?.initial_state !== 'in_packaging') return false;
  return true;
});
```

**2. Fix empty state condition (line 1127)**

Update the empty state to show when there's truly nothing in the completed tab — no production rate items, no retrieved-from-extra, and no added-to-extra:

```typescript
{processedBatchesForRate.length === 0 && retrievedFromExtraBatches.length === 0 && addedToExtraItems.length === 0 && (
  <Card>
    <CardContent className="p-8 text-center text-muted-foreground">
      {t('phase.no_completed_items')}
    </CardContent>
  </Card>
)}
```

This single source-level filter fix will cascade to the completed card showing 0, the tab showing "Completed (0)", and the empty state appearing correctly.

