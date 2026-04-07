

# Remove "From Extra" Badge in Boxing Ready Tab + Rename "Moved to Next Phase" to "Shipped"

## Changes

### 1. `src/pages/OrderBoxing.tsx`
- **Line 1526-1530**: Remove the "From Extra" badge block in the ready-for-shipment tab
- **Line 1220**: Replace `t('phase.moved_to_next')` with `t('phase.shipped')` (new translation key)

### 2. `src/lib/translations.ts`
- Add new key: `"phase.shipped": { en: "Shipped", ar: "تم الشحن" }`

Two small edits, no logic changes.

