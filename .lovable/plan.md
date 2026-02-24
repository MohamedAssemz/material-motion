

## Fix Extra Inventory Dialog, Completed Counts, and Packaging Reference

### Problem Summary

1. **EI Dialog overflow + "Order needs" ignores boxing**: The dialog layout overflows on smaller screens, and `getMaxForProduct` on line 712 is called without `batchState`, so it sums ALL order items for a product regardless of `needs_boxing`. For `extra_boxing` batches, the count should only include `needs_boxing=true` items.

2. **Extra inventory items shown as completed in wrong phases**: When items are consumed from `extra_finishing`, they appear as "completed" in the Manufacturing phase because `completedBatches` fetches ALL batches past manufacturing state -- including those that were never manufactured in this order. The same issue applies to other phases.

3. **Completed count excludes "added to extra"**: The completed tab count (`totalCompleted`) only counts batches moved to the next phase, but items moved to extra inventory are also "completed" work. The tab label and stats card should include both.

4. **Packaging reference treats duplicate products as one**: The dropdown `value` uses `item_product_id` (product ID), so when two order items share the same product (boxed vs unboxed), they collapse to one entry. The max quantity calculation also groups by product ID instead of by order item index.

---

### Fix 1: EI Dialog -- Overflow + "Order needs" respects boxing

**File**: `src/components/ExtraInventoryDialog.tsx`

- **Overflow fix**: Add `overflow-hidden` to the `DialogContent` and wrap the full body in a flex column layout so the `ScrollArea` properly constrains content.
- **"Order needs" fix**: On line 712, change `getMaxForProduct(group.product_id)` to `getMaxForProduct(group.product_id, PHASE_CURRENT_STATE_MAP[phase])` so it passes the batch state. This ensures the displayed "Order needs" count filters by `canOrderItemUseBatch`, correctly showing 100 (not 200) for `extra_boxing` when only one order item has `needs_boxing=true`.

---

### Fix 2: Exclude extra-sourced batches from phase completed counts

**Files**: `src/pages/OrderManufacturing.tsx`, `src/pages/OrderFinishing.tsx`, `src/pages/OrderPackaging.tsx`, `src/pages/OrderBoxing.tsx`

The problem: When extra inventory from `extra_finishing` is consumed into an order, it creates `order_batches` starting at `in_finishing` or later. These batches were never in `in_manufacturing`, so they should not appear as "completed" in the Manufacturing phase.

**Solution**: After fetching `completedBatches`, filter them to only include batches that actually passed through the current phase. The approach:

- For **Manufacturing**: Only count completed batches that have a `manufacturing_machine_id` set, OR whose `order_item_id` matches original order items (not extra-sourced). A simpler approach: fetch `extra_batch_history` with `event_type='CONSUMED'` and `consuming_order_id=orderId` to get batch IDs that originated from extra inventory. Then exclude those from `completedBatches` if their originating extra state was at or after the current phase.

Actually, the cleanest approach: When extra inventory is consumed into an order, the resulting `order_batches` are created at a specific state (e.g., `in_finishing`). These batches would never have been in `pending_rm` or `in_manufacturing`. So we can filter `completedBatches` by checking if each batch has a corresponding `order_item_id` that was part of the original order creation. But that's complex.

**Simpler solution**: Track which batches came from extra inventory. The `extra_batch_history` table has `CONSUMED` events with `consuming_order_id`. We can fetch the batch IDs that were created from extra inventory consumption and exclude them from the completed count for phases they skipped.

**Practical implementation**: For each phase page, after fetching completed batches, also fetch consumed extra history for this order. For Manufacturing phase: if an extra batch was consumed from `extra_finishing` or later state, the resulting order batch skipped manufacturing -- exclude it. For Finishing: if consumed from `extra_packaging` or later, exclude it. And so on.

The `extra_batch_history` `CONSUMED` events store the `from_state` of the consumed extra batch. We can map:
- `extra_manufacturing` -> entered at manufacturing, so completed in manufacturing (include)
- `extra_finishing` -> entered at finishing, skipped manufacturing (exclude from mfg completed)
- `extra_packaging` -> skipped mfg + finishing (exclude from both)
- `extra_boxing` -> skipped mfg + finishing + packaging (exclude from all three)

**Implementation per phase page**:
1. Fetch `extra_batch_history` where `consuming_order_id = orderId` and `event_type = 'CONSUMED'`
2. For records whose `from_state` indicates the batch skipped the current phase, collect the resulting `order_batch` IDs (stored in notes or derivable from `consuming_order_item_id`)

Wait -- the `extra_batch_history` doesn't directly store the resulting `order_batch` ID. Let me check what data is available.

Actually, the simplest approach: When extra inventory is consumed (in `ExtraInventoryDialog.handleConfirm`), the code calls `reduceOrderBatchesForOrderItem` which REDUCES existing order batches. The extra inventory doesn't create NEW order batches -- it replaces capacity. So the completed count should already be correct because the extra-sourced items are consumed as extra batches, not as order batches.

Wait, let me re-read the flow. In `ExtraItemsTab.handleAssignToBox`, it DOES create new `order_batches` from extra inventory. That's the consumption path. These new order batches start at states like `ready_for_packaging` (if consumed from finishing phase). These would then appear in Manufacturing's completed query since they're in states past manufacturing.

