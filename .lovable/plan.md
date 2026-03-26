

# Fix: Special Items Phase Stats + Manufacturing Tabs

## Three Issues

### 1. Manufacturing "Processed" tab shows 100 for items never processed
**Root cause**: `completedBatches` in `OrderManufacturing.tsx` fetches ALL batches past `in_manufacturing` state, including special items starting at finishing/packaging/boxing. The `processedBatchesForRate` filter excludes them from production rate but `completedGroups` and `totalCompleted` still count them.

**Fix**: Filter `completedBatches` the same way — exclude special items whose `initial_state` is not `in_manufacturing`.

```typescript
// Line ~211-215 in OrderManufacturing.tsx
const filteredCompleted = allCompleted.filter((b: any) => {
  if (['extra_manufacturing', ...].includes(b.from_extra_state)) return false;
  // Exclude special items that didn't start in manufacturing
  if (b.is_special && b.order_item?.initial_state !== 'in_manufacturing') return false;
  return true;
});
```

### 2. Special items from finishing shown as "completed" in packaging (OrderDetail)
**Root cause**: `skippedByInitialState` for packaging is `["in_boxing"]` only. A special item starting at `in_finishing` goes `in_finishing → ready_for_boxing → ready_for_shipment`, skipping packaging entirely. But `in_finishing` is not in the packaging skip list.

The current approach of listing specific initial states is fragile. Instead, use a phase order check: a special item skips a phase if its `initial_state` is not the current phase AND the item never passes through the current phase's `in_*` state.

**Fix**: Replace the skip list with proper phase-order logic. A special item skips a phase if its `initial_state` is NOT the current phase AND the `initial_state` is not before the current phase in the pipeline:

```typescript
const phaseOrder = ['in_manufacturing', 'in_finishing', 'in_packaging', 'in_boxing'];
const currentPhaseState = phaseToInState[phaseName]; // e.g., 'in_packaging'
const currentIdx = phaseOrder.indexOf(currentPhaseState);

// A special item skips this phase if its initial_state is AFTER this phase
// OR if its initial_state is BEFORE this phase (it jumps to ready_for_boxing after its initial phase)
// Actually: special items only go through their initial_state phase, then skip to boxing
// So exclude from any phase that is NOT the initial_state phase
if (orderItem?.is_special && orderItem.initial_state !== currentPhaseState) return false;
```

This is simpler and correct: special items are only counted in the phase matching their `initial_state`.

**File**: `src/pages/OrderDetail.tsx` — lines 642-657

### 3. Manufacturing tabs should be "Process, Extra, Completed" (not "Active")
**Fix**: Rename the tab label from `phase.active_tab` ("Active") to `phase.process` ("Process") in `OrderManufacturing.tsx` line 755.

```typescript
<TabsTrigger value="active">{t('phase.process')} ({totalInManufacturing})</TabsTrigger>
```

## Files Summary

| File | Change |
|------|--------|
| `src/pages/OrderManufacturing.tsx` | Filter completedBatches to exclude special items not starting in manufacturing; rename tab label |
| `src/pages/OrderDetail.tsx` | Simplify special item skip logic: exclude from any phase that isn't their `initial_state` |

