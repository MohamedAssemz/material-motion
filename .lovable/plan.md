

# UI Improvements: Tab Names, Size Display, and Numeric Visuals

## Changes Overview

### 1. Rename last tab to "Completed" in Manufacturing phase
- **File**: `src/pages/OrderManufacturing.tsx` (line 780)
- Change `t('phase.processed_tab')` → `t('phase.completed')` to match Finishing/Packaging which already use `t('phase.completed')`

### 2. Add `size` to `BatchData` and display in ProductionRateSection
- **File**: `src/components/ProductionRateSection.tsx`
  - Add `size?: string | null` to `BatchData` interface and `OrderItemGroup` interface
  - Pass size through during grouping
  - Update display: show product name + size (e.g. "Product Name - S") as primary, SKU as secondary text below
  - Currently: `<p class="font-medium">{group.product_name}</p> <Badge>{group.product_sku}</Badge>`
  - New: `<p class="font-medium">{group.product_name}{group.size ? ` - ${group.size}` : ''}</p>` with `<p class="text-sm text-muted-foreground">{group.product_sku}</p>` below

### 3. Add `size` to RetrievedFromExtraSection
- **File**: `src/components/RetrievedFromExtraSection.tsx`
  - Add `size?: string | null` to `RetrievedBatch` interface and group data
  - Use compound key `order_item_id || product_id` + size for grouping
  - Display: product name + size as primary, SKU as secondary text below (same pattern as ProductionRateSection)

### 4. Pass `size` from all phase pages when mapping batches
- **Files**: `src/pages/OrderManufacturing.tsx`, `OrderFinishing.tsx`, `OrderPackaging.tsx`, `OrderBoxing.tsx`
  - Add `size: batch.order_item?.size || null` to the mapped batch objects passed to `ProductionRateSection`
  - Add `size` to retrieved-from-extra data (from `extra_batch_history` — need to join with `order_items` via `consuming_order_item_id` to get size)

### 5. Add numeric summary visuals to Completed tab
- **Files**: All four phase pages (Manufacturing, Finishing, Packaging, Boxing)
- Add two stat cards at the top of the Completed tab content:
  - **"Total Produced"**: items moved to next phase + items added to extra inventory (already calculated as `totalCompleted`)
  - **"Total Moved to Next Phase"**: items moved to next phase + items retrieved from extra (i.e., `completedBatchesQty + retrievedFromExtraQty`)
- These will be compact cards similar to the existing stats cards pattern

## Technical Details

**ProductionRateSection display change** (applies to both assigned and "no boxing" cards):
```
Before:  [Product Name]  [SKU badge]
After:   [Product Name - Size]
         SKU: ABC123
```

**RetrievedFromExtraSection display change**:
```
Before:  [Product Name]  [SKU badge]  [qty]
After:   [Product Name - Size]        [qty]
         SKU: ABC123
```

**Completed tab numeric visuals** (added before ProductionRateSection):
```
┌──────────────────┐  ┌──────────────────────┐
│ Total Produced   │  │ Moved to Next Phase  │
│ 150              │  │ 130                  │
│ (next + extra)   │  │ (processed+retrieved)│
└──────────────────┘  └──────────────────────┘
```

**Size in retrieved-from-extra**: The `fetchRetrievedFromExtra` functions query `extra_batch_history` with `consuming_order_item_id`. We need to also fetch the size from `order_items` for that consuming_order_item_id, or query it separately. The simplest approach: after fetching history records, batch-fetch the `order_items` by `consuming_order_item_id` to get sizes.

## Files to Edit
1. `src/components/ProductionRateSection.tsx` — add size to interface + display
2. `src/components/RetrievedFromExtraSection.tsx` — add size to interface + display
3. `src/pages/OrderManufacturing.tsx` — tab name, pass size, add numeric visuals, fetch size for retrieved
4. `src/pages/OrderFinishing.tsx` — pass size, add numeric visuals, fetch size for retrieved
5. `src/pages/OrderPackaging.tsx` — pass size, add numeric visuals, fetch size for retrieved
6. `src/pages/OrderBoxing.tsx` — pass size, add numeric visuals, fetch size for retrieved

