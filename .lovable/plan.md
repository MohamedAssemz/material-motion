

## Add Scan Button with Popup for Barcode Scanning

This change adds a dedicated "Scan" button in the receive tab that opens a focused scanning popup. The popup allows users to scan multiple boxes, validate each one, and then add all scanned boxes to the selection when confirmed.

---

### Overview

The current implementation uses the `useBoxScanner` hook to detect hardware scanner input globally while the `BoxReceiveDialog` is open. The user wants a more explicit workflow:

1. User clicks "Scan" button in the receive dialog
2. A popup opens with a text field focused for scanning
3. Each scanned barcode is validated and added to a list in the popup
4. User can cancel (discard scanned boxes) or click "Add Selected" to add them to the main selection
5. The main dialog then shows the scanned boxes as selected

---

### New Component: `BoxScanPopup.tsx`

A focused scanning popup component that:
- Opens as a nested dialog within `BoxReceiveDialog`
- Contains a single text input field (auto-focused) for barcode scanning
- Validates each scanned box against the database (same logic as current `handleBoxScan`)
- Displays a list of successfully scanned boxes
- Has "Cancel" and "Add Selected" action buttons

**Props:**
```typescript
interface BoxScanPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddBoxes: (boxes: SelectedBox[]) => void;
  orderId: string;
  filterState: UnitState;
  alreadySelectedIds: string[]; // To prevent duplicates
}
```

**Component Structure:**
```text
+----------------------------------+
|  Scan Boxes                  [X] |
+----------------------------------+
|                                  |
|  [____Scan barcode here____]     |
|                                  |
|  Scanned Boxes:                  |
|  +----------------------------+  |
|  | BOX-0001 (5 items)     [X] |  |
|  | BOX-0002 (3 items)     [X] |  |
|  +----------------------------+  |
|                                  |
|  [Cancel]         [Add Selected] |
+----------------------------------+
```

**Validation Logic:**
When a barcode is scanned (Enter key pressed in the input field):
1. Check if already in the scanned list (within popup)
2. Check if already selected in the main dialog
3. Query database for the box (same validation as current `handleBoxScan`)
4. If valid: Add to scanned list with success toast
5. If invalid: Show error toast with specific reason

---

### Files to Create

**`src/components/BoxScanPopup.tsx`**

New component with:
- Dialog/Sheet UI for the popup
- Input field that captures scanner input (auto-focused)
- Local state for scanned boxes within the popup
- Validation logic reused from `BoxReceiveDialog`
- List display of scanned boxes with remove buttons
- Cancel button (clears and closes)
- "Add Selected" button (calls `onAddBoxes` with scanned boxes)

---

### Files to Modify

**`src/components/BoxReceiveDialog.tsx`**

1. Add new state for controlling the scan popup:
   ```typescript
   const [scanPopupOpen, setScanPopupOpen] = useState(false);
   ```

2. Add a "Scan" button in the search/scan area (next to the existing search button):
   ```tsx
   <Button variant="outline" onClick={() => setScanPopupOpen(true)}>
     <QrCode className="h-4 w-4 mr-2" />
     Scan
   </Button>
   ```

3. Add handler for receiving scanned boxes from the popup:
   ```typescript
   const handleAddScannedBoxes = (boxes: SelectedBox[]) => {
     setSelectedBoxes(prev => [...prev, ...boxes]);
     setScanPopupOpen(false);
     toast({
       title: 'Boxes Added',
       description: `Added ${boxes.length} scanned box(es)`,
     });
   };
   ```

4. Disable the global `useBoxScanner` when the scan popup is open (to prevent double-handling):
   ```typescript
   useBoxScanner({
     onScan: handleBoxScan,
     enabled: open && !scanPopupOpen,
   });
   ```

5. Add the `BoxScanPopup` component at the end of the dialog:
   ```tsx
   <BoxScanPopup
     open={scanPopupOpen}
     onOpenChange={setScanPopupOpen}
     onAddBoxes={handleAddScannedBoxes}
     orderId={orderId}
     filterState={filterState}
     alreadySelectedIds={selectedBoxes.map(b => b.id)}
   />
   ```

---

### User Flow

1. User opens the receive dialog
2. User clicks "Scan" button
3. Scan popup opens with input field auto-focused
4. User scans a box barcode with hardware scanner
5. Input captures the code, validates it, shows success/error toast
6. Box appears in the popup's scanned list
7. User can scan more boxes (each validated individually)
8. User can remove boxes from the scanned list by clicking X
9. User clicks "Add Selected" to add all scanned boxes to main selection
10. Popup closes, main dialog shows scanned boxes as selected
11. User continues with normal receive flow (Accept button)

---

### Technical Details

**Input Handling:**
- The input field uses `onKeyDown` to detect Enter key
- When Enter is pressed, the current value is validated
- After validation (success or failure), the input is cleared
- Input remains focused for continuous scanning

**State Management:**
- Popup maintains its own `scannedBoxes` state
- On "Add Selected", boxes are passed to parent via callback
- Parent adds them to `selectedBoxes` state
- Popup state is cleared when closed

**Validation:**
- Reuses the same database validation logic from `handleBoxScan`
- Checks: box exists, is active, has batches for order, batches in correct state
- Error messages match existing behavior

---

### UI Placement

The "Scan" button will be placed next to the search button in the existing search bar:

```text
+-------------------------------------------------------+
| [QR] Search box code or product...  [Search] [Scan]   |
+-------------------------------------------------------+
```

This keeps the interface clean while providing a dedicated scanning experience when needed.

