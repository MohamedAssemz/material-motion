

## ✅ COMPLETED: Fix Extra Inventory Items Appearing in Completed Tabs

### What was done

1. **Database Migration**: Added `from_extra_state` column to `order_batches` table
2. **ExtraItemsTab**: Both `handleMoveToReady` and `handleAssignToBox` now set `from_extra_state: batch.current_state` when creating order_batches from extra inventory
3. **Phase pages** (Manufacturing, Finishing, Packaging): Added `from_extra_state` to completed batch queries and filter out batches that skipped each phase
4. **OrderDetail**: Replaced `fetchConsumedExtraSkippedCounts` with batch-level filtering using `from_extra_state` in `getPhaseStats`

### Filtering Rules

| Phase | Exclude from completed if `from_extra_state` is |
|-------|------|
| Manufacturing | any non-null value |
| Finishing | `extra_finishing`, `extra_packaging`, `extra_boxing` |
| Packaging | `extra_packaging`, `extra_boxing` |
| Boxing | `extra_boxing` |
