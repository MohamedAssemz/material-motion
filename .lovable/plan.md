

## Cross-Type Box Detection + Clear Search Field on Scan

### Summary

Four changes across two dialogs to (1) detect and warn when scanning the wrong box type, and (2) always clear the search field after a scan regardless of outcome.

---

### Changes to `src/components/BoxAssignmentDialog.tsx` (Order Box Dialog)

**1. Detect EBOX scans in `handleBoxScan`**

After `normalizeBoxCode`, check if the code starts with `EBOX-`. If so, show a toast error: "This is an extra box (EBOX). It cannot be used for orders." and return early.

**2. Detect EBOX scans in `handleSearch`**

Same check after normalizing the search input. If it starts with `EBOX-`, show the same error, clear `searchCode`, and return.

**3. Clear search field on all outcomes in `handleSearch`**

Currently `setSearchCode('')` only happens on success (line 303). Move it to the `finally` block so the field is always cleared -- whether the box was found, not found, or incompatible. This also handles clearing URLs from the field.

---

### Changes to `src/components/ExtraBoxSelectionDialog.tsx` (Extra Box Dialog)

**1. Detect order box scans in `handleBoxScan`**

After normalizing the scanned code (need to add `normalizeBoxCode` import), check if the code starts with `BOX-` (but not `EBOX-`). If so, show toast error: "This is an order box. It cannot be used for extra inventory." and return early.

**2. Clear search field after scan**

The `ExtraBoxSelectionDialog` uses a `searchQuery` field for filtering, not for scan-based lookup. The scanner auto-selects via `handleBoxScan`. The `searchQuery` field is a filter input, not a scan target. Since scanned input goes through `useBoxScanner` (which intercepts keydown events when no input is focused), the search field shouldn't receive scanned text. However, if the user manually types a URL into the search field, it will just filter -- no special handling needed since it's a local filter, not a DB lookup.

Actually, re-reading the ExtraBoxSelectionDialog: it only has a local filter search, no manual "lookup by code" like BoxAssignmentDialog. The scanner goes through `handleBoxScan`. So for this dialog, the main change is just adding the order-box detection in `handleBoxScan`.

---

### Technical Details

**BoxAssignmentDialog.tsx changes:**

```
// In handleBoxScan, after normalizeBoxCode:
if (normalizedCode.startsWith('EBOX-')) {
  toast({ title: 'Wrong Box Type', description: 'This is an extra box (EBOX). It cannot be used for orders.', variant: 'destructive' });
  return;
}

// In handleSearch, after normalizeBoxCode:
if (normalizedCode.startsWith('EBOX-')) {
  toast({ title: 'Wrong Box Type', description: 'This is an extra box (EBOX). It cannot be used for orders.', variant: 'destructive' });
  setSearchCode('');
  return;
}

// Move setSearchCode('') from success-only (line 303) to the finally block
```

**ExtraBoxSelectionDialog.tsx changes:**

```
// Import normalizeBoxCode
import { normalizeBoxCode } from '@/lib/boxUtils';

// In handleBoxScan, normalize the code first, then check:
const normalizedCode = normalizeBoxCode(code);
if (normalizedCode.startsWith('BOX-') && !normalizedCode.startsWith('EBOX-')) {
  toast.error('This is an order box. It cannot be used for extra inventory.');
  return;
}
// Then use normalizedCode instead of raw code for the EBOX- check
```

### Files to Modify

| File | Change |
|------|--------|
| `src/components/BoxAssignmentDialog.tsx` | Add EBOX detection in scan + search handlers; clear search field in `finally` |
| `src/components/ExtraBoxSelectionDialog.tsx` | Add `normalizeBoxCode`, detect order box scans, use normalized code |

