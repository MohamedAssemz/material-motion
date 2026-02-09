

## Fix Box Search and Assignment Issues

### Summary

Three bugs have been identified related to box searching and selection:

1. **Box assignment allows non-empty boxes** - The BoxSelectionDialog relies on the `content_type` column which can become stale, allowing selection of boxes that already contain order batches
2. **Warehouse scan popup ignores numeric-only input** - The BoxLookupScanDialog uses regex matching but doesn't apply `normalizeBoxCode`, so entering "0001" fails
3. **Receiving scan popup ignores numeric-only input** - The BoxScanPopup doesn't use `normalizeBoxCode`, so entering "0001" without "BOX-" prefix fails

---

### Issue 1: BoxSelectionDialog Allowing Non-Empty Boxes

**Problem:**
The `BoxSelectionDialog` component (used when assigning a box to batches) filters boxes by `content_type === 'EMPTY'`, but this field can become stale. A box might still show as "EMPTY" even if it contains order batches from another order.

**Root Cause:**
The `content_type` column on the `boxes` table is not being updated when order batches are assigned. The dialog trusts this column instead of checking actual batch assignments.

**Solution:**
Add a real-time validation step that checks for existing order batches in the box before including it in the "empty" list.

**Changes to `src/components/BoxSelectionDialog.tsx`:**
- After fetching boxes, also fetch order batches grouped by `box_id`
- Exclude any box that has non-terminated order batches from the "empty" list
- This ensures only truly empty boxes appear in the selection

```typescript
// Query order batches to find which boxes actually have items
const { data: batchesInBoxes } = await supabase
  .from('order_batches')
  .select('box_id')
  .not('box_id', 'is', null)
  .eq('is_terminated', false);

// Create set of box IDs that have batches
const boxesWithBatches = new Set(batchesInBoxes?.map(b => b.box_id) || []);

// Filter out boxes that have order batches
allBoxes?.forEach((box) => {
  // Check both content_type AND actual batch presence
  const hasOrderBatches = boxesWithBatches.has(box.id);
  
  if (box.content_type === 'EXTRA' && !hasOrderBatches) {
    extra.push(boxData);
  } else if (!hasOrderBatches && (box.content_type === 'EMPTY' || !box.content_type)) {
    empty.push(boxData);
  }
  // Boxes with order batches are excluded from both lists
});
```

---

### Issue 2: BoxLookupScanDialog Not Normalizing Input

**Problem:**
When typing "0001" in the warehouse scan popup, nothing is found because the code uses regex `/(EBOX-\d+|BOX-\d+)/` which requires the prefix.

**Root Cause:**
The `lookupBox` function doesn't apply `normalizeBoxCode` before regex matching. Numeric-only input passes through without the BOX- prefix.

**Solution:**
Import and apply `normalizeBoxCode` to the input before processing.

**Changes to `src/components/BoxLookupScanDialog.tsx`:**

1. Import the utility:
```typescript
import { normalizeBoxCode } from '@/lib/boxUtils';
```

2. Normalize input at the start of `lookupBox`:
```typescript
const lookupBox = useCallback(async (rawCode: string) => {
  if (validating) return;

  const normalized = normalizeBoxCode(rawCode); // Apply normalization first
  if (!normalized) return;

  // Then apply regex for URL extraction (BOX-#### or EBOX-####)
  const boxMatch = normalized.match(/(EBOX-\d+|BOX-\d+)/);
  // ...rest of function
```

3. Update placeholder text to guide users:
```typescript
placeholder={validating ? 'Looking up...' : 'Enter box number (e.g., 42)'}
```

---

### Issue 3: BoxScanPopup Not Normalizing Input

**Problem:**
When typing "0001" in the receiving page scan popup, nothing is added because the code only does `code.trim().toUpperCase()` without prepending "BOX-".

**Root Cause:**
The `validateAndAddBox` function doesn't use `normalizeBoxCode`, so numeric-only inputs query the database as "0001" instead of "BOX-0001".

**Solution:**
Import and apply `normalizeBoxCode` to normalize the input before querying.

**Changes to `src/components/BoxScanPopup.tsx`:**

1. Import the utility:
```typescript
import { normalizeBoxCode } from '@/lib/boxUtils';
```

2. Use it in `validateAndAddBox`:
```typescript
const validateAndAddBox = useCallback(async (code: string) => {
  if (validating) return;
  
  const normalizedCode = normalizeBoxCode(code); // Apply normalization
  if (!normalizedCode) return;

  // Check if already scanned in this session
  if (scannedBoxes.some(b => b.box_code.toUpperCase() === normalizedCode)) {
    // ...
  }
```

3. Update placeholder text:
```typescript
placeholder={validating ? "Validating..." : "Enter box number (e.g., 42)"}
```

---

### Files to Modify

| File | Change |
|------|--------|
| `src/components/BoxSelectionDialog.tsx` | Add order batch validation to exclude non-empty boxes |
| `src/components/BoxLookupScanDialog.tsx` | Import and apply `normalizeBoxCode`, update placeholder |
| `src/components/BoxScanPopup.tsx` | Import and apply `normalizeBoxCode`, update placeholder |

---

### Expected Behavior After Fix

| Scenario | Before | After |
|----------|--------|-------|
| BoxSelectionDialog: Box has batches from another order | Shows as "EMPTY", can be selected | Excluded from list entirely |
| Warehouse scan: User types "0001" | "Unrecognized Scan" error | Finds BOX-0001 successfully |
| Receiving scan: User types "0001" | "Box Not Found" error | Adds BOX-0001 to scan list |

