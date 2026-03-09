

## Drop `machine_production` Table and Derive Throughput from `order_batches`

### Context

The `machine_production` table is empty and has no INSERT logic anywhere. Both consumers (Dashboard throughput chart, Analytics machine stats) query it and get nothing. The `MachineProductionTab` in Reports already derives machine stats from `order_batches` machine columns — we follow the same pattern.

### Changes

#### 1. Database Migration
```sql
DROP TABLE IF EXISTS public.machine_production;
```

#### 2. `src/pages/Dashboard.tsx` — Throughput from `order_batches`

Replace the `machine_production` query (line 170) with a query on `order_batches` that fetches `current_state, quantity, updated_at` within the time range. Then derive throughput by counting quantities per state (mapping states to the existing `TRANSITION_LABELS` keys):

- `in_manufacturing` → `start_manufacturing`
- `ready_for_finishing` / `in_finishing` → `finish_manufacturing` / `start_finishing`
- etc.

Remove `machineProductionRes` from the destructuring. Build `throughputMap` from batch states instead.

#### 3. `src/pages/Analytics.tsx` — Machine stats from `order_batches`

Replace the `machine_production` query (line 149-151) with a query on `order_batches` selecting machine ID columns + `updated_at`. For each batch, check which machine columns are populated and count production per machine (same approach as the existing `MachineProductionTab.flattenBatches`).

Remove the `machine_production` realtime subscription (line 91-93).

### Result

- Throughput chart on Dashboard will show actual production activity derived from batch state data.
- Analytics machine stats will reflect real machine assignments from `order_batches`.
- The empty, unused `machine_production` table is removed from the schema.

