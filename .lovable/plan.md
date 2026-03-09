

## Table Usage Analysis

### `extra_products` — NOT USED
This table exists in the database schema but is **never referenced in any application code** (only appears in the auto-generated `types.ts`). It seems like a legacy table that was superseded by `extra_batches` + `extra_boxes` for managing surplus inventory.

**Recommendation: Drop it.**

### `machine_production` — ACTIVELY USED
This table is used in two places:
1. **`src/pages/Dashboard.tsx`** — Queried for the Throughput chart (the fix we just implemented), aggregating `state_transition` counts.
2. **`src/pages/Analytics.tsx`** — Queried for machine production stats (today/week counts per machine) and subscribed to for realtime updates.

**Recommendation: Keep it.**

### Plan

Run a single migration to drop only the `extra_products` table:

```sql
DROP TABLE IF EXISTS public.extra_products;
```

No code changes needed since no application code references this table.

