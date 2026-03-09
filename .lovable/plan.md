
The error "column order_batches_is_terminated does not exist" occurs when opening box details because the BoxDetailsDialog component still contains a database query that filters by the `is_terminated` column, which was recently removed from the schema.

## Root Cause Analysis
Looking at the network requests and the error message, the issue is in the `BoxDetailsDialog` component's `fetchBatchDetails` function. The code is trying to query the `order_batches` table with an `.eq('is_terminated', false)` filter, but this column no longer exists in the database schema.

## Technical Investigation Required
I need to:
1. Read the BoxDetailsDialog component to identify the exact location of the problematic query
2. Check if there are similar issues in related components that handle box details
3. Verify the current database schema to confirm the column removal

## Proposed Solution
1. **Remove Deprecated Filter**: Update the `fetchBatchDetails` function in `BoxDetailsDialog` to remove the `.eq('is_terminated', false)` filter from the `order_batches` query
2. **Update Extra Batches Query**: Also check and fix the similar query for `extra_batches` if it exists
3. **Test Box Operations**: Verify that box viewing, batch display, and related operations work correctly after the fix

## Files to Modify
- `src/components/BoxDetailsDialog.tsx` - Remove `is_terminated` filter from batch queries
- Potentially other box-related components if similar issues exist

## Implementation Steps
1. Read the BoxDetailsDialog component to locate the problematic queries
2. Remove all references to the `is_terminated` column
3. Ensure the queries still return the correct batch data for display
4. Test that the box details dialog opens and displays batch information correctly

This is a straightforward database query cleanup that should resolve the error immediately.
