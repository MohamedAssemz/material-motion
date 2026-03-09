

## Fix: Production Rate Shows 0 Instead of 19 Processed Items

### Root Cause

The previous fix (adding `extra_manufacturing` to the exclusion filter on line 203) correctly removed the 20 retrieved items from `completedBatches`. However, the `processedBatchesForRate` memo (lines 119-143) still subtracts `retrievedFromExtraBatches` (20 units from CONSUMED history) from the now-clean `completedBatches` (19 genuine items). This double-removal zeros out the production rate data.

**Data flow for TESTNOW:**
1. `completedBatches` = 19 items (retrieved items already excluded by `from_extra_state` filter)
2. `retrievedFromExtraBatches` = 20 items (from `extra_batch_history` CONSUMED records)
3. `processedBatchesForRate` = 19 - 20 = ~0 items (all subtracted away)

### Fix

Since `completedBatches` already excludes retrieved items via the `from_extra_state` filter, the subtraction in `processedBatchesForRate` is now redundant. Remove the subtraction logic and pass `completedBatches` directly.

**Files to change:**

1. **`src/pages/OrderManufacturing.tsx`** (lines 119-143): Simplify `processedBatchesForRate` to just return `completedBatches` directly (or remove the memo entirely and use `completedBatches` where `processedBatchesForRate` is referenced).

2. **`src/pages/OrderFinishing.tsx`** (same pattern): Same fix — remove the subtraction logic from `processedBatchesForRate`.

3. **`src/pages/OrderPackaging.tsx`** (same pattern): Same fix.

### Result

For order TESTNOW, the Completed tab's Production Rate will correctly show 19 assignable items — the genuine items that were processed through manufacturing.

