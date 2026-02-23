

## Fix Extra Inventory Reservation: Boxing Rules, Already-Reserved Deduction, and Full-Reservation Start

### Problems

1. **Already-reserved items not deducted**: When the ExtraInventoryDialog opens, the max quantity per product uses the raw `orderItems[].quantity` without subtracting quantities already reserved from extra inventory. This allows double-reserving.

2. **Boxing rules not fully enforced**: When reserving from `extra_boxing`, items with `needs_boxing=false` should not count toward available capacity. The `getMaxForProduct` function partially handles this, but the capacity initialization in `handleConfirm` does not filter by `canOrderItemUseBatch`, allowing incorrect distribution.

3. **Cannot start fully-reserved order**: When all order batches are deleted (fully replaced by extra inventory reservations), `StartOrderDialog` shows "No pending items to manufacture" and disables the Start button. The order gets stuck.

---

### Fix 1: Deduct already-reserved quantities (ExtraInventoryDialog.tsx)

**When the dialog opens** (`fetchExtraBatches`), also fetch reserved extra batches for this order to know how much capacity is already used per order item.

- Query `extra_batches` where `order_id = orderId` and `inventory_state = 'RESERVED'`
- Build a map: `order_item_id -> already_reserved_qty`
- Store in new state: `reservedPerOrderItem: Map<string, number>`

**In `getMaxForProduct`**: Subtract already-reserved quantities from each order item's capacity:

```
orderItems
  .filter(oi => oi.product_id === productId && canOrderItemUseBatch(oi, batchState))
  .reduce((sum, oi) => sum + Math.max(0, oi.quantity - reservedPerOrderItem.get(oi.id) || 0), 0)
```

**In `handleConfirm` capacity initialization**: Same adjustment -- initialize `orderItemCapacity` with `oi.quantity - alreadyReserved` instead of raw `oi.quantity`.

---

### Fix 2: Filter capacity by boxing rules in handleConfirm (ExtraInventoryDialog.tsx)

In `handleConfirm`, when iterating over selections and finding matching order items, the current code calls `getOrderItemsForProduct(batch.product_id, batch.current_state)` which already filters by `canOrderItemUseBatch`. However, the `orderItemCapacity` map is initialized with ALL order items unfiltered. This means a `needs_boxing=false` order item still has capacity that could theoretically be assigned.

**Fix**: When processing each selection's batch, only consider order items whose capacity is valid for that batch's state. The existing `getOrderItemsForProduct` call already does this filtering, so the core logic is correct. The actual bug is in `getMaxForProduct` where capacity should be state-aware, which is already partially done but the `handleQuantityChange` quantity capping needs to consistently use the state-filtered max minus already-reserved.

This is inherently addressed by Fix 1 since `getMaxForProduct` already filters by `canOrderItemUseBatch` -- the missing piece was not deducting already-reserved quantities.

---

### Fix 3: Allow starting a fully-reserved order (StartOrderDialog.tsx)

When there are no `pending_rm` batches but there ARE reserved extra batches, the order should still be startable. The dialog should:

1. Fetch reserved extra batches for the order (from `extra_batches` where `order_id = orderId` and `inventory_state = 'RESERVED'`)
2. If there are reserved extra batches but no pending_rm order batches, show a different message: "All items will be fulfilled from extra inventory"
3. Enable the Start button in this case
4. On start: Update order status to `in_progress` (no batch state transitions needed since there are no order batches to transition)

**Changes to `handleStartOrder`**:
- If `pendingBatches.length === 0` but reserved extra batches exist, just update order status to `in_progress`
- If both pending batches AND reserved extra exist, transition pending batches as before AND update status

**UI changes**:
- Show reserved extra items in the dialog alongside pending items
- Change the disabled condition: button is disabled only when BOTH pending batches and reserved extra are empty

---

### Files to Change

| File | Change |
|------|--------|
| `src/components/ExtraInventoryDialog.tsx` | Fetch reserved quantities on open; deduct from max capacity in `getMaxForProduct` and `handleConfirm` |
| `src/components/StartOrderDialog.tsx` | Fetch reserved extra batches; allow starting when only extra inventory covers the order; show extra items in summary |

### No database changes required.

