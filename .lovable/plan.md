

## Fix Extra Inventory Items Appearing in Completed Tabs

### Root Cause

When extra inventory items (e.g., `extra_finishing`) are consumed into an order via `ExtraItemsTab`, new `order_batches` are created at states like `ready_for_packaging`. These batches then appear in the `completedBatches` query of Manufacturing and Finishing phases (which fetch ALL batches past those phases' states). The current fix subtracts a count (`extraConsumedSkipped`) but doesn't actually filter the batches, causing a mismatch: the tab shows "0 completed" but still renders batch cards with entries needing machine assignment.

### Solution: Tag order_batches with their extra inventory origin

Add a `from_extra_state` column to `order_batches` to record where the batch originated from extra inventory. This enables filtering those batches out of completed queries entirely (not just count subtraction).

### Changes

**1. Database Migration**
- Add nullable `from_extra_state` text column to `order_batches` (default `null`)
- When `null`, it's a normal production batch; when set (e.g., `extra_finishing`), it indicates the batch was sourced from extra inventory at that phase

**2. `src/components/ExtraItemsTab.tsx`**
- In `handleMoveToReady` (line ~304): add `from_extra_state: batch.current_state` to the `order_batches` insert
- In `handleAssignToBox` (line ~422): add `from_extra_state: batch.current_state` to the `order_batches` insert

**3. `src/pages/OrderManufacturing.tsx`**
- Add `from_extra_state` to the `completedBatches` SELECT query (line ~154)
- After fetching, filter out batches where `from_extra_state` is in `['extra_manufacturing', 'extra_finishing', 'extra_packaging', 'extra_boxing']` (any extra-sourced batch skipped manufacturing)
- Remove `extraConsumedSkipped` state and its subtraction from `totalCompleted`
- Remove the CONSUMED history fetch from `fetchAddedToExtra`

**4. `src/pages/OrderFinishing.tsx`**
- Add `from_extra_state` to the `completedBatches` SELECT query
- Filter out batches where `from_extra_state` is in `['extra_finishing', 'extra_packaging', 'extra_boxing']`
- Remove `extraConsumedSkipped` state and related logic

**5. `src/pages/OrderPackaging.tsx`**
- Add `from_extra_state` to the `completedBatches` SELECT query
- Filter out batches where `from_extra_state` is in `['extra_packaging', 'extra_boxing']`
- Remove `extraConsumedSkipped` state and related logic

**6. `src/pages/OrderBoxing.tsx`**
- Filter out batches where `from_extra_state` is `'extra_boxing'`
- Remove `extraConsumedSkipped` state and related logic

**7. `src/pages/OrderDetail.tsx`**
- Update `getPhaseStats` to filter `activeBatches` by `from_extra_state` instead of using the `consumedExtraSkippedCounts` subtraction
- Remove `fetchConsumedExtraSkippedCounts` function and its state
- The filtering logic per phase:
  - Manufacturing: exclude batches with any `from_extra_state` value
  - Finishing: exclude batches with `from_extra_state` in `[extra_finishing, extra_packaging, extra_boxing]`
  - Packaging: exclude `[extra_packaging, extra_boxing]`
  - Boxing: exclude `[extra_boxing]`

### Filtering Rules Summary

| Phase | Exclude from completed if `from_extra_state` is |
|-------|------|
| Manufacturing | any non-null value |
| Finishing | `extra_finishing`, `extra_packaging`, `extra_boxing` |
| Packaging | `extra_packaging`, `extra_boxing` |
| Boxing | `extra_boxing` |

This means `extra_manufacturing` items consumed by an order will correctly appear as completed in Finishing, Packaging, and Boxing (where they are actually processed), but not in Manufacturing.

### Why this is better than the current approach

- **Batch-level filtering**: Removes the batches entirely from `completedBatches` and `completedGroups`, so no phantom entries appear in the completed tab
- **Consistent counts**: Tab label count matches visible entries
- **Production rate accuracy**: Extra-sourced batches won't appear in the production rate section of phases they skipped
- **Simpler code**: Removes the fragile `extraConsumedSkipped` count-subtraction pattern and the extra history query

