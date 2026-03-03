

## Fix: `from_extra_state` Not Preserved Through Production Phases

### Root Causes

**1. Batch splits drop `from_extra_state`**
When any phase processes a batch and splits it (partial quantity), the new INSERT does not include `from_extra_state`. The split portion loses its provenance, effectively becoming a "normal" batch.

Affected files and lines:
- `OrderManufacturing.tsx` line 521-531 (split INSERT missing `from_extra_state`)
- `OrderFinishing.tsx` line 624-638 (split INSERT missing `from_extra_state`)
- `OrderPackaging.tsx` lines 584-596 and 668-678 (both split INSERTs missing `from_extra_state`)
- `OrderBoxing.tsx` lines 614-626 and 772-781 (both split INSERTs missing `from_extra_state`)

**2. `from_extra_state` records the extra batch's current state at consumption, not the original diversion phase**
In `ExtraItemsTab.tsx` (lines 331, 418, 536), `from_extra_state` is set to `batch.current_state` (e.g., `extra_finishing`). If an item was originally diverted from manufacturing (`extra_manufacturing`) but later progressed within the extra inventory system to `extra_finishing`, consuming it gives `from_extra_state = 'extra_finishing'`. This makes it appear as if the item skipped finishing, when it actually skipped manufacturing.

### Current Data for ORD-001

| current_state | from_extra_state | quantity |
|---|---|---|
| ready_for_shipment | extra_finishing | 70 |
| shipped | extra_boxing | 25 |

History shows 60 items were consumed from `extra_manufacturing`, 10 from `extra_finishing`, 25 from `extra_boxing`. But 60 items that should have `from_extra_state = 'extra_manufacturing'` ended up with `extra_finishing` or lost during splits.

### Fix Plan

#### Fix 1: Inherit `from_extra_state` on batch splits (all 4 phase pages)

Add `from_extra_state: batch.from_extra_state` (or equivalent) to every batch split INSERT across all phase pages. This ensures provenance is preserved when batches are partially consumed.

**Files to modify:**
- `src/pages/OrderManufacturing.tsx` -- 1 split INSERT (line ~525)
- `src/pages/OrderFinishing.tsx` -- 1 split INSERT (line ~630)
- `src/pages/OrderPackaging.tsx` -- 2 split INSERTs (lines ~588, ~670)
- `src/pages/OrderBoxing.tsx` -- 2 split INSERTs (lines ~618, ~776)

Each INSERT needs one additional field: `from_extra_state: batch.from_extra_state` (for pages that have it in the batch data) or reading it from the source batch.

**Note:** Manufacturing and Finishing active batch queries don't currently SELECT `from_extra_state`. We need to add it to the active batch queries as well so it's available during splits.

#### Fix 2: Use `from_state` from extra_batch_history instead of `batch.current_state` in ExtraItemsTab

In `ExtraItemsTab.tsx`, the `from_extra_state` on the order_batch should reflect the original phase the item was diverted from, not the extra batch's current state. Since extra batches can progress through states within the extra inventory system, the current state doesn't accurately reflect provenance.

Change `from_extra_state: batch.current_state` to use the extra batch's current state as-is (this IS the correct representation -- it tells you which extra state the item was in when consumed). The problem is upstream: items shouldn't be consumed from a later extra state if they originated from an earlier one without the system knowing.

**Actually, the simpler correct fix**: The `from_extra_state` SHOULD be `batch.current_state` because that tells you what the item skipped. An item consumed from `extra_finishing` means it was available at finishing level and bypassed finishing. This is semantically correct. The real problem is only Fix 1 (splits losing provenance).

However, looking at the data more carefully: 60 items consumed from `extra_manufacturing` should have had `from_extra_state = 'extra_manufacturing'`. But currently there are 0 batches with that value. This means those batches were split during finishing processing, and the split portions lost `from_extra_state`, then possibly merged with other batches.

**Fix 2 is therefore: just Fix 1 (inherit on splits) plus fixing the existing data.**

#### Fix 3: Fix existing data for ORD-001

Update the 70 items at `ready_for_shipment` with `from_extra_state = 'extra_finishing'`: based on history, 60 of these should have `from_extra_state = 'extra_manufacturing'` and 10 should have `'extra_finishing'`. However, since these batches may have been merged, we can't easily split them back. The pragmatic fix is to rely on `extra_batch_history` for accurate counts.

**Alternative approach for timeline cards**: Instead of relying on `from_extra_state` on order_batches (which can be lost during splits), use `extra_batch_history` CONSUMED events to calculate "retrieved" counts. This is the audit trail and is never lost.

### Recommended Approach

#### Part A: Fix batch splits (prevent future data loss)
Add `from_extra_state` inheritance to all 6 split INSERT locations across the 4 phase pages. Also add `from_extra_state` to active batch SELECT queries in Manufacturing and Finishing so the field is available.

#### Part B: Use `extra_batch_history` for timeline "retrieved" counts (accurate retrospective data)
In `OrderDetail.tsx`, instead of counting `from_extra_state` on order_batches for the "retrieved" metric, query `extra_batch_history` for CONSUMED events where `consuming_order_id = orderId`. Group by `from_state` to determine which phase the items were consumed from, then map to the appropriate phase card.

This gives accurate counts even when `from_extra_state` was lost during splits.

The mapping: a CONSUMED event with `from_state = 'extra_manufacturing'` means the item was retrieved from extra at manufacturing level. This contributes to the Manufacturing card's "retrieved" count.

**Changes to `getPhaseStats`:**
- `retrieved` = sum of CONSUMED events from `extra_batch_history` where `consuming_order_id = orderId` and `from_state = phaseExtraState`
- `processed` = `completed - retrieved` (total past-state batches minus retrieved)
- `completed` = total batches past this state (as currently calculated from `pastStateBatches`)

This requires fetching CONSUMED history alongside the existing CREATED history fetch.

### Files Summary

| File | Change |
|------|--------|
| `src/pages/OrderManufacturing.tsx` | Add `from_extra_state` to active batch SELECT; inherit on split INSERT |
| `src/pages/OrderFinishing.tsx` | Add `from_extra_state` to active batch SELECT; inherit on split INSERT |
| `src/pages/OrderPackaging.tsx` | Inherit `from_extra_state` on 2 split INSERTs |
| `src/pages/OrderBoxing.tsx` | Inherit `from_extra_state` on 2 split INSERTs |
| `src/pages/OrderDetail.tsx` | Fetch CONSUMED events from `extra_batch_history`; use for "retrieved" counts in timeline cards |

