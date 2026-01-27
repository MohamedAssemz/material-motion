

## Box Management Page Enhancement

### Overview
Enhance the Boxes page to display box entries as clickable table rows that show a details popup when clicked. Both Order Boxes and Extra Boxes tabs will show consistent information including batch counts, total quantities, and admin-only delete functionality for empty boxes.

---

### Current State Analysis

**Current Implementation:**
- Two tabs: Order Boxes and Extra Boxes
- Table display with columns: Box Code, Status, Current Batch/Items, Product, Quantity, Created, Active toggle
- Data fetched from `boxes` and `extra_boxes` tables
- No click-to-view-details functionality
- No delete capability

**Data Available:**
- `items_list` on both box types contains batch details with product info and quantities
- Order batches can be queried by `box_id` from `order_batches` table
- Extra batches can be queried by `box_id` from `extra_batches` table
- Extra batches have `current_state` field with values like `extra_manufacturing`, `extra_finishing`, `extra_packaging`, `extra_boxing`

---

### Implementation Plan

#### 1. Update Table Display (Both Tabs)

**Columns to display:**
| Column | Description |
|--------|-------------|
| Box Code | Font mono, bold |
| Status | See status logic below |
| Batches | Number of batches in the box |
| Total Qty | Sum of all quantities across batches |
| Created | Formatted date |
| Active | Switch toggle |

**Make rows clickable** - clicking anywhere on the row opens the details popup

#### 2. Create Box Details Popup Component

**New component: `BoxDetailsDialog.tsx`**

**Props:**
```typescript
interface BoxDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxType: 'order' | 'extra';
  boxId: string | null;
  onDeleted?: () => void;
}
```

**Popup Content Structure:**
- Header: Box Code with status badge
- Box Info Section:
  - Created date
  - Active status
  - Content type
- Batches Section:
  - Table showing all batches in the box:
    - For Order Boxes: QR Code, Product SKU, Product Name, Quantity, Current State
    - For Extra Boxes: QR Code, Product SKU, Product Name, Quantity, Current State, Inventory State
- Footer:
  - Close button
  - Delete button (admin only, only shown if box is empty)

#### 3. Status Display Logic

**Order Boxes:**
```typescript
// If box has no batches
if (isEmpty) {
  return <Badge variant="outline" className="text-green-600 border-green-600">Empty</Badge>
}

// If box has batches - show the production state
return <Badge className={getStateColor(primaryState)}>
  {primaryState.replace(/_/g, ' ').toUpperCase()}
</Badge>
// e.g., "READY FOR BOXING", "IN PACKAGING"
```

**Extra Boxes (Updated):**
```typescript
// If box has no batches
if (isEmpty) {
  return <Badge variant="outline" className="text-green-600 border-green-600">Empty</Badge>
}

// If box has batches - show the extra batch state from the batches inside
// Extra boxes have batches with states like: extra_manufacturing, extra_finishing, extra_packaging, extra_boxing
const extraState = batches[0]?.current_state; // All batches in an EBox share the same state
return <Badge className={getExtraStateColor(extraState)}>
  {formatExtraState(extraState)}
</Badge>
// e.g., "EXTRA MANUFACTURING", "EXTRA FINISHING", "EXTRA PACKAGING", "EXTRA BOXING"
```

**Extra State Color Mapping:**
```typescript
const getExtraStateColor = (state: string) => {
  const colors: Record<string, string> = {
    'extra_manufacturing': 'bg-blue-500',
    'extra_finishing': 'bg-purple-500',
    'extra_packaging': 'bg-orange-500',
    'extra_boxing': 'bg-cyan-500',
  };
  return colors[state] || 'bg-amber-500';
};

const formatExtraState = (state: string) => {
  // Convert 'extra_manufacturing' to 'EXTRA MANUFACTURING'
  return state?.replace(/_/g, ' ').toUpperCase() || 'OCCUPIED';
};
```

#### 4. Fetch Extra Batch States for Table Display

Since we need to show the state of batches inside extra boxes, we need to fetch batch data:

```typescript
// After fetching extra_boxes, get the primary state for each box
const boxIds = extraBoxesData?.map(b => b.id) || [];
const { data: extraBatchStates } = await supabase
  .from('extra_batches')
  .select('box_id, current_state')
  .in('box_id', boxIds);

// Create a map of box_id to state
const stateByBox = new Map();
extraBatchStates?.forEach(batch => {
  if (batch.box_id && !stateByBox.has(batch.box_id)) {
    stateByBox.set(batch.box_id, batch.current_state);
  }
});

// Add state to each extra box
const extraBoxesMapped = extraBoxesData.map(box => ({
  ...box,
  primary_state: stateByBox.get(box.id) || null,
}));
```

#### 5. Fetch Batch Details for Popup

**Order Boxes:**
```typescript
const { data } = await supabase
  .from('order_batches')
  .select(`
    id,
    qr_code_data,
    quantity,
    current_state,
    product:products(name, sku)
  `)
  .eq('box_id', boxId)
  .eq('is_terminated', false);
```

**Extra Boxes:**
```typescript
const { data } = await supabase
  .from('extra_batches')
  .select(`
    id,
    qr_code_data,
    quantity,
    current_state,
    inventory_state,
    product:products(name, sku)
  `)
  .eq('box_id', boxId);
```

