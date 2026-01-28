

## Add Scan Button to Production Phase Receive Tabs

The Scan button was added to `BoxReceiveDialog`, but that component is not being used by the production phase pages. The actual Receive tabs in `OrderFinishing.tsx`, `OrderPackaging.tsx`, and `OrderBoxing.tsx` have their own inline implementation.

---

### Root Cause

The production phase pages (`OrderFinishing`, `OrderPackaging`, `OrderBoxing`) each implement their Receive tab inline without using the `BoxReceiveDialog` component. The Scan button and `BoxScanPopup` we created exist in an unused component.

---

### Solution

Add the Scan button and integrate `BoxScanPopup` directly into each production phase page's Receive tab.

---

### Files to Modify

**1. `src/pages/OrderFinishing.tsx`**

- Import `BoxScanPopup` component
- Add `scanPopupOpen` state variable
- Add `handleAddScannedBoxes` function to process scanned boxes
- Add "Scan" button next to the search input in the Receive tab
- Render `BoxScanPopup` component with appropriate props (`filterState: 'ready_for_finishing'`)

**2. `src/pages/OrderPackaging.tsx`**

- Import `BoxScanPopup` component
- Add `scanPopupOpen` state variable
- Add `handleAddScannedBoxes` function to process scanned boxes
- Add "Scan" button next to the search input in the Receive tab
- Render `BoxScanPopup` component with appropriate props (`filterState: 'ready_for_packaging'`)

**3. `src/pages/OrderBoxing.tsx`**

- Import `BoxScanPopup` component
- Add `scanPopupOpen` state variable
- Add `handleAddScannedBoxes` function to process scanned boxes
- Add "Scan" button next to the search input in the Receive tab
- Render `BoxScanPopup` component with appropriate props (`filterState: 'ready_for_boxing'`)

---

### Implementation Details

For each page, the changes will follow this pattern:

**State Addition:**
```typescript
const [scanPopupOpen, setScanPopupOpen] = useState(false);
```

**Handler Function:**
```typescript
const handleAddScannedBoxes = (boxes: Array<{ id: string; box_code: string; total_quantity: number }>) => {
  // Add scanned box IDs to the selectedBoxes set
  boxes.forEach(box => {
    setSelectedBoxes(prev => new Set([...prev, box.box_id]));
  });
  setScanPopupOpen(false);
  toast.success(`Added ${boxes.length} scanned box(es) to selection`);
};
```

**UI Addition (in Receive tab, near search input):**
```tsx
<Button variant="outline" onClick={() => setScanPopupOpen(true)}>
  <QrCode className="h-4 w-4 mr-2" />
  Scan
</Button>
```

**Component Render:**
```tsx
<BoxScanPopup
  open={scanPopupOpen}
  onOpenChange={setScanPopupOpen}
  onAddBoxes={handleAddScannedBoxes}
  orderId={id!}
  filterState="ready_for_finishing" // or ready_for_packaging, ready_for_boxing
  alreadySelectedIds={Array.from(selectedBoxes)}
/>
```

---

### Visual Placement

The Scan button will be added next to the existing search input in each Receive tab:

```text
+------------------------------------------------------------------+
| Search by Box Code, Product SKU, or Name                         |
| [🔍 Type to filter boxes...             ] [Clear] [📱 Scan]      |
+------------------------------------------------------------------+
```

---

### User Flow After Implementation

1. User navigates to a production phase page (Finishing, Packaging, or Boxing)
2. User opens the Receive tab
3. User clicks "Scan" button
4. BoxScanPopup opens with auto-focused input field
5. User scans barcodes with hardware scanner
6. Each box is validated (exists, has correct state, belongs to order)
7. Valid boxes appear in popup list
8. User clicks "Add Selected"
9. Scanned boxes are automatically checked in the Receive tab box list
10. User can then click "Accept X Box(es)" to receive them

---

### Notes

- The `BoxScanPopup` component already handles all validation logic
- We reuse the existing `BoxScanPopup` component across all three pages
- Each page passes its specific `filterState` to ensure correct validation
- Scanned boxes get added to the `selectedBoxes` state, which controls the checkboxes

