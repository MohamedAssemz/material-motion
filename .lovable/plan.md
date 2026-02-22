

## Add Packaging Reference to Order Notes

### Overview

Add a "Packaging Reference" feature to the order creation flow that lets users pre-define how items should be split across shipments. This structured data is stored inside the `notes` field as a formatted table, and displayed wherever notes are shown (Order Detail, Boxing page).

### Changes

#### 1. OrderCreate.tsx -- Move notes + add packaging reference

**Move notes section**: Remove the notes `Textarea` from the "Order Details" card (lines 463-472) and place it in a new card after the "Order Items" card (before the submit buttons).

**Add packaging reference state**:
- `showPackagingRef: boolean` (default false)
- `packagingRows: Array<{ item_product_id: string; quantity: number }>` (starts empty)

**New UI in the Notes card**:
- Notes textarea (same as current)
- A button: `+ Packaging Reference` -- clicking it sets `showPackagingRef = true` and adds one empty row
- When expanded, show a table with columns: **Shipment #** (auto-numbered), **Item** (dropdown of selected order items), **Quantity** (number input)
- `+ Add Shipment` button below the table to add rows
- Each row has a delete button
- Quantity validation: for each selected product across all shipment rows, the total cannot exceed the quantity defined in order items

**On submit**: If packaging reference rows exist, append a formatted text block to the notes string before saving:

```
---PACKAGING_REFERENCE---
Shipment 1: [SKU] Product Name x 25
Shipment 2: [SKU] Product Name x 50
Shipment 3: [SKU2] Other Product x 10
---END_PACKAGING_REFERENCE---
```

This keeps everything in the existing `notes` column -- no schema changes needed.

#### 2. New component: PackagingReferenceDisplay.tsx

A small component that parses the `---PACKAGING_REFERENCE---` block from notes text and renders it as a formatted table. If no packaging reference block exists, it returns null. It also renders the remaining notes text (everything outside the block).

Used in:
- OrderDetail.tsx (replace raw `order.notes` display)
- OrderBoxing.tsx (new button)

#### 3. OrderDetail.tsx -- Use PackagingReferenceDisplay

Replace the current plain text notes display (line 767) with `<PackagingReferenceDisplay notes={order.notes} />` so the packaging reference renders as a table.

#### 4. OrderBoxing.tsx -- Add Notes button

Add a "View Notes" button next to "View Order Details" (line 1000-1002). Clicking it opens a dialog/sheet showing `<PackagingReferenceDisplay notes={order.notes} />`. The order's notes are already fetched in the existing `order` state.

### Technical Details

| File | Change |
|------|--------|
| `src/pages/OrderCreate.tsx` | Move notes after items card, add packaging reference UI with validation |
| `src/components/PackagingReferenceDisplay.tsx` | New component: parse + render packaging reference from notes string |
| `src/pages/OrderDetail.tsx` | Use PackagingReferenceDisplay for notes display |
| `src/pages/OrderBoxing.tsx` | Add "View Notes" button + dialog using PackagingReferenceDisplay |

No database changes required -- packaging reference data is stored as structured text within the existing `notes` column.
