

## Plan: Simplify Machine Analytics — Query `order_batches` Directly

### Problem
The `machine_production` table is empty and nothing populates it. The current MachineProductionTab and Dashboard "Most Used Machines" card both query this empty table.

### Simplified approach
Instead of creating triggers, backfill migrations, and finish-event inserts across 4 phase pages, **derive all analytics directly from `order_batches` and `extra_batches`**. These tables already have `manufacturing_machine_id`, `finishing_machine_id`, `packaging_machine_id`, and `boxing_machine_id` columns populated by `ProductionRateSection`. No database changes needed at all.

### Changes

**1. `src/components/reports/MachineProductionTab.tsx`** — Rewrite data fetching:
- Replace `machine_production` query with `order_batches` query selecting `manufacturing_machine_id, finishing_machine_id, packaging_machine_id, boxing_machine_id, quantity, updated_at`
- Also query `extra_batches` with the same machine columns
- Flatten into a unified list: for each batch, emit one record per non-null machine column (e.g. if `manufacturing_machine_id` is set, emit `{ machine_id, type: 'manufacturing', quantity, date }`)
- Remove the `state_transition` / `getPhaseFromTransition` logic — phase is now derived directly from which column the machine ID came from
- Remove the "Phase Breakdown (start vs finish)" chart (Section C) since we no longer track start/finish events — replace with a simpler "Units per Phase" chart showing total quantity assigned per phase
- Keep everything else (filters, ops-per-machine bar chart, daily trend, leaderboard) but count by `quantity` (units assigned) instead of number of records

**2. `src/pages/Dashboard.tsx`** — Rewrite "Top Machines" data:
- Remove the two `machine_production` queries (lines 162 and 168)
- Replace with a single `order_batches` query: `select('manufacturing_machine_id, finishing_machine_id, packaging_machine_id, boxing_machine_id, quantity')`
- Aggregate: for each non-null machine column, sum `quantity` per machine ID
- Build `topMachines` from this aggregation — same shape `{ name, count, type }`
- Keep the existing card UI unchanged

### What gets removed
- All references to `machine_production` table in frontend code
- The `getPhaseFromTransition` helper
- The "Phase Breakdown (start vs finish)" chart — replaced with "Units per Phase" (simpler, just sums quantities by phase)
- The trend logic comparing halves of period stays (it's useful), but operates on the flattened batch data instead

### No database changes needed
The `machine_production` table stays in the schema but is simply unused. No triggers, no backfills, no phase page modifications.

