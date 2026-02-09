
## Two Fixes: Boxing Phase Static Display + Print Quantity Bug

### Fix 1: Show "No Boxing" items as static rows in Production Rate (Boxing phase only)

**Clarification from user:** The static "No Boxing" display only applies in the **boxing phase**. Items with `needs_boxing = false` still get machine assignments in manufacturing, finishing, and packaging phases as normal.

**Changes to `src/components/ProductionRateSection.tsx`:**

1. Add `needs_boxing` to `GroupedBatch` interface
2. Include `needs_boxing` in grouping key so boxing vs no-boxing items stay separate
3. Propagate `needs_boxing` from batch data into the group
4. Import `PackageX` icon from lucide-react
5. When `machineType === 'boxing'` and group has `needs_boxing === false`:
   - Render a static card with a muted style (e.g., `bg-muted/30`)
   - Show a `PackageX` icon and "No Boxing" badge instead of machine controls
   - No Select dropdown or Assign button
6. Fix the early return: currently returns `null` if `machines.length === 0`, but boxing phase might have no-boxing items to display even without machines. Change condition to account for this.

**Rendering logic:**
```
if machineType === 'boxing' && group.needs_boxing === false:
  -> Static card: product name, SKU, qty, PackageX icon, "No Boxing" badge
else:
  -> Normal card with machine select + assign button (existing behavior)
```

---

### Fix 2: Print uses original order item quantities

**Problem:** `handlePrintOrder` in `OrderDetail.tsx` sums `batch.quantity` for non-terminated batches, which gives incorrect totals when batches have been split or terminated. The order items have the correct planned quantities.

**Changes to `src/pages/OrderDetail.tsx` (lines 442-453):**

Replace the batch-based quantity calculation:
```typescript
const itemsByProduct = new Map();
order.batches.filter(b => !b.is_terminated).forEach(batch => {
  // ... sums batch quantities
});
```

With direct use of `orderItems`:
```typescript
const itemsList = orderItems.map(item => ({
  name: item.product?.name || 'Unknown',
  sku: item.product?.sku || 'N/A',
  quantity: item.quantity,
}));
```

Then update the HTML template (lines 491-497) to iterate over `itemsList` instead of `itemsByProduct.values()`.

---

### Files to Modify

| File | Change |
|------|--------|
| `src/components/ProductionRateSection.tsx` | Add `needs_boxing` to grouping, render static cards for no-boxing items in boxing phase |
| `src/pages/OrderDetail.tsx` | Use `orderItems` quantities instead of batch sums in `handlePrintOrder` |
