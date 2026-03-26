

# Plan: Single Product Per Order Box

## Constraint
Since order boxes must be **empty** before assignment (already enforced), the only validation needed is: **block users from selecting multiple products at once** when assigning to a box.

If a user selects quantities from Product A and Product B simultaneously, they cannot proceed to assign a box — they must assign one product at a time.

## Changes

### 1. Add validation in each phase page's "open box dialog" handler
Check that all selected `productSelections` map to the **same `product_id`**. If multiple products are selected, show an error toast and block the dialog.

**Files:**
- `src/pages/OrderManufacturing.tsx` — `handleOpenBoxDialog` (~line 492)
- `src/pages/OrderFinishing.tsx` — `handleOpenAssignDialog`
- `src/pages/OrderPackaging.tsx` — `handleOpenAssignDialog`
- `src/pages/OrderBoxing.tsx` — equivalent handler
- `src/components/ExtraItemsTab.tsx` — box assignment handler

**Validation pattern (same in all files):**
```typescript
const selectedProductIds = new Set(
  Array.from(productSelections.entries())
    .filter(([_, qty]) => qty > 0)
    .map(([key]) => {
      const group = productGroups.find(g => g.groupKey === key);
      return group?.product_id;
    })
    .filter(Boolean)
);
if (selectedProductIds.size > 1) {
  toast.error(t('phase.single_product_per_box'));
  return;
}
```

### 2. Add translations
Add `phase.single_product_per_box` to `src/lib/translations.ts`:
- EN: "A box can only contain one product. Please select items from a single product."
- AR: Arabic equivalent

### Summary

| File | Change |
|------|--------|
| `src/pages/OrderManufacturing.tsx` | Add product_id check in `handleOpenBoxDialog` |
| `src/pages/OrderFinishing.tsx` | Add product_id check in assign handler |
| `src/pages/OrderPackaging.tsx` | Add product_id check in assign handler |
| `src/pages/OrderBoxing.tsx` | Add product_id check in assign handler |
| `src/components/ExtraItemsTab.tsx` | Add product_id check in box assignment |
| `src/lib/translations.ts` | Add 1 translation key |

No database changes needed — the constraint is purely UI-level since boxes are always empty at assignment time.

