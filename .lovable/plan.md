
## Add BOX- Prefix Auto-Completion for Box Search Inputs

### Goal
Simplify box searching by allowing users to enter just the numeric portion of a box code. The system will automatically prepend the "BOX-" prefix when querying. This reduces typing and prevents errors from inconsistent formatting.

---

### Current Behavior

Users must enter the full box code (e.g., `BOX-0001`) in search fields. The search functions use exact matching:
```typescript
.eq('box_code', boxSearchCode.trim().toUpperCase())
```

Placeholders currently show: `BOX-0001` or `Enter box code...`

---

### Proposed Behavior

1. **User enters**: Just the number (e.g., `42`, `0001`, `123`)
2. **System normalizes**: Automatically prepends `BOX-` prefix
3. **Query**: Uses `BOX-42` or `BOX-0001` for database lookup
4. **Placeholder update**: Show `Enter box number (e.g., 42)` to guide users

**Normalization Logic:**
```typescript
const normalizeBoxCode = (input: string): string => {
  const trimmed = input.trim().toUpperCase();
  
  // If already has BOX- or EBOX- prefix, use as-is
  if (/^(E?BOX-)/i.test(trimmed)) {
    return trimmed;
  }
  
  // If it's just digits, prepend BOX-
  if (/^\d+$/.test(trimmed)) {
    return `BOX-${trimmed}`;
  }
  
  // Otherwise return as-is (allows searching by product SKU, etc.)
  return trimmed;
};
```

---

### Technical Approach

#### 1. Create Shared Utility Function

Add a new utility function in `src/lib/boxUtils.ts`:

```typescript
/**
 * Normalize box code input by auto-prepending BOX- prefix for numeric inputs.
 * Allows users to enter just "42" instead of "BOX-42".
 */
export const normalizeBoxCode = (input: string): string => {
  const trimmed = input.trim().toUpperCase();
  
  // Already has valid prefix - return as-is
  if (/^(EBOX-|BOX-)/.test(trimmed)) {
    return trimmed;
  }
  
  // Pure digits - prepend BOX-
  if (/^\d+$/.test(trimmed)) {
    return `BOX-${trimmed}`;
  }
  
  // Mixed input (could be product SKU/name search) - return as-is
  return trimmed;
};
```

#### 2. Update Box Search Functions

Apply normalization in each location where box codes are searched:

**Files to update:**
- `src/pages/OrderManufacturing.tsx` - `searchBox()` function
- `src/pages/OrderFinishing.tsx` - `searchBox()` function
- `src/pages/OrderPackaging.tsx` - `searchBox()` function
- `src/components/BoxScanDialog.tsx` - `handleSearch()` function
- `src/components/BoxReceiveDialog.tsx` - `handleSearch()` and scanner callback
- `src/components/BoxAssignmentDialog.tsx` - `handleSearch()` function
- `src/components/ExtraItemsTab.tsx` - box search function
- `src/components/BoxLookupScanDialog.tsx` - already handles regex extraction (no change needed)

**Example change in `OrderManufacturing.tsx`:**
```typescript
import { normalizeBoxCode } from '@/lib/boxUtils';

const searchBox = async () => {
  if (!boxSearchCode.trim()) return;
  
  const normalizedCode = normalizeBoxCode(boxSearchCode);
  
  try {
    const { data: box } = await supabase
      .from('boxes')
      .select('id, box_code')
      .eq('box_code', normalizedCode)  // Use normalized code
      .eq('is_active', true)
      .single();
    // ... rest unchanged
  }
};
```

#### 3. Update Placeholders

Change placeholder text to prompt for number-only input:

| Location | Current | New |
|----------|---------|-----|
| OrderManufacturing.tsx | `BOX-0001` | `Enter box number (e.g., 42)` |
| OrderFinishing.tsx | `BOX-0001` | `Enter box number (e.g., 42)` |
| OrderPackaging.tsx | `BOX-0001` | `Enter box number (e.g., 42)` |
| BoxAssignmentDialog.tsx | `e.g., BOX-0001` | `Box number (e.g., 42)` |
| ExtraItemsTab.tsx | `Enter box code...` | `Box number (e.g., 42)` |

---

### Files to Create/Modify

**New File:**
- `src/lib/boxUtils.ts` - Contains `normalizeBoxCode` utility function

**Modified Files:**

1. **`src/pages/OrderManufacturing.tsx`**
   - Import `normalizeBoxCode`
   - Update `searchBox()` to use normalized code
   - Update placeholder text

2. **`src/pages/OrderFinishing.tsx`**
   - Import `normalizeBoxCode`
   - Update `searchBox()` to use normalized code
   - Update placeholder text

3. **`src/pages/OrderPackaging.tsx`**
   - Import `normalizeBoxCode`
   - Update `searchBox()` to use normalized code
   - Update placeholder text

4. **`src/components/BoxScanDialog.tsx`**
   - Import `normalizeBoxCode`
   - Update `handleSearch()` to use normalized code for box lookup
   - Keep product SKU/name search behavior unchanged

5. **`src/components/BoxReceiveDialog.tsx`**
   - Import `normalizeBoxCode`
   - Update `handleSearch()` and scanner handler to use normalized code

6. **`src/components/BoxAssignmentDialog.tsx`**
   - Import `normalizeBoxCode`
   - Update `handleSearch()` to use normalized code
   - Update placeholder text

7. **`src/components/ExtraItemsTab.tsx`**
   - Import `normalizeBoxCode`
   - Update box search function to use normalized code
   - Update placeholder text

---

### Edge Cases Handled

| Input | Normalized Output | Behavior |
|-------|------------------|----------|
| `42` | `BOX-42` | Number-only input gets prefix |
| `0001` | `BOX-0001` | Preserves leading zeros |
| `BOX-42` | `BOX-42` | Already prefixed, unchanged |
| `box-42` | `BOX-42` | Case normalized |
| `EBOX-123` | `EBOX-123` | Extra box prefix preserved |
| `ABC123` | `ABC123` | Mixed alphanumeric (product SKU) unchanged |
| `Plaster` | `PLASTER` | Product name search unchanged |

---

### Notes

- **Scanner compatibility**: Hardware scanners that output full `BOX-0001` format continue to work
- **Backward compatible**: Users can still type full `BOX-` prefix if preferred
- **Product search**: Dialogs that support product SKU/name search retain that functionality (alphanumeric inputs pass through unchanged)
- **Extra boxes**: EBOX- prefix is preserved for extra inventory boxes
