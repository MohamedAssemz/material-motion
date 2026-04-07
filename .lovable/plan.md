

# Improve Activity Log Details and Edit Order Batch Logic

## Overview
Three changes: (1) enrich the activity log to show specific item names and quantity deltas, (2) reverse timeline order to newest-first, (3) when increasing/decreasing quantity on edit, merge into existing `in_manufacturing` waiting batches instead of always creating new ones.

## Changes

### 1. `src/components/EditOrderDialog.tsx` — Richer activity log details + batch merge logic

**Activity log details (lines ~451-468):** Replace the current summary counts with an array of per-item change records:
```ts
details: {
  eft_changed: logEftChanged,
  changes: [
    // For each added item:
    { type: "added", product: "Product Name", sku: "SKU", size: "M", quantity: 50 },
    // For each deleted item:
    { type: "deleted", product: "Product Name", sku: "SKU", size: "S", quantity: 30 },
    // For each qty change:
    { type: "qty_changed", product: "Product Name", sku: "SKU", size: "L", from: 100, to: 80, delta: -20 },
  ]
}
```

**Batch increase logic (lines ~374-387):** Instead of always inserting a new batch, first look for an existing `in_manufacturing` batch with `eta IS NULL` for the same `order_item_id`. If found, update its quantity. Only create a new batch if none exists.

**Batch decrease logic (lines ~483-510):** Already correct (reduces waiting batches). No change needed.

### 2. `src/components/OrderActivityLog.tsx` — Display item-level details + newest-first

**Sort order (line 59):** Change `ascending: true` to `ascending: false`.

**`getDetailText` for "edited" action (lines 101-107):** Parse the new `details.changes` array and render each change as a line item, e.g.:
- "Added: Product A (M) × 50"
- "Deleted: Product B (S) × 30"  
- "Product C (L): 100 → 80 (−20)"

Render these as a list of `<p>` elements instead of a single string, so each change gets its own line.

### No database or migration changes needed — the `details` column is already JSONB.

