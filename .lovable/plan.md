

## Fix Dashboard: Machine Bar Overflow + Empty Throughput

### Issue 1: Most Used Machines Bar Overflow

The progress bar (line 561-563) uses `ml-8` indentation plus the machine name, type badge, and count badge all competing for space. When names are long, the bar overflows the card.

**Fix**: Remove the progress bar entirely. Show a simpler list layout — just rank number, machine name, type badge, and count. Already limited to top 3, so no overflow risk without the bar.

### Issue 2: Throughput Card Always Empty

Line 233 explicitly sets `todayThroughput: {}` with the comment "No longer tracking state transitions." The `throughputData` memo (lines 284-292) reads from this empty object, so the chart always shows "No production recorded."

**Fix**: Query the `machine_production` table (which records actual state transitions with timestamps) and aggregate by `state_transition` within the time range. This table already exists and has data from production activity.

**Changes in `src/pages/Dashboard.tsx`:**

1. Add `machine_production` query to the `Promise.all` block:
   ```typescript
   supabase.from('machine_production')
     .select('state_transition')
     .gte('created_at', rangeStart)
   ```

2. Aggregate `state_transition` counts to populate `todayThroughput`:
   ```typescript
   const throughputMap: Record<string, number> = {};
   (machineProductionRes.data || []).forEach((r: any) => {
     throughputMap[r.state_transition] = (throughputMap[r.state_transition] || 0) + 1;
   });
   ```

3. Set `todayThroughput: throughputMap` instead of `{}`.

4. Remove the progress bar from Most Used Machines, keep just the list with rank, name, type badge, and ops count.

