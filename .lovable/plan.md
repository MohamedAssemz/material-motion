

## QR Code and Barcode System for Box Management

This feature will add a comprehensive QR code and barcode identification system for all box types (order boxes, extra boxes, and shipments), enabling scanning across different modules with context-aware behavior.

---

### Overview

Using the existing `box_code` column (e.g., `BOX-0001`, `EBOX-0001`, `SHP-0001`) as the unique identifier for both QR codes and barcodes. No database schema changes are required.

**Key Features:**
- QR code links to a public webpage showing box details
- Barcode encodes the box code for hardware scanner input
- Scanner hook detects rapid keyboard input (scanner behavior)
- Context-aware scanning behavior across the application
- Batch print labels from the warehouse page

---

### New Files to Create

**1. `src/hooks/useBoxScanner.ts`**

A custom hook to detect hardware barcode/QR scanner input:
- Buffers rapid keyboard input (scanners type very fast, typically < 50ms between keystrokes)
- Triggers callback when Enter is pressed and buffer has content
- Can be enabled/disabled based on context
- Clears buffer after timeout or on trigger

```text
Parameters:
- onScan(code: string): Callback when a code is detected
- enabled: boolean - Enable/disable scanner detection
- minLength: number - Minimum characters to be considered valid (default: 3)
- maxDelay: number - Max delay between keystrokes in ms (default: 50)
```

**2. `src/components/BoxLabel.tsx`**

A reusable component to display a printable box label with:
- QR code at top (links to `/box/{code}`)
- Box code text in the middle (large, bold)
- Code 128 barcode at the bottom
- Uses `qrcode.react` (already installed) for QR generation
- Uses inline SVG generation for Code 128 barcode

**3. `src/components/BoxLabelPrintDialog.tsx`**

A dialog for batch printing box labels from the warehouse page:
- Multi-select boxes to print
- Preview of labels before printing
- Uses non-blocking print pattern (separate window/tab)
- Supports both order boxes and extra boxes

**4. `src/pages/BoxLookup.tsx`**

A public webpage for mobile scanning (similar to existing `BatchLookup.tsx`):
- Routes: `/box/:code` and `/box` (for manual search)
- Fetches box data from `boxes` or `extra_boxes` or `shipments`
- Shows box details: code, type, creation date, status
- Lists contents: products, SKUs, quantities, batch states
- View-only interface, accessible without authentication
- Similar layout to the existing `BatchLookup` page

**5. `src/lib/barcodeGenerator.ts`**

Utility functions for generating Code 128 barcodes:
- Pure TypeScript implementation (no external dependency)
- Returns SVG path data for the barcode
- Handles alphanumeric box codes

---

### Files to Modify

**1. `src/App.tsx`**
- Add route: `/box/:code` -> `BoxLookup`
- Add route: `/box` -> `BoxLookup`

**2. `src/pages/Boxes.tsx`**
- Add "Print Labels" button in header
- Add print icon button per row for individual label printing
- Integrate `useBoxScanner` hook to detect scans on the page
- When scanner detects a box code, auto-open `BoxDetailsDialog`
- Add multi-select checkbox mode for batch label printing

**3. `src/components/BoxDetailsDialog.tsx`**
- Add "Print Label" button in dialog footer
- Show QR code and barcode preview in the dialog

**4. `src/components/BoxReceiveDialog.tsx`**
- Integrate `useBoxScanner` hook
- When box scanned:
  - Check if box is valid for this order/state
  - If valid: Auto-select the box (add to selectedBoxes)
  - If invalid: Show error toast with reason
- Support multiple scans to select multiple boxes

**5. `src/components/BoxAssignmentDialog.tsx`**
- Integrate `useBoxScanner` hook
- When box scanned:
  - Auto-select the scanned box
  - Show error if box is occupied or incompatible

**6. `src/components/ExtraBoxSelectionDialog.tsx`**
- Integrate `useBoxScanner` hook
- When EBox scanned: Auto-select it
- Show error if not found or inactive

---

### Scanner Integration Logic

**Detection Pattern:**

