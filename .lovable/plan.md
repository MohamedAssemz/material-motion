

## Fix Box Assignment Validation Bug

### Problem Identified

When searching for box "0001", BOX-0001 was selected and items were assigned even though the box already contained 3 active order batches.

### Root Cause

The `searchBox` function in `OrderManufacturing.tsx` uses `.maybeSingle()` to check for existing batches:

```typescript
const { data: existingBatch } = await supabase
  .from('order_batches')
  .select('id')
  .eq('box_id', box.id)
  .eq('is_terminated', false)
  .maybeSingle();
```

**The problem**: `.maybeSingle()` returns `null` when there are **zero OR multiple** matching rows. Since BOX-0001 has 3 active batches, the query returns multiple rows, causing `.maybeSingle()` to return `null`, which makes `existingBatch` falsy, and the validation incorrectly passes.

### Solution

Change the query to use `.limit(1).single()` or check for any existence without assuming a single row. The safest approach is to select with `.limit(1)` or use a count query.

**Recommended fix**: Use `.select('id').limit(1)` instead of `.maybeSingle()`:

```typescript
const { data: existingBatches } = await supabase
  .from('order_batches')
  .select('id')
  .eq('box_id', box.id)
  .eq('is_terminated', false)
  .limit(1);

if (existingBatches && existingBatches.length > 0) {
  toast.error(`Box ${box.box_code} is already occupied`);
  return;
}
```

---

### Files to Modify

The same bug pattern may exist in other phase pages. All three phase pages need to be checked and fixed:

| File | Function | Issue |
|------|----------|-------|
| `src/pages/OrderManufacturing.tsx` | `searchBox()` | Uses `.maybeSingle()` - needs fix |
| `src/pages/OrderFinishing.tsx` | `searchBox()` | Need to verify if same issue exists |
| `src/pages/OrderPackaging.tsx` | `searchBox()` | Need to verify if same issue exists |

---

### Changes Required

**1. `src/pages/OrderManufacturing.tsx`** (lines 244-254)

Replace:
```typescript
const { data: existingBatch } = await supabase
  .from('order_batches')
  .select('id')
  .eq('box_id', box.id)
  .eq('is_terminated', false)
  .maybeSingle();

if (existingBatch) {
```

With:
```typescript
const { data: existingBatches } = await supabase
  .from('order_batches')
  .select('id')
  .eq('box_id', box.id)
  .eq('is_terminated', false)
  .limit(1);

if (existingBatches && existingBatches.length > 0) {
```

**2. Check and apply same fix to `src/pages/OrderFinishing.tsx`** if it has the same pattern.

**3. Check and apply same fix to `src/pages/OrderPackaging.tsx`** if it has the same pattern.

---

### Expected Result

| Scenario | Before | After |
|----------|--------|-------|
| Search for box with 1 active batch | "Box is already occupied" ✓ | "Box is already occupied" ✓ |
| Search for box with 3 active batches | No error, assignment allowed ✗ | "Box is already occupied" ✓ |
| Search for empty box | Assignment allowed ✓ | Assignment allowed ✓ |

