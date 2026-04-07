

# Fix Orders Page Units Counter

## Problem
Two bugs in the Orders page units counter:

1. **Broken batch query**: The `fetchOrders` function filters by `.eq("is_terminated", false)` (line 145), but `is_terminated` does not exist in the `order_batches` schema. This causes the query to return no results, making `shipped_count` always 0 — hence all orders show `0/X` in the Units column.

2. **Completion status conflation**: The `computed_status` on line 158 marks an order as "completed" when `shippedCount + extraCount >= unitCount`. This means orders where most items were moved to extra inventory (not actually shipped) appear as "Fulfilled" prematurely.

## Fix

### File: `src/pages/Orders.tsx`

1. **Remove `is_terminated` filter** from the batch query (lines 143-145). Just query `order_batches` normally:
   ```ts
   const { data: batches } = await supabase
     .from("order_batches")
     .select("current_state, quantity")
     .eq("order_id", order.id);
   ```

2. **Fix computed_status logic** — only count shipped items for fulfillment, not `deducted_to_extra`:
   ```ts
   } else if (order.status === "completed" || (unitCount > 0 && shippedCount >= unitCount)) {
     computed_status = "completed";
   }
   ```

3. **Update Units column display** to show shipped count properly (already correct logic at line 619, just broken by the query issue).

### Also clean up `src/pages/OrderBoxing.tsx`
Remove the `is_terminated` and `terminated_reason` fields from the batch update (line 852-855) since these columns don't exist in the schema.