```text
Hardware scanners typically:
1. Type characters very rapidly (< 50ms between keystrokes)
2. End with an Enter key press

The hook will:
1. Buffer all keystrokes that arrive within 50ms of each other
2. When Enter is pressed, check if buffer has valid content
3. If valid, trigger the onScan callback with the buffered code
4. Clear buffer after timeout (200ms of no input)
```

**Context-Aware Behavior:**

| Location | On Scan | Action |
|----------|---------|--------|
| Warehouse (`/boxes`) | Valid box code | Open BoxDetailsDialog |
| Warehouse (`/boxes`) | Invalid code | Show error toast |
| BoxReceiveDialog | Valid box for order | Add to selected boxes |
| BoxReceiveDialog | Box not in correct state | Show error toast |
| BoxAssignmentDialog | Valid empty box | Select for assignment |
| BoxAssignmentDialog | Occupied/incompatible box | Show error toast |
| ExtraBoxSelectionDialog | Valid EBox | Select for assignment |
| Other pages | Any scan | No effect (scanner disabled) |

---

### Label Design

```text
+---------------------------+
|                           |
|    ┌─────────────────┐    |
|    │                 │    |
|    │   [QR CODE]     │    |
|    │   150x150px     │    |
|    │                 │    |
|    └─────────────────┘    |
|                           |
|       BOX-0001            |
|    (large bold text)      |
|                           |
|   ║║ ║║║ ║║ ║║║ ║║ ║║║   |
|   (Code 128 barcode)      |
|                           |
+---------------------------+
```

**Specifications:**
- QR code: Contains URL `https://{domain}/box/BOX-0001`
- Box code: Large monospace font, readable from distance
- Barcode: Code 128 format encoding the box_code text
- Label size: Standard shipping label size (suitable for 4x6 inch)

---

### Mobile Scanning Flow

1. User scans QR code with phone camera
2. Phone opens URL: `https://app.domain.com/box/BOX-0001`
3. BoxLookup page loads and fetches box data
4. User sees:
   - Box code and type (Order/Extra/Shipment)
   - Creation date and status (Active/Inactive)
   - Contents table: Product SKU, Name, Quantity
   - For order boxes: Current production state of batches
   - For extra boxes: Inventory state (Available/Reserved)
5. Read-only - no actions available on mobile view

---

### Implementation Phases

**Phase 1: Core Infrastructure**
1. Create `src/lib/barcodeGenerator.ts` - Code 128 SVG generation
2. Create `src/hooks/useBoxScanner.ts` - Scanner detection hook
3. Create `src/components/BoxLabel.tsx` - Label component

**Phase 2: Public Lookup Page**
1. Create `src/pages/BoxLookup.tsx` - Mobile-friendly box info page
2. Update `src/App.tsx` - Add routes

**Phase 3: Warehouse Integration**
1. Create `src/components/BoxLabelPrintDialog.tsx` - Batch printing
2. Update `src/pages/Boxes.tsx` - Print buttons, scanner integration
3. Update `src/components/BoxDetailsDialog.tsx` - Print button

**Phase 4: Production Dialogs**
1. Update `src/components/BoxReceiveDialog.tsx` - Scanner integration
2. Update `src/components/BoxAssignmentDialog.tsx` - Scanner integration
3. Update `src/components/ExtraBoxSelectionDialog.tsx` - Scanner integration

---

### Technical Notes

**Code 128 Barcode:**
- Supports full ASCII character set
- Efficient encoding for alphanumeric data like "BOX-0001"
- Will use a pure TypeScript implementation to avoid external dependencies

**QR Code:**
- Already have `qrcode.react` installed
- Will use `QRCodeSVG` component for inline SVG rendering

**Print Pattern:**
- Will use the existing non-blocking print pattern (opens new tab)
- Prevents browser main thread from freezing during print
- Uses Blob URL approach from existing `openPrintWindow` utility

**Scanner Hook:**
- Global keyboard event listener when enabled
- Filters out normal typing vs scanner input by keystroke timing
- Does not interfere with input fields when disabled

