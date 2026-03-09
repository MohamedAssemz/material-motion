

## Fix Numeric Input Fields to Allow Clean Entry

### Problem
Numeric input fields use `parseInt(value) || 1` or `parseInt(value) || 0` patterns, which immediately coerce empty input to `1` or `0`. This means users can't clear the field to type a fresh number — there's always a leading digit getting in the way.

### Solution
Create a reusable `NumericInput` component that:
- Stores the **raw string** value internally so the field can be empty while typing
- Only coerces to the numeric fallback on **blur** (when the user leaves the field)
- Shows `placeholder` text (e.g., "0") when empty instead of a forced value

Then replace all ~20 numeric `<Input type="number">` instances across the app with this component.

### Files to Change

1. **`src/components/ui/numeric-input.tsx`** (new) — Wrapper around `<Input type="number">` that manages a string state internally, calls `onChange(number)` on every keystroke (or `undefined` when empty), and coerces to min/default on blur.

2. **All files with numeric inputs** (replace `<Input type="number" value={x} onChange={...}>`):
   - `src/components/BatchCard.tsx` — qty selector
   - `src/components/ShipmentDialog.tsx` — product qty
   - `src/components/StateGroupView.tsx` — product qty
   - `src/components/ProductionRateSection.tsx` — assign qty
   - `src/components/ExtraItemsTab.tsx` — qty selectors
   - `src/components/ExtraInventoryDialog.tsx` — qty selectors
   - `src/components/MoveToExtraDialog.tsx` — qty input
   - `src/pages/OrderCreate.tsx` — item qty, packaging dimensions
   - `src/pages/OrderManufacturing.tsx` — select qty
   - `src/pages/OrderFinishing.tsx` — select qty
   - `src/pages/OrderPackaging.tsx` — select qty
   - `src/pages/OrderBoxing.tsx` — qty + dimensions
   - `src/pages/ExtraInventory.tsx` — quantity field
   - `src/pages/Boxes.tsx` — box count
   - `src/pages/Orders.tsx` — min/max qty filters
   - `src/components/LeadTimeDialog.tsx` — lead time days

   For each: change state type from `number` to `string` where the value is managed as controlled input, OR simply switch to `<NumericInput>` which handles it internally.

### NumericInput API
```tsx
interface NumericInputProps {
  value: number | undefined;
  onValueChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  placeholder?: string;
  // ...rest of Input props
}
```

The component stores a string internally, syncs from `value` prop, and calls `onValueChange` with parsed number or `undefined`. On blur, it clamps to min/max and falls back to min if empty and required.

