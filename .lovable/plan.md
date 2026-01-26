

## Fix: Prevent Website Freeze During Kartona Printing

### Problem
When printing a kartona (shipment label), the original browser tab freezes until the print dialog is closed. This happens because `window.print()` is a synchronous blocking call that blocks the JavaScript main thread across all windows from the same origin.

### Root Cause
The current implementation uses:
```javascript
<script>window.print();</script>
// or
printWindow.print();
```

This blocks the main thread immediately, causing the original tab to freeze.

### Solution
Defer the `window.print()` call using `setTimeout` to allow the browser to complete rendering before showing the print dialog. This breaks the synchronous blocking behavior and allows the original tab to remain responsive.

---

### Files to Update

| File | Issue |
|------|-------|
| `src/components/ShipmentDialog.tsx` | Line 283: inline script with `window.print(); window.close();` |
| `src/pages/OrderBoxing.tsx` | Line 930: inline script with `window.print();` |
| `src/components/BoxScanDialog.tsx` | Line 309-310: uses `document.close()` without print |
| `src/components/StateGroupView.tsx` | Line 162-163: uses `document.close()` without print |
| `src/components/ExtraInventoryDialog.tsx` | Line 655-656: uses `document.close()` without print |
| `src/components/ExtraItemsTab.tsx` | Line 549-550: calls `printWindow.print()` synchronously |
| `src/pages/OrderDetail.tsx` | Line 504-505: uses `document.close()` without print |
| `src/components/BoxReceiveDialog.tsx` | Line 357-358: uses `document.close()` without print |
| `src/components/BatchQRCode.tsx` | Lines 51: inline script with `window.print();` |
| `src/components/BatchCardPrintable.tsx` | QR script with `window.print()` |
| `src/components/ExtraInventoryGuide.tsx` | Line 82-83: uses `document.close()` without print |

---

### Implementation Pattern

**For inline scripts (inside HTML template):**

Change from:
```javascript
<script>window.print(); window.close();</script>
```

To:
```javascript
<script>
  setTimeout(function() {
    window.print();
  }, 100);
</script>
```

**For direct `printWindow.print()` calls:**

Change from:
```javascript
printWindow.document.write(html);
printWindow.document.close();
printWindow.print();
```

To:
```javascript
printWindow.document.write(html);
printWindow.document.close();
// Don't call print() from the parent window - let the child handle it via setTimeout in the script
```

Or if you need to trigger from parent:
```javascript
printWindow.document.write(html);
printWindow.document.close();
setTimeout(() => {
  printWindow.print();
}, 100);
```

---

### Specific Changes

**1. `src/components/ShipmentDialog.tsx` (Line 283)**
```javascript
// Before
<script>window.print(); window.close();</script>

// After  
<script>
  setTimeout(function() {
    window.print();
  }, 100);
</script>
```
Note: Removed `window.close()` to let user close the tab manually after printing.

**2. `src/pages/OrderBoxing.tsx` (Line 930)**
```javascript
// Before
<script>window.print();</script>

// After
<script>
  setTimeout(function() {
    window.print();
  }, 100);
</script>
```

**3. `src/components/ExtraItemsTab.tsx` (Lines 548-550)**
```javascript
// Before
printWindow.document.write(html);
printWindow.document.close();
printWindow.print();

// After
printWindow.document.write(html);
printWindow.document.close();
// Remove the printWindow.print() call - add it to the HTML template instead
```

And add to the HTML template:
```javascript
<script>
  setTimeout(function() {
    window.print();
  }, 100);
</script>
```

**4. `src/components/BatchQRCode.tsx`**
Update the inline script similarly.

**5. `src/components/BatchCardPrintable.tsx`**
Update the QRCode script that calls `window.print()`.

---

### Why This Works

1. **`setTimeout` breaks synchronous blocking**: By deferring `window.print()`, the new window's thread handles the print dialog independently.

2. **100ms delay is sufficient**: This gives the browser time to fully render the document before showing the print dialog.

3. **No impact on user experience**: The print dialog still appears quickly, but the original tab remains responsive.

---

### Summary

Update all print functions across the codebase to use `setTimeout` for deferred printing:
- 11 files need updates
- Replace synchronous `window.print()` with `setTimeout(() => window.print(), 100)`
- This prevents the original tab from freezing while the print dialog is open

