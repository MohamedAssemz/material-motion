

## Fix: Box Label Print Dialog Selection Flickering

### Root Cause

The `useEffect` in `BoxLabelPrintDialog` resets selections every time `preselectedBoxIds` changes:

```typescript
useEffect(() => {
  if (open) {
    setSelectedIds(new Set(preselectedBoxIds));
  }
}, [open, preselectedBoxIds]);
```

The problem: `preselectedBoxIds` defaults to `[]` in the function signature, which creates a **new array reference on every render**. React sees a new dependency each time and re-runs the effect, resetting `selectedIds` back to empty -- causing the "select then immediately unselect" flicker.

### Fix

**File: `src/components/BoxLabelPrintDialog.tsx`**

1. Replace the `useEffect` dependency on `preselectedBoxIds` (unstable reference) with a dependency that only triggers when the dialog **opens** (transition from closed to open). Use a `useRef` to track the previous `open` state and only reset selections on the rising edge.

2. Alternatively (simpler): use `JSON.stringify(preselectedBoxIds)` as the dependency key, or define a stable empty array constant outside the component.

**Chosen approach** (simplest, most robust): Only reset selections when the dialog transitions from closed to open, by tracking the previous `open` value with a ref:

```typescript
const prevOpen = useRef(false);

useEffect(() => {
  if (open && !prevOpen.current) {
    // Dialog just opened -- initialize selections
    setSelectedIds(new Set(preselectedBoxIds));
  }
  prevOpen.current = open;
}, [open, preselectedBoxIds]);
```

This way, selections are initialized once when the dialog opens and never reset while it remains open, regardless of parent re-renders.

### Files to Modify

| File | Change |
|------|--------|
| `src/components/BoxLabelPrintDialog.tsx` | Replace useEffect with ref-guarded open transition check |
