

## Fix Timeline Card Metrics and Remove Extra Tags

### Problem 1: Double-counting in timeline cards
Currently, "Completed" includes both normally processed items AND items retrieved from earlier phases' extra inventory. The separate "Retrieved" line then shows items that skipped the current phase. But items retrieved from the current phase's extra state are also being counted somewhere, causing confusion. The user wants clearer, standardized metrics.

### Problem 2: Redundant tag in Retrieved from Extra section
The purple badge showing "From Extra Mfg" / "From Extra Finish" etc. on each entry in `RetrievedFromExtraSection` is unnecessary since the section already tells you these are from extra inventory, and per the filtering rule, they can only be from the current phase's extra state.

---

### Changes

#### 1. Restructure timeline card metrics in `OrderDetail.tsx`

Rename and redefine the `PhaseStats` fields:

| Field | Old meaning | New meaning |
|-------|------------|-------------|
| `waiting` | Same | Same (no change) |
| `inProgress` | Same | Same (no change) |
| `completed` | Processed + retrieved from earlier phases | **Total moved to next phase** = processed + retrieved |
| `retrieved` | Items that skipped this phase | Same (items from current phase's extra state) |
| `addedToExtra` | Same | Same (no change) |
| NEW `processed` | N/A | Items processed normally (no `from_extra_state`, or from earlier phase) |

**In `getPhaseStats`** (lines 583-599):
- Add `processed` field: batches past this state where `from_extra_state` is null or from an earlier phase
- Keep `retrieved` as-is: batches where `from_extra_state` matches current phase
- Change `completed` to: `processed + retrieved` (total items that moved past this phase)

**In card rendering** (lines 896-926 and similar for all 4 phases):
- Show: Waiting, In Progress, Processed (green), Retrieved (purple, conditional), Added to Extra (orange, conditional), then **Completed** (bold/accent, = processed + retrieved)
- For Boxing card: "Completed" label could say "Shipped / Ready" or just "Completed"

#### 2. Remove the source-state badge from `RetrievedFromExtraSection.tsx`

In the component (line 80-82), remove the purple badge that shows `EXTRA_STATE_LABELS[group.from_extra_state]`. The section header already indicates these are from extra inventory, and the filtering ensures only the current phase's items appear.

Also remove the `EXTRA_STATE_LABELS` constant and the `from_extra_state` field from the grouping logic since it's no longer displayed.

---

### Files to modify

| File | Change |
|------|--------|
| `src/pages/OrderDetail.tsx` | Add `processed` to `PhaseStats`, redefine `completed` as processed+retrieved, update card rendering for all 4 phases |
| `src/components/RetrievedFromExtraSection.tsx` | Remove the "From Extra Mfg/Finish/etc." badge from each entry |

