

## Plan: Show Order Info and Group Batches by Product SKU in Box Details

### Changes to `src/components/BoxDetailsDialog.tsx`

**1. Fetch order info for occupied order boxes**
- Update the `order_batches` query to also select `order_id` and join `order:orders(order_number)`
- Display the order number in the box info section (e.g., "Order: ORD-0012") when the box has batches

**2. Group batches by product SKU**
- Instead of listing individual batches, aggregate them by `product.sku`:
  - Sum quantities per SKU
  - Collect QR codes per group
- For order boxes: show table with columns: Product SKU, Product Name, Total Qty
- For extra boxes: same plus Inventory State column
- This replaces the current per-batch row display with a grouped view

**3. Implementation details**
- Add a `useMemo` that groups `orderBatches` / `extraBatches` by `product.sku`, summing quantities
- Update the `OrderBatchDetail` interface to include `order_id` and `order` fields
- Show order number as a new row in the box info grid (only for order boxes with batches)
- The grouped table removes the QR Code column (since multiple batches are merged) and shows consolidated quantity

