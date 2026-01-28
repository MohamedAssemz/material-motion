
## Add Dedicated Scan Button with Box Lookup Popup

Create a dedicated "Scan" button in the Warehouse page header that opens a popup for scanning boxes. The popup starts empty, and when a box is scanned (via barcode or QR code), it displays the box details inline. Subsequent scans update the displayed details with the new box.

---

### Overview

The current Warehouse page uses a global scanner hook (`useBoxScanner`) that listens for scans when no dialogs are open. This feature adds an explicit "Scan" button that opens a dedicated popup for box lookup, providing a more deliberate scanning experience.

---

### New Component: `BoxLookupScanDialog`

**File**: `src/components/BoxLookupScanDialog.tsx`

A new dialog component with the following behavior:

**Initial State (Empty)**:
- Shows a QR code icon and "Scan a box" instruction text
- Close button (X) in the header
- Auto-focused input field for scanning

**After Scan (Details Shown)**:
- Displays the scanned box's details inline (similar to BoxDetailsDialog content)
- Shows box code, status badge, creation date, active status
- Lists batches in a table (product SKU, name, quantity)
- If another box is scanned, the details update to show the new box
- Close button remains available

**Scanning Support**:
- Uses `useBoxScanner` hook as fallback for global keyboard scanning
- Input field for manual entry or barcode scanner input
- Supports both box codes (BOX-XXXX, EBOX-XXXX) and batch codes (B-XXXXXXXX, EB-XXXXXXXX)
- Extracts codes from URLs (e.g., `/box/BOX-0001`)

---

### Component Structure

```text
+------------------------------------------+
|  Scan Box                            [X] |
+------------------------------------------+
|  [🔍 Scan barcode here...            ]   |
|                                          |
|  +------------------------------------+  |
|  |                                    |  |
|  |    [QR Icon]                       |  |
|  |    Scan a box to view details      |  |
|  |                                    |  |
|  +------------------------------------+  |
|                                          |
|                            [Close]       |
+------------------------------------------+

After scanning:

+------------------------------------------+
|  Scan Box                            [X] |
+------------------------------------------+
|  [🔍 Scan barcode here...            ]   |
|                                          |
|  BOX-0001  [READY FOR FINISHING]         |
|  ----------------------------------------|
|  Created: January 28, 2026               |
|  Active: Yes                             |
|  ----------------------------------------|
|  Batches (3)                             |
|  +--------------------------------------+|
|  | QR Code | SKU    | Name     | Qty   ||
|  | B-XXXX  | SK-001 | Product1 | 10    ||
|  | B-YYYY  | SK-002 | Product2 | 5     ||
|  +--------------------------------------+|
|                                          |
|              [Print Label]  [Close]      |
+------------------------------------------+
```

---

### Files to Create

**1. `src/components/BoxLookupScanDialog.tsx`**

New component with:
- Dialog wrapper with "Scan Box" title
- Input field for scanning (auto-focused, readOnly during validation)
- `useBoxScanner` hook for global keyboard capture
- State for `scannedBox` (null initially, populated after scan)
- Reuses existing `handleBoxScan` logic from Boxes.tsx for code extraction
- Inline display of box details (not nested dialog)
- Print Label button (reuses `generateBoxLabelHTML`)

---

### Files to Modify

**1. `src/pages/Boxes.tsx`**

Add:
- Import `BoxLookupScanDialog`
- State: `scanDialogOpen` (boolean)
- "Scan" button in the page header (next to title)
- Render `BoxLookupScanDialog` component
- Update `useBoxScanner` enabled condition to include `!scanDialogOpen`

**Header changes**:
```text
+----------------------------------------------------------+
| [←] [📦] Box Management                        [🔍 Scan] |
|     Manage order and extra inventory boxes               |
+----------------------------------------------------------+
```

---

### Implementation Details

**Code Extraction (reused logic)**:
```typescript
const boxMatch = normalized.match(/(EBOX-\d+|BOX-\d+)/);
const batchMatch = normalized.match(/(EB-[A-Z0-9]{8}|B-[A-Z0-9]{8})/);
```

**Box Lookup Flow**:
1. User scans barcode/QR code
2. Extract box or batch code using regex
3. If box code: query `boxes` or `extra_boxes` table
4. If batch code: query `order_batches` or `extra_batches` to find associated box
5. Fetch batch details for the found box
6. Display box info and batch table inline
7. Subsequent scans replace the displayed box

**Focus Persistence**:
- Uses `readOnly` instead of `disabled` during validation
- Deferred refocus via `requestAnimationFrame`
- Global scanner hook as fallback

---

### User Flow

1. User navigates to Warehouse page (/boxes)
2. User clicks "Scan" button in header
3. Popup opens with empty state: "Scan a box to view details"
4. User scans a barcode or QR code
5. Popup displays the box details inline
6. User scans another barcode → details update to new box
7. User can print label or close the popup

---

### Benefits

- Explicit scanning action (vs. passive global listener)
- Continuous scanning without closing/reopening dialogs
- Supports both barcode and QR code scanning
- Works with box labels and batch cards
- Familiar UI pattern for factory workers
