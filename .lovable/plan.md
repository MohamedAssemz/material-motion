
## Add Extra Inventory Indicator to Orders List

### Goal
Show an indicator on the Orders list page and Order Details summary for orders that have had items moved to extra inventory. This helps users quickly identify which orders contributed surplus items.

---

### Why `extra_batch_history` Should NOT Be Deleted

The `extra_batch_history` table is **actively used** throughout the application:

1. **OrderDetail.tsx** - `fetchAddedToExtraCounts()` queries `CREATED` events to display "Added to Extra" counts per phase in the production timeline
2. **OrderManufacturing.tsx, OrderFinishing.tsx, OrderPackaging.tsx, OrderBoxing.tsx** - All query `CREATED` events to show "Added to Extra Inventory" sections in their Completed tabs  
3. **MoveToExtraDialog.tsx** - Creates `CREATED` event records when items are moved to surplus

The table provides **permanent audit trail** - even after extra batches are consumed, deleted, or consolidated, the history preserves which orders contributed to surplus inventory. This is critical for traceability and reporting.

---

### Implementation Approach

We will use `order_items.deducted_to_extra` column (already maintained by `MoveToExtraDialog`) for efficiency rather than querying history on each load.

---

### Changes to Orders List (`src/pages/Orders.tsx`)

**1. Update Order Interface**
Add `extra_count` property to track total items moved to extra inventory.

**2. Modify `fetchOrders()` Function**
When fetching order items, also retrieve `deducted_to_extra` and aggregate per order:
- Modify query: `select('id, order_id, quantity, deducted_to_extra, product:products(...)')`
- Calculate extra counts:
  ```typescript
  const extraCountsByOrder = new Map<string, number>();
  (itemsData || []).forEach((item: any) => {
    const current = extraCountsByOrder.get(item.order_id) || 0;
    extraCountsByOrder.set(item.order_id, current + (item.deducted_to_extra || 0));
  });
  ```
- Add `extra_count` to each order object

**3. Add Visual Indicator in Table**
Display a subtle orange package icon with tooltip next to orders with extra inventory:
- Import `Package` from lucide-react and `Tooltip` components
- Show icon when `order.extra_count > 0`
- Tooltip shows exact count: "15 items moved to extra inventory"

**4. Update CSV Export**
Add "Extra Count" column to exported data.

---

### Changes to Order Details (`src/pages/OrderDetail.tsx`)

**1. Add Summary Card for Total Extra**
In the summary cards grid (Total Items, Shipped, Shipping, EFT), add a new card showing total items added to extra inventory across all phases.

Calculate total:
```typescript
const totalAddedToExtra = Object.values(addedToExtraCounts).reduce((sum, count) => sum + count, 0);
```

Only show the card if `totalAddedToExtra > 0`.

**Card Design:**
- Label: "Added to Extra"
- Value: Total count in orange color
- Small package icon

---

### UI Preview

**Orders List Table:**
```
+------------------------------------------------------------------+
| Order Number  | Customer | Priority | Status | Units | ... |
+------------------------------------------------------------------+
| ORD-0042 [📦] | ACME     | normal   | In Prog| 5/100 | ... |
| ORD-0043      | Beta     | high     | Pending| 0/50  | ... |
| ORD-0044 [📦] | Gamma    | normal   | In Prog| 20/80 | ... |
+------------------------------------------------------------------+

[📦] = Orange package icon with tooltip "15 items added to extra inventory"
```

**Order Details Summary Cards:**
```
+---------------+---------------+---------------+---------------+---------------+
| Total Items   | Shipped       | Added to Extra| Shipping      | EFT           |
|     100       |     45        |   [📦] 15     |   Domestic    |    Feb 15     |
+---------------+---------------+---------------+---------------+---------------+
```
(Added to Extra card only appears if count > 0)

---

### Files to Modify

**1. `src/pages/Orders.tsx`**
- Add `extra_count?: number` to Order interface
- Modify order items query to include `deducted_to_extra`
- Calculate and store extra counts per order
- Import Tooltip components
- Add package icon with tooltip in table row
- Update CSV export to include extra count

**2. `src/pages/OrderDetail.tsx`**  
- Calculate `totalAddedToExtra` from `addedToExtraCounts`
- Add conditional summary card for extra inventory
- Position it after "Shipped" card in the grid

---

### Technical Notes

- Uses existing `deducted_to_extra` column - no new queries needed
- Tooltip provides detail without cluttering the table
- Orange color matches the existing "Added to Extra" styling in production timeline
- Extra card only shows when relevant (count > 0)
