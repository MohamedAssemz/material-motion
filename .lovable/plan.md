

# Fix: Batch creation on order item quantity increase

## Problem
When editing an order and increasing an item's quantity (e.g., from 10 to 100), the code creates **90 individual batches each with quantity=1** instead of **one batch with quantity=90**. This is caused by a loop in `EditOrderDialog.tsx` (line 305): `for (let i = 0; i < delta; i++)`.

## Solution
Replace the loop with a single batch insert containing `quantity: delta`.

## File: `src/components/EditOrderDialog.tsx` (lines 302-321)

**Current code:**
```typescript
if (isInProgress) {
  const batchInserts = [];
  for (let i = 0; i < delta; i++) {
    const { data: codeData } = await supabase.rpc("generate_batch_code");
    batchInserts.push({
      order_id: orderId,
      product_id: item.product_id,
      order_item_id: item.id!,
      current_state: "in_manufacturing",
      quantity: 1,
      created_by: user?.id,
      qr_code_data: codeData || `B-...`,
      is_special: item.is_special,
    });
  }
  if (batchInserts.length > 0) {
    const { error } = await supabase.from("order_batches").insert(batchInserts);
    if (error) throw error;
  }
}
```

**Fixed code:**
```typescript
if (isInProgress) {
  const { data: codeData } = await supabase.rpc("generate_batch_code");
  const { error } = await supabase.from("order_batches").insert({
    order_id: orderId,
    product_id: item.product_id,
    order_item_id: item.id!,
    current_state: "in_manufacturing",
    quantity: delta,
    created_by: user?.id,
    qr_code_data: codeData || `B-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    is_special: item.is_special,
  });
  if (error) throw error;
}
```

This also applies the same fix to **new item creation** (lines ~370-400) — need to verify that path uses the same pattern.

