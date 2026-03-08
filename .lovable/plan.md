

## Dashboard KPI & Alerts Updates

### Changes to `src/pages/Dashboard.tsx`

**1. KPI Cards — Replace and Add**

- **Remove** "In Progress" and "Waiting" cards
- **Change** "Late Batches" → "Late Orders" — count distinct `order_id`s from late batches instead of summing quantities
- **Add** "New Orders" card — always queries orders created today (`startOfDay(now)`) regardless of time filter, subtitle "Today"
- **"Active Orders"** — shows orders with status `pending` or `in_progress` within the selected time range
- All KPI cards (Active Orders, Late Orders, New Orders) become clickable → navigate to `/orders`
- Grid changes from 6 columns to 5 (Active Orders, New Orders, Late Orders, Fulfillment, Extra Inventory)

**Data fetching updates:**
- Add new query: `orders` created today for "New Orders" count (independent of `timeRange`)
- Add new query: count distinct `order_id` from late batches for "Late Orders"
- Late batches and flagged batches queries: add `.neq('order.status', 'cancelled')` or filter join to exclude cancelled orders

**2. Alerts & Attention — Filter to Active Orders Only**

- Late batches query: join orders and exclude `status = 'cancelled'`
- Flagged batches query: same filter
- Approaching ETA query: already excludes completed/cancelled — no change needed

**3. Remove Recent Orders Table**

- Delete the entire "Recent Orders" section (lines 558-611)
- Remove `recentOrders`, `orderItemCounts`, `orderShippedCounts` from data fetching and state since they're no longer used

### No database changes needed

