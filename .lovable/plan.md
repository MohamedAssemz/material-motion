

## Universal Input Clearing After Scan/Search in All Dialogs

### Problem
When scanning a QR code or searching for a box that is occupied, invalid, or unavailable, the search/scan input field retains the scanned value. This forces users to manually clear it before the next scan, which is especially problematic with hardware barcode scanners that append to existing text.

### Affected Files and Changes

#### 1. `src/components/BoxScanDialog.tsx` -- `handleSearch()`
The search code is only cleared on success (line 253). On all failure paths (lines 185, 194, 212, 238), the function returns early without clearing. 

**Fix**: Move `setSearchCode('')` into the `finally` block so it always runs.

#### 2. `src/components/BoxReceiveDialog.tsx` -- `handleSearch()`
Similar issue: `searchCode` is cleared on some success paths but not on failure paths (lines 314, 361).

**Fix**: Move `setSearchCode('')` into the `finally` block.

#### 3. `src/components/BoxAssignmentDialog.tsx` -- `handleBoxScan()` (scanner callback)
The scanner handler (lines 110-175) never updates `searchCode` since it operates via the hardware scanner hook, but it also doesn't clear the manual input field after a scan attempt. Additionally, the manual `handleSearch()` already clears in `finally` (line 333) -- this one is fine.

**Fix**: Add `setSearchCode('')` at the start of `handleBoxScan` so any lingering manual input is cleared when a scan fires.

#### 4. `src/components/BoxScanPopup.tsx` -- `validateAndAddBox()`
Already clears `inputValue` in the `finally` block (line 261) -- no change needed.

#### 5. `src/components/BoxLookupScanDialog.tsx` -- scan handler
Already clears `inputValue` in the `finally` block (line 261) -- no change needed.

### Technical Summary

| File | Function | Current Behavior | Fix |
|------|----------|-----------------|-----|
| `BoxScanDialog.tsx` | `handleSearch` | Clears only on success | Move `setSearchCode('')` to `finally` |
| `BoxReceiveDialog.tsx` | `handleSearch` | Clears only on some paths | Move `setSearchCode('')` to `finally` |
| `BoxAssignmentDialog.tsx` | `handleBoxScan` | Never clears search input | Add `setSearchCode('')` at start |

