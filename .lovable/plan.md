

## Fix QR Code URL Extraction and Character Corruption in Scanning

### Problem 1: QR Code URLs Not Parsed

When a QR code containing a URL like `https://...lovableproject.com/box/BOX-0006` is scanned, the scanning dialogs don't extract the box code from the URL. The `BoxLookupScanDialog` already handles this with regex extraction, but `BoxScanPopup`, `BoxReceiveDialog`, and `BoxAssignmentDialog` do not.

### Problem 2: Character Corruption (EBOX-0!01)

When scanning `EBOX-0001`, the input shows `EBOX-0!01`. The `!` character is `Shift+1` -- hardware scanners send rapid key events, and sometimes the Shift key timing overlaps with the next character. The current code doesn't sanitize these stray shifted characters from scanned input.

### Solution

Update `normalizeBoxCode` in `src/lib/boxUtils.ts` to be the single source of truth for all input normalization. It will:

1. **Extract box codes from URLs**: Match `BOX-####` or `EBOX-####` patterns from full URL strings
2. **Sanitize shifted characters**: Replace common shift-key corruptions (`!` for `1`, `@` for `2`, `#` for `3`, etc.) before processing

This centralizes the fix so all scanning dialogs benefit automatically without individual changes.

### Changes

**File: `src/lib/boxUtils.ts`**

Update `normalizeBoxCode` to:

```
1. Strip the input of common shift-character corruptions
   Map: ! -> 1, @ -> 2, # -> 3, $ -> 4, % -> 5, ^ -> 6, & -> 7, * -> 8, ( -> 9, ) -> 0
2. Try to extract BOX-#### or EBOX-#### pattern from anywhere in the string (handles URLs)
3. If no pattern found, fall back to existing logic (numeric prepend, passthrough)
```

**File: `src/hooks/useBoxScanner.ts`**

Expand the character filter regex to also accept URL characters (`:`, `/`, `.`, `?`, `=`) so that QR-scanned URLs pass through the buffer intact instead of being stripped:

```
Current:  /^[a-zA-Z0-9\-_]$/
Updated:  /^[a-zA-Z0-9\-_:/.?=&]$/
```

**File: `src/components/BoxScanPopup.tsx`**

No changes needed -- it already calls `normalizeBoxCode` which will now handle URLs.

**File: `src/components/BoxReceiveDialog.tsx`**

No changes needed -- same reason.

**File: `src/components/BoxAssignmentDialog.tsx`**

No changes needed -- same reason.

### Files to Modify

| File | Change |
|------|--------|
| `src/lib/boxUtils.ts` | Add URL extraction and shift-character sanitization to `normalizeBoxCode` |
| `src/hooks/useBoxScanner.ts` | Expand character filter to accept URL characters |

### How It Works

```text
QR scan: "https://...com/box/BOX-0006"
  -> useBoxScanner accepts URL chars -> passes full string
  -> normalizeBoxCode extracts "BOX-0006" via regex
  -> lookup proceeds normally

Corrupted scan: "EBOX-0!01"
  -> normalizeBoxCode sanitizes ! -> 1 -> "EBOX-0001"
  -> lookup proceeds normally

Normal scan: "BOX-0006" or "42"
  -> existing behavior unchanged
```
