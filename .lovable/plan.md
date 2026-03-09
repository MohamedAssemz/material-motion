

## Dashboard: Three Fixes

### 1. Remove Role Badge (line 336-340)
Delete the `primaryRole` Badge rendered next to the time range selector.

### 2. Fix Empty Throughput
The `todayThroughput` object is hardcoded as `{}` on line 174 and never populated. 

**Fix**: Add a query for `order_batches` updated within the selected time range (using `updated_at >= rangeStart`), then group by `current_state` and sum quantities. Map states to transition labels to populate the throughput chart. This shows how many items moved through each phase in the period.

```ts
// New query in Promise.all:
supabase.from('order_batches')
  .select('current_state, quantity')
  .gte('updated_at', rangeStart)

// Then build todayThroughput from results:
const todayThroughput: Record<string, number> = {};
(throughputRes.data || []).forEach((b) => {
  todayThroughput[b.current_state] = (todayThroughput[b.current_state] || 0) + b.quantity;
});
```

Update the throughput chart to use state labels (PHASE_LABELS) instead of TRANSITION_LABELS since we're grouping by `current_state`.

### 3. Enhance Alerts & Attention
- Group alerts by severity with section headers (Late, Approaching ETA)
- Add relative time info (e.g., "2 days overdue", "due in 1 day")
- Show alert icons with colored left borders for visual distinction
- Add a "stalled orders" alert: orders `in_progress` with no batch updates in 3+ days
- If no alerts, show a more descriptive all-clear state

### Files Changed
- `src/pages/Dashboard.tsx` — all three fixes in one file