#### 6. Admin Delete Functionality

**Conditions for delete button visibility:**
1. User has `admin` role (checked via `hasRole('admin')`)
2. Box is empty (no batches assigned)

**Delete handlers:**
```typescript
// For Order Boxes
const handleDeleteOrderBox = async (boxId: string) => {
  const { error } = await supabase
    .from('boxes')
    .delete()
    .eq('id', boxId);
  // Handle result
};

// For Extra Boxes
const handleDeleteExtraBox = async (boxId: string) => {
  const { error } = await supabase
    .from('extra_boxes')
    .delete()
    .eq('id', boxId);
  // Handle result
};
```

---

### File Changes Summary

| File | Action | Changes |
|------|--------|---------|
| `src/components/BoxDetailsDialog.tsx` | Create | New dialog component for viewing box details |
| `src/pages/Boxes.tsx` | Modify | Update tables with batch count/total qty columns, fetch extra batch states, make rows clickable, integrate details dialog |

---

### UI Mockup

**Table Row (Order Box - Occupied):**
```text
| BOX-0001 | [READY FOR BOXING] | 2 batches | 30 units | Jan 10, 2026 | [Active] |
```

**Table Row (Extra Box - Occupied with state):**
```text
| EBOX-0001 | [EXTRA BOXING]        | 6 batches | 465 units | Jan 12, 2026 | [Active] |
| EBOX-0002 | [EXTRA MANUFACTURING] | 3 batches | 295 units | Jan 12, 2026 | [Active] |
| EBOX-0003 | [EXTRA FINISHING]     | 1 batch   |  70 units | Jan 17, 2026 | [Active] |
```

**Table Row (Empty Box):**
```text
| BOX-0003  | [Empty] | 0 | 0 | Jan 10, 2026 | [Active] |
| EBOX-0005 | [Empty] | 0 | 0 | Jan 20, 2026 | [Active] |
```

**Details Popup (Extra Box):**
```text
+--------------------------------------------------+
|  EBOX-0001                    [EXTRA BOXING]     |
+--------------------------------------------------+
| Created: Jan 12, 2026                            |
| Active: Yes                                      |
| Content Type: EXTRA                              |
+--------------------------------------------------+
| Batches (6)                                      |
|                                                  |
| QR Code      | Product          | Qty  | State   | Inv State |
|--------------|------------------|------|---------|-----------|
| EB-CF1EB1AA  | SKU-0001-MED-BLU | 25   | e_box   | AVAILABLE |
| EB-D28E5E05  | SKU-0001-MED-BLU | 175  | e_box   | AVAILABLE |
| EB-186E2E7B  | SKU-0001-SML-RED | 100  | e_box   | AVAILABLE |
| EB-CE914EAE  | SKU-0001-SML-BLU | 100  | e_box   | AVAILABLE |
| EB-3AE8A1B5  | SKU-0001-MED-BLU | 15   | e_box   | RESERVED  |
| EB-F33CE85A  | SKU-0001-MED-BLU | 50   | e_box   | RESERVED  |
+--------------------------------------------------+
|                                    [Close]       |
+--------------------------------------------------+

(For empty box with admin user)
+--------------------------------------------------+
|                      [Delete Box] [Close]        |
+--------------------------------------------------+
```

---

### Technical Details

**Updated data interfaces:**
```typescript
interface OrderBoxData {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  items_list: any[];
  batch_count: number;
  total_quantity: number;
  primary_state: string | null;  // For order batches state
}

interface ExtraBoxData {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  items_list: any[];
  batch_count: number;
  total_quantity: number;
  primary_state: string | null;  // extra_manufacturing, extra_finishing, etc.
}
```

**Computing batch stats from items_list:**
```typescript
// items_list already contains aggregated product info with quantities
const batch_count = box.items_list?.length || 0;
const total_quantity = box.items_list?.reduce((sum, item) => sum + (item.quantity || 0), 0) || 0;
```

**Delete confirmation:**
Use existing AlertDialog pattern for confirmation before delete:
- Title: "Delete Box?"
- Description: "Are you sure you want to delete {box_code}? This action cannot be undone."
- Actions: Cancel | Delete

---

### Implementation Steps

1. Create `BoxDetailsDialog.tsx` component
   - Accept box type, ID, and callbacks as props
   - Fetch batch details on open based on box type
   - Display box info and batch table
   - Include admin-only delete button with confirmation

2. Update `Boxes.tsx`
   - Add state for selected box and dialog open state
   - Compute batch_count and total_quantity from items_list
   - Fetch extra batch states to get `current_state` for extra boxes
   - Update table columns to show Batches, Total Qty, and proper Status
   - Extra boxes show state like "EXTRA MANUFACTURING" instead of just "OCCUPIED"
   - Make table rows clickable with cursor-pointer styling
   - Integrate BoxDetailsDialog component

3. Test functionality
   - Click on boxes to view details
   - Verify batch counts and quantities are correct
   - Verify extra boxes show correct phase status (Extra Manufacturing, Extra Finishing, etc.)
   - Test delete functionality as admin user
   - Verify non-admin users don't see delete button