**The fix**: When fetching `completedBatches`, also fetch which `order_batch` IDs were created from extra inventory consumption. The `ExtraItemsTab` creates order batches and we need a way to identify them.

**Best approach**: Add a simple filter -- completed batches for Manufacturing should only include batches that have been in the manufacturing states at some point. Since we already have `manufacturing_machine_id` as a signal (set during manufacturing), we could use that. But it's optional.

**Cleanest approach**: Compare `completedBatches` against the order's original batches. Original batches were created at order creation time. Extra-sourced batches were created later. We can filter by `created_at` or by checking `extra_batch_history`.

**Most practical approach**: For each phase's completed query, only fetch batches whose states indicate they actually passed through that phase. For Manufacturing completed: only include batches that are in states reachable from manufacturing (all post-manufacturing states). But the issue is that extra-consumed batches also end up in those states.

**Final approach -- use `created_at` heuristic**: Actually, the simplest and most reliable approach is: in each phase page, fetch `extra_batch_history` with `event_type = 'CONSUMED'` and `consuming_order_id = orderId`, get the `from_state` values, and use the `consuming_order_item_id` + quantities to determine how many items entered at each phase. Then subtract those from the completed count for phases they skipped.

Let me simplify: We don't need per-batch tracking. We need per-product quantity adjustments.

For Manufacturing completed tab:
- Fetch CONSUMED history for this order
- Group by product_id
- For each consumed record where `from_state` is NOT `extra_manufacturing`, subtract that quantity from the completed count (those items never went through manufacturing)

This means adjusting `totalCompleted` and potentially hiding/reducing entries in `completedGroups`.

**Implementation**:
1. In `fetchAddedToExtra` (or a new function), also fetch CONSUMED extra_batch_history for this order
2. Store consumed-from-later-phases quantities
3. Subtract from `totalCompleted` display
4. Filter `completedBatches` to exclude the quantity that came from extra inventory at later phases

Actually, it's even simpler. The `ExtraItemsTab` creates order batches with specific states. For Manufacturing's `completedBatches` query, we fetch batches in states like `ready_for_finishing`, `in_finishing`, etc. If a batch was created by extra consumption from `extra_finishing`, it would start at `in_finishing` or `ready_for_packaging` -- and it would be in states that Manufacturing's completed query picks up.

**The most surgical fix**: Track consumed-from-extra quantities per phase and subtract from the completed count display.

New function in each phase page: `fetchExtraConsumedSkipped()` that queries `extra_batch_history` for `CONSUMED` events where `consuming_order_id = orderId` and `from_state` is a phase that skips the current phase. Store the total quantity. Subtract from `totalCompleted`.

For completedBatches display grouping, we can't easily identify which specific batches to exclude without additional tracking. So the simplest visible fix:
- Adjust `totalCompleted` count by subtracting skipped-phase extra consumed quantities
- This gives correct numbers in the stats card and tab label

For the actual `completedGroups` card list: those batches are real order batches now, so showing them isn't entirely wrong (they ARE completed for this order). The issue is more about the COUNT being inflated. Subtracting from the total count is the right fix.

---

### Fix 3: Include "added to extra" in completed count

**Files**: `src/pages/OrderManufacturing.tsx`, `src/pages/OrderFinishing.tsx`, `src/pages/OrderPackaging.tsx`, `src/pages/OrderBoxing.tsx`

Currently `totalCompleted` only sums batches moved to next phases. Items added to extra inventory are also completed work.

**Change**: Add `addedToExtraItems` total to `totalCompleted`:

```typescript
const totalAddedToExtra = addedToExtraItems.reduce((sum, item) => sum + item.quantity, 0);
const totalCompleted = completedGroups.reduce(...) + totalAddedToExtra;
```

Update the Completed tab label and stats card to show this combined count.

---

### Fix 4: Packaging reference -- unique order items, not just product IDs

**File**: `src/pages/OrderCreate.tsx`

The bug: `packagingRows` uses `item_product_id` (product ID) as the value, so two order items with the same product (boxed vs unboxed) map to the same value. The dropdown also uses product ID as `SelectItem` value.

**Fix**: Use the order item index instead of product ID as the identifier, since each row in `items[]` is unique by index.

- Change `packagingRows` type to `Array<{ item_index: number; quantity: number }>` (use index into `items[]` array)
- Update the dropdown to use index as value, showing product name + boxing status to differentiate
- Update `maxQty` calculation to use the specific item's quantity (by index), not aggregate by product
- Update `totalAllocated` to filter by `item_index` match instead of product ID
- Update the serialization on submit to use the item at the specific index

---

### Files to Change

| File | Changes |
|------|---------|
| `src/components/ExtraInventoryDialog.tsx` | Fix overflow CSS; pass `batchState` to `getMaxForProduct` in render |
| `src/pages/OrderManufacturing.tsx` | Add extra-consumed-skipped subtraction; add extra-to-extra to completed count |
| `src/pages/OrderFinishing.tsx` | Same as Manufacturing |
| `src/pages/OrderPackaging.tsx` | Same as Manufacturing |
| `src/pages/OrderBoxing.tsx` | Same as Manufacturing |
| `src/pages/OrderCreate.tsx` | Change packaging reference to use item index instead of product ID |

No database changes required.

