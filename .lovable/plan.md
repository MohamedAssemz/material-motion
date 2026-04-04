

# Fix Extra Inventory Counts to Respect Size

## Problem
The "Available in Extra" count on the Order Detail page currently sums all extra batches matching the product, regardless of size. If extra inventory has 100 size S and 100 size L of item A, but the order only needs size S, the count incorrectly shows 200 instead of 100.

## Change

### File: `src/pages/OrderDetail.tsx` — `fetchExtraInventoryCounts()`

Currently the function:
1. Collects all `product_id`s from order items
2. Queries `extra_batches` filtering by `product_id IN (...)` and `inventory_state = 'AVAILABLE'`
3. Sums all quantities

**Fix**: Instead of just filtering by product_id, also match on size. Since different order items for the same product can have different sizes, the logic needs to:

1. Build a list of unique `(product_id, size)` pairs from `orderItems`
2. Fetch all AVAILABLE extra batches for those product IDs
3. Only count batches where both `product_id` AND `size` match an order item's `(product_id, size)` pair (using `null === null` for items without sizes)

```typescript
// Build product+size pairs from order items
const orderProductSizePairs = orderItems.map(oi => ({
  product_id: oi.product_id,
  size: oi.size || null,
}));

// Fetch extra batches for relevant products
const { data } = await supabase
  .from("extra_batches")
  .select("quantity, product_id, size")
  .eq("inventory_state", "AVAILABLE")
  .eq("current_state", state)
  .in("product_id", productIds);

// Filter client-side to match product+size pairs
const matched = (data || []).filter(b =>
  orderProductSizePairs.some(p =>
    p.product_id === b.product_id &&
    (p.size || null) === (b.size || null)
  )
);
counts[phase] = matched.reduce((sum, b) => sum + b.quantity, 0);
```

This ensures only size-compatible extra inventory is counted.

## Files to Edit
1. `src/pages/OrderDetail.tsx` — update `fetchExtraInventoryCounts` to filter by size

