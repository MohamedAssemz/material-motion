## Problem Analysis

The user clarifies that items moved to extra inventory during manufacturing ARE actually processed items and should count toward production metrics for machine assignment. The current logic incorrectly excludes them from completion counts.

## Current Issue Investigation

From examining the code and the user's feedback:

1. **Manufacturing "Waiting" Count**: Still incorrectly showing items in `in_manufacturing` as "waiting" due to `readyState` parameter
2. **Completed Count Logic**: Currently showing 75 completed (50 processed + 25 moved to extra), but the user confirms this is actually CORRECT - items moved to extra inventory are processed items that should count toward production rates

## Root Cause

The confusion stems from different interpretations of "completed":

- **UI Logic**: Treats "completed" as items that moved to next phase only
- **Business Logic**: Should treat "completed" as items that were processed through the current phase (including those diverted to extra inventory)

## Technical Solution

### 1. Fix Manufacturing Waiting Count

- **File**: `src/pages/OrderDetail.tsx` 
- **Action**: Remove `readyState` parameter for manufacturing stats call
- **Reason**: Items start directly in `in_manufacturing`, no waiting state needed

### 2. Clarify Production Rate Logic

- **File**: `src/pages/OrderManufacturing.tsx`
- **Current**: `totalCompleted = completedGroups.reduce(...) + totalAddedToExtra`
- **Analysis**: This is actually CORRECT per user feedback - both counts represent processed items
- **Action**: Update UI labels/comments to clarify that "completed" means "processed through this phase" not "moved to next phase"

### 3. Update ProductionRateSection Integration

- **File**: `src/components/ProductionRateSection.tsx`
- **Action**: Ensure extra batches that were processed in this phase count toward machine assignment calculations
- **Reason**: Items moved to extra inventory still contribute to production rate metrics

## Implementation Plan

1. **OrderDetail.tsx**: Remove manufacturing waiting count by fixing `getPhaseStats` call
2. **OrderManufacturing.tsx**: Keep existing completion logic but improve UI clarity with better labels
3. **Verify**: Extra batches properly contribute to production rate calculations in ProductionRateSection
4. **Test**: Ensure counts align between order detail timeline and manufacturing page

## Expected Outcome

- Manufacturing timeline shows 0 waiting items (correct workflow) (should not have a waiting entry to begin with)
- Completed count includes items processed through manufacturing (including those moved to extra inventory)
- Production rate section properly accounts for all processed items for machine assignment
- Clear distinction between "processed" vs "progressed to next phase" in UI labels