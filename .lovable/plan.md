

# Edit Order Items & EFT — Revised Plan

## Change from Previous Plan
The "Edit Order" button moves from the header area into the **Order Items table card header**, next to the title. This keeps the editing action contextually close to the items being edited.

## UI Placement

In `OrderDetail.tsx`, the Order Items `<Card>` (line ~1096) currently has:
```
<CardHeader>
  <CardTitle>{t("orders.order_items")}</CardTitle>
  <CardDescription>{t("orders.products_in_order")}</CardDescription>
</CardHeader>
```

This becomes a flex row with an "Edit Order" button on the right side (admin-only, non-cancelled orders only):
```
<CardHeader className="flex flex-row items-center justify-between">
  <div>
    <CardTitle>...</CardTitle>
    <CardDescription>...</CardDescription>
  </div>
  {canUpdate && order.status !== 'cancelled' && (
    <Button variant="outline" size="sm" onClick={() => setEditOrderOpen(true)}>
      <Pencil /> {t("orders.edit_order")}
    </Button>
  )}
</CardHeader>
```

## Components

### 1. `EditOrderDialog.tsx` (new file)
A dialog with two sections:

**EFT Section** — Date picker for `estimated_fulfillment_time`

**Order Items Section** — Table listing current items (product, size, color, qty) with:
- `NumericInput` to adjust quantity per item
- Trash button to delete an item
- "Add Item" button to add new products (product selector + size picker, similar to OrderCreate pattern)

**On Save**, computes diffs per item:
- **New items**: Insert `order_items` row; if order is `in_progress`, create `order_batches` in `in_manufacturing`
- **Increased qty**: Update `order_items.quantity`; if `in_progress`, create new batches
- **Decreased qty**: Pre-check for box-assigned batches → block if found. Otherwise delete batches in state priority order (manufacturing first → shipped last), then update quantity
- **Deleted items**: Same box check → delete all batches for item → release reserved extra_batches → delete order_item row

### 2. Files to modify
| File | Change |
|------|--------|
| `src/components/EditOrderDialog.tsx` | Create — full dialog component |
| `src/pages/OrderDetail.tsx` | Add Edit button in items card header, dialog state, import |
| `src/lib/translations.ts` | Add keys: `edit_order`, `edit_order_desc`, `add_item`, `boxes_must_be_emptied`, `save_changes` |

### 3. Batch deletion priority
When decreasing quantity, batches are deleted in this order (earliest phase first):
1. `in_manufacturing` → 2. `ready_for_finishing` → 3. `in_finishing` → 4. `ready_for_packaging` → 5. `in_packaging` → 6. `ready_for_boxing` → 7. `in_boxing` → 8. `ready_for_shipment` → 9. `shipped`

### 4. Box occupancy guard
Before any decrease/delete: query `order_batches WHERE order_item_id = ? AND box_id IS NOT NULL`. If any exist, show alert blocking the action until boxes are emptied.

