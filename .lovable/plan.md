
## COMPLETED: Fix provenance loss through consolidation merges + history-based retrieved sections

### Changes Made

#### 1. Provenance-aware consolidation in OrderBoxing.tsx
- All 4 consolidation queries (2 in `handleMoveToReadyForShipment`, 2 in `handleCreateKartona`) now include `from_extra_state` in the lookup key using null-safe comparison (`eq` for non-null, `is null` for null).
- Shipped batch consolidation also scopes by `shipment_id` to prevent cross-shipment merges.
- Result: Batches with different provenance are never merged together going forward.

#### 2. History-based Retrieved sections in all 4 phase pages
- All phase pages (Manufacturing, Finishing, Packaging, Boxing) now fetch `CONSUMED` events from `extra_batch_history` to populate the "Retrieved from Extra" section.
- Completed batches are no longer filtered by `from_extra_state` — all go to Production Rate.
- Result: Retrieved sections are accurate even for orders with previously corrupted batch-level provenance.

#### 3. Defensive hybrid card math in OrderDetail.tsx
- `processed = max(processedByCurrentLabels, completed - retrieved)` ensures cards remain correct for both clean and corrupted data.
- `completed = processed + retrieved` ensures consistency.

### Files Modified
- `src/pages/OrderBoxing.tsx` — provenance-safe consolidation + history-based retrieved
- `src/pages/OrderManufacturing.tsx` — history-based retrieved
- `src/pages/OrderFinishing.tsx` — history-based retrieved
- `src/pages/OrderPackaging.tsx` — history-based retrieved
- `src/pages/OrderDetail.tsx` — defensive hybrid card calculation
