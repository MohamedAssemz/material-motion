
### What I found (root cause confirmed)

I checked the live data for **ORD-002** and the current code paths:

- `order_batches` currently has only one active shipped batch:  
  `shipped / from_extra_state = extra_manufacturing / qty = 80`
- `extra_batch_history` for the same order shows immutable consumed truth:  
  - `extra_manufacturing = 50`
  - `extra_finishing = 20`

This mismatch proves provenance is still being corrupted after retrieval, even in new orders.

The split fix is present, but there is still a second loss path: **consolidation merges in Boxing**.

### Actual bug path still open

In `src/pages/OrderBoxing.tsx`, both flows below consolidate by `order_id + product_id + order_item_id + state` but **do not include `from_extra_state`** in consolidation key:

1. `handleMoveToReadyForShipment` (in_boxing -> ready_for_shipment)
2. `handleCreateKartona` (ready_for_shipment -> shipped)

So retrieved and non-retrieved batches are merged together; one `from_extra_state` survives and the other is lost/misclassified.

Also found one additional bug in shipment consolidation:
- Partial ship consolidation query does not consistently scope by `shipment_id`, which can also merge into wrong target batches.

---

### Implementation plan

## 1) Fix consolidation key so provenance cannot be merged away (primary fix)

**File:** `src/pages/OrderBoxing.tsx`

- Update all existing-batch lookup queries used for consolidation to include provenance-aware matching:
  - same `from_extra_state` (null-safe comparison)
  - same `shipment_id` when consolidating shipped batches
- If no exact provenance match exists, do **not** merge; create a separate batch (or keep current batch update path).
- Keep `from_extra_state` inheritance on split inserts (already done) and verify all split branches still pass it.

Expected result:
- Retrieved and processed quantities remain separated in new orders.
- No more “everything becomes extra_manufacturing” or similar drift.

## 2) Make Retrieved section source-of-truth come from history, not mutable batch labels (robustness + existing orders)

**Files:**
- `src/pages/OrderManufacturing.tsx`
- `src/pages/OrderFinishing.tsx`
- `src/pages/OrderPackaging.tsx`
- `src/pages/OrderBoxing.tsx`

For each phase page:
- Add a phase-specific fetch from `extra_batch_history`:
  - `event_type = CONSUMED`
  - `consuming_order_id = orderId`
  - `from_state = extra_<phase>`
- Group by product and feed `RetrievedFromExtraSection` from this grouped history dataset.
- Stop depending on `order_batches.from_extra_state` for Retrieved panel rows.

Expected result:
- Retrieved sections remain accurate even if a prior consolidation already damaged batch-level provenance.

## 3) Stabilize phase “Processed” card math against mixed/legacy provenance (Order Details)

**File:** `src/pages/OrderDetail.tsx`

Keep `retrieved` from `extra_batch_history` (already correct), then compute processed with a defensive hybrid so cards don’t collapse when labels were previously merged:

- `processedByCurrentLabels`: using current batch labels (exclude only current phase’s own extra state)
- `processedByDiff`: `completed - retrieved`
- `processed = max(processedByCurrentLabels, processedByDiff)`
- `completed = processed + retrieved`

This preserves expected behavior in both:
- clean provenance data, and
- already-corrupted orders where one signal is degraded.

## 4) Optional cleanup for legacy data visibility (no destructive rewrite)

No direct data mutation needed to ship the fix.  
UI will become correct going forward and much more correct for existing orders by using history-based retrieval.

If needed later, we can add a one-time admin repair script, but it is not required for the immediate bug fix.

---

### Files to modify

- `src/pages/OrderBoxing.tsx`  
  (provenance-safe consolidation + shipment-scope correction)
- `src/pages/OrderManufacturing.tsx`  
  (history-based retrieved feed)
- `src/pages/OrderFinishing.tsx`  
  (history-based retrieved feed)
- `src/pages/OrderPackaging.tsx`  
  (history-based retrieved feed)
- `src/pages/OrderDetail.tsx`  
  (defensive processed/completed card calculation)

---

### Validation checklist after implementation

1. Re-run ORD-002 and verify:
   - Finishing retrieved shows 20 from EI.
   - Manufacturing retrieved no longer inflates to 80.
2. Create a fresh order and repeat retrieval + boxing + shipment flow:
   - Ensure mixed provenance batches are not merged into one label.
3. Confirm card metrics in Order Details remain stable before and after shipment creation.
4. Confirm no regressions in shipment creation and export flow.

