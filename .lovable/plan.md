## Plan: Order Cancellation, State Cleanup, Extra Box UX, and Admin Controls

### 1. Admin Force Un-Reserve Extra Batches

**What:** Add a three dots button on the Extra Inventory page (admin only) that shows the delete and to un-reserve a reserved batch, returning it to AVAILABLE status.

**Changes:**

- `**ExtraInventory.tsx**`: Add an "Un-reserve" action button (visible to admins) on reserved batches. On click, show confirmation dialog, then update the extra batch to `AVAILABLE` (clear `order_id`, `order_item_id`), and reduce the linked `order_items.deducted_to_extra` accordingly. Reuses the same pattern as the existing delete un-reservation logic.

### 2. Remove `pending_rm` State — Batches Start as `in_manufacturing`

**What:** Eliminate the `pending_rm` state entirely. New order batches are created with `current_state = 'in_manufacturing'`. The "Start Order" action simply changes order status from `pending` to `in_progress` (no batch state transition needed). Redo actions send batches back to `in_manufacturing` instead of `pending_rm`.

**Database migration:**

- Update `order_batches_current_state_check` constraint to remove `pending_rm`
- Update default value on `order_batches.current_state` from `'waiting_for_rm'` to `'in_manufacturing'`
- Migrate any existing `pending_rm` batches to `in_manufacturing`

**File changes (all `pending_rm` → `in_manufacturing` replacements):**

- `**OrderCreate.tsx**` (~line 287): Change initial batch state to `in_manufacturing`
- `**StartOrderDialog.tsx**`: Remove the batch state transition logic (just update order status to `in_progress`). The "pending batches" fetch still shows batches that are `in_manufacturing` for the confirmation summary.
- `**OrderManufacturing.tsx**`: Remove all `pending_rm` references — batches arrive as `in_manufacturing`. Remove `pendingRm` grouping field; all batches in manufacturing are "in progress". Update accept/redo logic.
- `**FlaggedItemsDialog.tsx**` (~lines 100-125): Redo sends batches to `in_manufacturing`
- `**Dashboard.tsx**`: Remove `pending_rm` from stats; manufacturing queue "waiting" becomes 0 or removed. Adjust `totalWaiting` calculation.
- `**OrderDetail.tsx**` (~line 647): Remove `pending_rm` as the "ready state" for manufacturing stats
- `**OrderTimeline.tsx**`: Remove `pending_rm` stage from timeline
- `**stateMachine.ts**`: Remove `pending_rm` from state type, labels, transitions, colors, `getAllStates()`
- `**stateUtils.ts**`: Remove `waiting_for_rm` references (if still used)
- `**ProductProgress.tsx**`, `**BatchCard.tsx**`, `**Boxes.tsx**`, `**BoxLookup.tsx**`: Remove `pending_rm` from color maps
- `**BoxDetailsDialog.tsx**`: Remove `pending_rm` from state formatting
- **RLS policies**: Update manufacturing manager's `WITH CHECK` to remove `pending_rm`/`waiting_for_rm`

### 3. Extra Box Selection — Filter by State + Inline UX

**What:** When creating an extra batch in the Extra Inventory page, filter the EBox selection to only show boxes that are EMPTY or contain batches matching the selected `current_state`. Replace the popup-inside-popup pattern with an inline searchable select.

**Changes:**

- `**ExtraBoxSelectionDialog.tsx**`: Add an optional `filterByState` prop. When provided, filter boxes to show only EMPTY boxes or boxes whose batches match that state. Fetch `extra_batches` grouped by `box_id` to determine each box's current state.
- `**ExtraInventory.tsx**`: For the batch creation form, replace the `ExtraBoxSelectionDialog` popup with an inline approach — either embed the box list directly in the form or use a `SearchableSelect` component. Pass `formData.current_state` as the filter. When the state dropdown changes, clear the selected box if it's no longer compatible.

### 4. Remove EBox Creation from ExtraBoxSelectionDialog

**What:** Remove the "Create new EBox" button from `ExtraBoxSelectionDialog`. EBoxes can only be created from the Warehouse (Boxes) page.

**Changes:**

- `**ExtraBoxSelectionDialog.tsx**`: Remove `allowCreate` prop handling, the `handleCreateNewBox` function, and the "+" create button from the UI. Remove the "Create your first EBox" link in the empty state.
- `**ExtraInventory.tsx**`: Remove `allowCreate={true}` prop from `ExtraBoxSelectionDialog` usage.

### 5. Item 5 — Empty

The user's message ends with "5." but no content — this will be skipped.

---

### Summary of files to modify:

- `ExtraInventory.tsx` — un-reserve action, inline box select, remove create button
- `ExtraBoxSelectionDialog.tsx` — add state filter, remove create functionality
- `OrderCreate.tsx` — `in_manufacturing` initial state
- `StartOrderDialog.tsx` — simplify start logic
- `OrderManufacturing.tsx` — remove `pending_rm` references
- `FlaggedItemsDialog.tsx` — redo → `in_manufacturing`
- `Dashboard.tsx` — remove `pending_rm` stat
- `OrderDetail.tsx` — update manufacturing stats
- `OrderTimeline.tsx` — remove pending_rm stage
- `stateMachine.ts` — remove `pending_rm` state
- `ProductProgress.tsx`, `BatchCard.tsx`, `Boxes.tsx`, `BoxLookup.tsx`, `BoxDetailsDialog.tsx` — remove `pending_rm` from color/label maps
- **DB migration**: update constraint, default, migrate existing data, update RLS