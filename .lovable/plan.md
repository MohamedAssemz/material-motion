

## Dashboard Redesign — Aesthetic Factory EMS Dashboard with Charts

### Layout Overview

```text
+--------------------------------------------------+
| Welcome Bar: "Good morning, [Name]" + Quick Acts  |
+--------------------------------------------------+
| KPI Cards (5)                                     |
| Orders | In Progress | Waiting | Late | Fulfilled |
+--------------------------------------------------+
| Production Pipeline    |  Order Status Donut      |
| (stacked horizontal    |  (pie: pending,          |
|  bar showing items     |   in_progress,           |
|  per phase)            |   completed, cancelled)  |
+--------------------------------------------------+
| Phase Queues (4 cards — existing but polished)    |
+--------------------------------------------------+
| Today's Throughput     | Alerts & Attention       |
| (bar chart: items      | - Late batches           |
|  processed per phase   | - Flagged items          |
|  today from            | - Cancelled orders       |
|  machine_production)   | - Approaching ETAs       |
+--------------------------------------------------+
| Recent Orders Table (last 8, with progress bars)  |
+--------------------------------------------------+
| Shipment Ready Banner (conditional)               |
+--------------------------------------------------+
```

### What's New (vs current dashboard)

1. **Welcome bar** with user greeting (from `profiles.full_name`) and role badge
2. **5th KPI card**: Late Batches (red) — count of batches where `eta < now()` and not shipped/terminated
3. **Production Pipeline Chart** — Horizontal stacked bar (recharts `BarChart` with layout="vertical") showing item count per phase. Visually shows bottlenecks at a glance.
4. **Order Status Donut** — `PieChart` showing distribution of orders by status (pending, in_progress, completed, cancelled). Clean donut style with center label showing total.
5. **Today's Throughput Bar Chart** — Vertical `BarChart` from `machine_production` table filtered to today's date, grouped by `state_transition` to show items processed per phase today.
6. **Alerts & Attention Panel** — Card with scrollable list of actionable items:
   - Late batches (past ETA, linked to order)
   - Flagged batches needing resolution
   - Orders with ETA within next 2 days
   Each row is clickable.
7. **Recent Orders Table** — Last 8 orders with: order number, customer name, status badge, item count, mini progress bar (shipped/total ratio). Clickable rows.
8. **Polished queue cards** — Keep existing structure but use explicit Tailwind classes (not dynamic `bg-${color}`) for reliable styling.

### Data Fetching

Single `fetchDashboardData` function with parallel queries:
- `orders` — status counts, recent 8 with customer join
- `order_batches` — state distribution, late count (`eta < now`, not terminated, not shipped)
- `order_batches` flagged — `is_flagged = true` and not terminated
- `machine_production` — today's records for throughput chart
- `order_items` — for recent orders item counts
- `profiles` — current user's `full_name`

Realtime subscription on `order_batches` already exists — keep it.

### Files to Modify

- **`src/pages/Dashboard.tsx`** — Complete rewrite. Uses recharts (`BarChart`, `PieChart`), existing UI primitives (`Card`, `Badge`, `Progress`, `Table`), and `date-fns` for time calculations. All imports already available in the project.

### Styling Approach

- Use the existing industrial blue design system (`--primary: 214 95% 36%`)
- Consistent phase colors: blue (manufacturing), purple (finishing), indigo (packaging), cyan (boxing), teal (shipment), green (shipped)
- Subtle gradients on KPI cards (`bg-gradient-to-br from-blue-50 to-transparent`)
- Charts use `recharts` with custom tooltip styling matching the app theme
- Responsive: 1 col on mobile, 2 col on tablet, full grid on desktop
- Fix the dynamic Tailwind class issue (current code uses `bg-${color}-100` which doesn't work — will use explicit classes)

### No database changes needed

All data is available from existing tables.

