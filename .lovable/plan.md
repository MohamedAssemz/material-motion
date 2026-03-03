

## Fix Extra Inventory Filtering Issues

### Problem 1: Packaging Completed Tab Shows Wrong Retrieved Items
The Packaging page's `skippedExtraStates` is `['extra_packaging', 'extra_boxing']`, causing items with `from_extra_state = 'extra_boxing'` to appear in the Packaging "Retrieved from Extra" section. Per the approved rule, each phase should only show items retrieved from its own extra state.

### Problem 2: Finishing Completed Tab Has Same Issue
The Finishing page's `skippedStates` is `['extra_finishing', 'extra_packaging', 'extra_boxing']`, which would similarly show items from later phases in Finishing's retrieved section.

### Problem 3: Order Detail Timeline Cards Exclude Retrieved Items from Completed Count
The `getPhaseStats` function in `OrderDetail.tsx` excludes all extra inventory items from the `completed` count. For Manufacturing, it uses `'all'` which means 0 completed even though 60 items were retrieved from extra and contributed to the order. The user wants retrieved items reflected in the timeline cards.

---

### Changes

#### 1. Fix `OrderPackaging.tsx` (line 189)
Change `skippedExtraStates` from `['extra_packaging', 'extra_boxing']` to `['extra_packaging']`.

This ensures only items that skipped packaging (retrieved from `extra_packaging`) appear in the "Retrieved from Extra" section. Items from `extra_boxing` were processed in packaging and belong in Production Rate.

#### 2. Fix `OrderFinishing.tsx` (line 209)
Change `skippedStates` from `['extra_finishing', 'extra_packaging', 'extra_boxing']` to `['extra_finishing']`.

Same logic: only items that skipped finishing belong in the retrieved section.

#### 3. Fix `OrderDetail.tsx` -- `getPhaseStats` (lines 570-575)
Two changes:
- Update the `extraExcludeMap` to only exclude the current phase's extra state per phase:
  ```typescript
  manufacturing: ['extra_manufacturing'],
  finishing: ['extra_finishing'],
  packaging: ['extra_packaging'],
  boxing: ['extra_boxing'],
  ```
- Add a `retrieved` field to `PhaseStats` that counts batches excluded from completed (those matching the phase's own extra state), and display it as a new "Retrieved" line in each timeline card.

#### 4. Update `PhaseStats` interface (line 116)
Add `retrieved: number` field.

#### 5. Update timeline card rendering (lines 887-912 and similar for other phases)
Add a "Retrieved" line (purple-themed) below "Completed" showing the count of items retrieved from extra inventory for that phase. Also update "Completed" to show processed + retrieved total, or keep them separate with clear labels.

**Recommended approach**: Show "Completed" as the processed count, and a separate "Retrieved" line for retrieved items. This keeps it clear what was actually processed vs retrieved.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/OrderPackaging.tsx` | Fix `skippedExtraStates` to `['extra_packaging']` |
| `src/pages/OrderFinishing.tsx` | Fix `skippedStates` to `['extra_finishing']` |
| `src/pages/OrderDetail.tsx` | Fix `extraExcludeMap`, add `retrieved` to `PhaseStats`, render "Retrieved" line in timeline cards |

