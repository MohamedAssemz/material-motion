

## Fix: Search Field Not Clearing After Scan in BoxAssignmentDialog

### Root Cause

When a hardware barcode scanner sends a QR code URL, it types characters rapidly and ends with Enter. However, some scanners send trailing characters **after** Enter due to buffering. The current flow:

1. Scanner types URL into the focused input (onChange sets searchCode)
2. Scanner sends Enter, triggering handleSearch
3. handleSearch runs async, queries the database
4. In the finally block, setSearchCode('') clears the field
5. Late-arriving scanner characters trigger onChange, **re-setting searchCode back to a non-empty value**

### Fix (two parts)

**File: `src/components/BoxAssignmentDialog.tsx`**

**Part 1 -- Clear immediately and capture value**

Move the clearing of `searchCode` to the top of `handleSearch`, right after capturing the current value in a local variable. This gives immediate visual feedback and prevents the stale value from lingering:

```typescript
const handleSearch = async () => {
  if (!searchCode.trim()) return;
  
  const codeToSearch = searchCode; // capture before clearing
  setSearchCode('');               // clear immediately
  setSearching(true);
  const normalizedCode = normalizeBoxCode(codeToSearch);
  // ... rest uses normalizedCode / codeToSearch instead of searchCode
```

**Part 2 -- Block late scanner characters with readOnly**

Make the input `readOnly` while `searching` is true. This prevents any late-arriving scanner keystrokes from re-populating the field via onChange:

```html
<Input
  value={searchCode}
  onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
  readOnly={searching}
  ...
/>
```

### Summary of Changes

| File | Change |
|------|--------|
| `src/components/BoxAssignmentDialog.tsx` | 1. Clear searchCode at the top of handleSearch (before try block) and use a local variable for the search value. 2. Add `readOnly={searching}` to the Input element. |

