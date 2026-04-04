

# Add Size to Extra Batches

## Overview
Add a `size` column to `extra_batches` so that surplus inventory is tracked per product-size combination. When creating extra batches, users must select a size. The extra inventory table displays size. Reservation filtering matches extra batches to order items by both product AND size.

## Database Changes

### Migration: Add `size` column to `extra_batches`
```sql
ALTER TABLE public.extra_batches ADD COLUMN size text;
```
No default needed — existing rows will have NULL (legacy data without size tracking).

### Update `move_order_batches_to_extra` RPC
The RPC creates extra batches from order batches. Order batches are linked to `order_items` which have a `size` column. The RPC must:
- Look up the `size` from `order_items` via `order_item_id` on the source batch
- Set `size` on the created/merged extra batch
- Merge logic must also match on `size` (same product + box + state + size + is_special)

### Update `commit_extra_inventory` RPC
When creating replacement order batches from unretrieved reserved extra batches, no size change needed (order_item_id already carries size).

### Update `sync_extra_box_items_list` trigger
Include `size` in the items_list aggregation (group by product_id AND size).

## Frontend Changes

### 1. `src/pages/ExtraInventory.tsx` — Create batch form + table display
- Add `size` to `formData` state
- After product is selected, fetch product's `sizes` array and show a size selector
- Pass `size` to the insert query and to the merge-check query (match on size too)
- Add "Size" column to the batches table
- Update `ExtraBatch` interface to include `size`
- Fetch `sizes` from products in the product query

### 2. `src/components/ExtraInventoryDialog.tsx` — Reservation filtering
- Add `size` to `OrderItem` interface and `ExtraInventoryDialogProps.orderItems`
- Add `size` to `ExtraBatch` interface
- Fetch `size` in the extra_batches query
- Filter available batches: only show batches where `batch.size === orderItem.size` (or both null)
- Update `getMaxForProduct` → `getMaxForProductAndSize` to also match on size
- Update grouping to group by product_id + size
- When reserving, set `size` on new reserved extra batches

### 3. `src/pages/OrderDetail.tsx` — Pass size to dialog
- Include `size` in the `orderItems` mapping passed to `ExtraInventoryDialog`

### 4. `src/components/ExtraItemsTab.tsx` — Show size
- Add `size` to ExtraBatch interface and fetch query
- Display size in the UI

### 5. `src/components/MoveToExtraDialog.tsx` — Include size in selections
- The RPC handles size lookup from order_item, so no major frontend change needed here

### 6. Update `move_order_batches_to_extra` RPC (SQL migration)
```sql
-- Key change in the RPC: lookup size from order_items, merge by size
v_size := (SELECT oi.size FROM order_items oi WHERE oi.id = v_batch.order_item_id);

-- Merge check adds: AND size IS NOT DISTINCT FROM v_size
-- Insert adds: size = v_size
```

## Files to Create/Edit
1. **Migration** — add `size` column + update RPCs
2. **Edit**: `src/pages/ExtraInventory.tsx` — size in form + table
3. **Edit**: `src/components/ExtraInventoryDialog.tsx` — size-based filtering
4. **Edit**: `src/pages/OrderDetail.tsx` — pass size to dialog
5. **Edit**: `src/components/ExtraItemsTab.tsx` — display size

