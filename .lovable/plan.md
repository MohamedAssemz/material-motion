

## Plan: Order Cancellation Freeze Logic

### Requirements
1. When an order is cancelled, freeze all actions on phase pages **except** production rate (machine) assignment (which still respects role permissions)
2. Unretrieved reserved extra batches should be released back to AVAILABLE on cancellation

### Analysis
- Requirement 2 is **already implemented** in `handleCancelOrder` in `OrderDetail.tsx` (lines 462-471) — it releases reserved extra batches back to AVAILABLE
- Requirement 1 needs changes across 4 phase pages and their child components

### Implementation

**Core approach:** Each phase page already has a `canManage` boolean that gates actions. Add an `isCancelled` check derived from `order?.status === 'cancelled'` and use it to disable all actions except machine assignment.

**Files to modify:**

1. **`OrderManufacturing.tsx`** — Add `const isCancelled = order?.status === 'cancelled'`. Pass `isCancelled` to disable:
   - Box assignment dialog actions
   - Terminate/redo actions
   - MoveToExtraDialog
   - ExtraItemsTab `canManage` → `canManage && !isCancelled`
   - BoxReceiveDialog actions
   - Keep `ProductionRateSection canManage={canManage}` unchanged (still allows machine assignment)

2. **`OrderFinishing.tsx`** — Same pattern: `isCancelled` disables accept boxes, assign to box, MoveToExtraDialog, ExtraItemsTab, but keeps ProductionRateSection canManage unchanged.

3. **`OrderPackaging.tsx`** — Same pattern.

4. **`OrderBoxing.tsx`** — Same pattern. Additionally disable shipment creation.

5. **`OrderDetail.tsx`** — Add a visible "Cancelled" banner/badge. The cancel button is already hidden when `status === 'cancelled'`. Start Order and Extra Inventory sections are already gated to pending orders, so no changes needed there.

**Specific prop changes per phase page:**
- `ExtraItemsTab canManage={canManage && !isCancelled}` — freezes extra retrieval
- `ProductionRateSection canManage={canManage}` — unchanged, still allows machine assignment
- All action buttons (accept, assign, terminate, redo, move to extra, create shipment) gated with `!isCancelled`
- Box receive dialogs disabled when cancelled

**No database changes needed** — the cancellation already releases reserved batches.

