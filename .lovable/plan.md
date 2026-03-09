

## Prioritize Machine-Assigned Batches When Processing

### Problem
In `OrderManufacturing.tsx` line 511, batches are sorted only by quantity. When processing items, the system may pick unassigned batches first, ignoring ones that already have a `manufacturing_machine_id`. This happens after force-emptying a box returns items to manufacturing — the re-processed items come from the wrong (unassigned) batch.

The same pattern exists in other phase pages where batches are iterated without machine-priority sorting.

### Changes

**1. `src/pages/OrderManufacturing.tsx`** — Change the batch sort in `handleAssignToBox` (line 511) to prioritize batches with `manufacturing_machine_id` first, then by quantity:
```ts
const sortedBatches = [...group.batches].sort((a, b) => {
  const aHasMachine = a.manufacturing_machine_id ? 0 : 1;
  const bHasMachine = b.manufacturing_machine_id ? 0 : 1;
  if (aHasMachine !== bHasMachine) return aHasMachine - bHasMachine;
  return a.quantity - b.quantity;
});
```

**2. `src/pages/OrderFinishing.tsx`** — Same pattern for `finishing_machine_id` in the batch iteration loop.

**3. `src/pages/OrderPackaging.tsx`** — Same pattern for `packaging_machine_id` in both batch iteration loops.

**4. `src/pages/OrderBoxing.tsx`** — Same pattern for `boxing_machine_id` in batch iteration loops.

**5. `src/components/StateGroupView.tsx`** — Sort batches by whether they have any machine ID assigned before distributing quantity allocations.

This ensures that when selecting a quantity to process, the system always consumes batches with machine assignments first, preserving production traceability.

