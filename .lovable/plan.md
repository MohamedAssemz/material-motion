

# Split Manufacturing Batches: "Start Working" with Sub-Quantity and ETA

## Overview
Currently, manufacturing batches sit in `in_manufacturing` as a single block. The user wants to split work: select a sub-quantity to actively work on (with an ETA), while the rest remains waiting. This mirrors how finishing receives boxes from `ready_for_finishing` → `in_finishing` with lead time.

## Approach: Two Sub-States Within Manufacturing

Instead of adding a new state to the 9-state machine (which would ripple through the entire codebase), we split the manufacturing phase into two conceptual modes using a **boolean flag** on the batch:

- **Waiting** batches: `in_manufacturing` with `eta = NULL` and `lead_time_days = NULL` (current default)
- **Working** batches: `in_manufacturing` with `eta` and `lead_time_days` set (started working)

This avoids changing the state machine, all downstream phases, transitions, triggers, and RLS policies.

### Manufacturing Page Flow (Revised)

```text
┌─────────────────────────────────────────────┐
│ Process Tab                                  │
├──────────────────────────────────────────────┤
│ ┌─ Waiting ─────────────────────────────┐    │
│ │ Product A - S    Qty: 80              │    │
│ │ [Select: ___] [Start Working]         │    │
│ └───────────────────────────────────────┘    │
│ ┌─ In Progress (Working) ───────────────┐    │
│ │ Product A - S    Qty: 20   ETA: 3 days│    │
│ │ [Select: ___] [Assign to Box] [Extra] │    │
│ └───────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

**User flow:**
1. User sees **Waiting** items (no ETA set)
2. Selects a sub-quantity → clicks "Start Working" → enters lead time (days) → batch splits: selected qty gets ETA, remainder stays waiting
3. **Working** items (ETA set) can then be selected to assign to box / move to extra
4. Only working items can be moved to box or extra

### Edit Order Constraint
When reducing quantities, the system checks how many units are still "waiting" (no ETA). Only those can be reduced. Units with ETA set are considered "started" and locked.

## Changes

### 1. `src/pages/OrderManufacturing.tsx`
- Split the Process tab into two sections: **Waiting** (batches where `eta IS NULL`) and **In Progress** (batches where `eta IS NOT NULL`)
- **Waiting section**: Each product group shows quantity + numeric input + "Start Working" button
- Clicking "Start Working" opens a dialog asking for lead time (days, 1-30) similar to finishing's accept dialog
- On confirm: split the batch — selected qty gets `eta` and `lead_time_days` set, remainder stays as-is
- **In Progress section**: Shows groups with ETA countdown/late indicator (reuse existing ETA display pattern from finishing)
- "Assign to Box" and "Move to Extra" buttons only operate on the In Progress section
- Update stats cards: show Waiting count, In Progress count, Completed count
- Remove the old `order_item_progress` "Start Working" button (replaced by this quantity-based flow)

### 2. `src/components/EditOrderDialog.tsx`
- Update `fetchRemovableQuantities()`: instead of checking `order_item_progress` for the binary "started" flag, sum batch quantities where `eta IS NULL AND current_state = 'in_manufacturing'` — those are the removable (waiting) units
- Remove the `order_item_progress` check for manufacturing phase — it's now replaced by the ETA-based approach

### 3. `src/components/StartOrderDialog.tsx`
- No changes needed — it just starts the order, doesn't set ETAs on batches

### 4. `src/pages/QueueManufacturing.tsx`
- Optionally add "waiting" vs "in progress" counts to the queue list view

### 5. Stats and display helpers
- Add late-item detection for manufacturing (batches where `eta < now()` and still `in_manufacturing`)
- Reuse the existing ETA/late pattern from finishing/packaging phases

## Technical Details

### No database migration needed
The `order_batches` table already has `eta` and `lead_time_days` columns. We just start using them in the manufacturing phase.

### No state machine changes
The state remains `in_manufacturing`. The distinction is purely based on whether `eta` is set.

### Batch splitting on "Start Working"
When user selects qty X from a batch of Y:
- If X = Y: update batch in-place with `eta` and `lead_time_days`
- If X < Y: update batch to qty X with ETA, insert new batch with qty Y-X (no ETA)

### Edit order constraint change
```
removable_qty = SUM(quantity) WHERE order_item_id = ? 
                AND current_state = 'in_manufacturing' 
                AND eta IS NULL
```

