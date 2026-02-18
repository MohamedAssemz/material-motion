

## Redesign Production Rate Section with Collapsible Order Item Entries

### Overview

Replace the current "Moved to Next Phase" section + flat "Production Rate" cards with a single, unified **Production Rate** section. Each entry represents an **order item** (product), shows total completed quantity, and provides inline machine assignment. Assigned sub-quantities are displayed as expandable/collapsible sub-entries grouped by machine.

### New Behavior

```text
Production Rate
+---------------------------------------------------------------+
| Prod A (SKU-001) - QTY 100  [qty input] [machine dropdown] [Assign] |
|   v Machine A: 25                                              |
|   v Machine B: 75                                              |
+---------------------------------------------------------------+
| Prod B (SKU-002) - QTY 50   [qty input] [machine dropdown] [Assign] |
|   (no assignments yet)                                         |
+---------------------------------------------------------------+
```

- Clicking "Assign" assigns the entered quantity (or full remaining unassigned qty) to the selected machine
- The system splits batches as needed: it picks unassigned batches, assigns the machine column, and if partial, splits a batch into assigned + remainder
- Sub-entries are grouped by machine, showing summed quantity per machine
- Each entry is collapsible (collapsed by default if all assigned, expanded if any unassigned)

### Technical Plan

#### 1. Rewrite `src/components/ProductionRateSection.tsx`

**New props interface** -- add `order_item_id` to `BatchData`:

```typescript
interface BatchData {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  machine_id: string | null;
  needs_boxing?: boolean;
  order_item_id: string | null; // NEW
}
```

**New grouping logic** -- group by `order_item_id` (falling back to `product_id`) instead of `product_id + machine_id`:

- Each group = one order item entry
- Within each group, compute:
  - `totalQty`: sum of all batch quantities
  - `assignedByMachine`: Map of machine_id to { machineName, qty, batch_ids }
  - `unassignedQty`: sum of batches with null machine_id
  - `unassignedBatchIds`: batch IDs with no machine

**New UI per entry** -- use Radix `Collapsible`:

- Header row: Product name, SKU, total qty badge, qty input field (defaulting to unassigned qty), machine dropdown, Assign button
- Collapsible content: list of machine sub-entries showing machine name and quantity
- "No Boxing" entries in boxing phase remain as static read-only cards

**New assign logic**:

- User enters a quantity and selects a machine
- `handleAssign` picks unassigned batches from the group, assigns the machine column
- If the requested quantity is less than total unassigned, it assigns full batches first, then splits the last batch if needed (update one batch's quantity, insert a new batch with the remainder)
- After assignment, refresh data via `onAssigned()`

#### 2. Update all 4 phase pages to pass `order_item_id`

**Manufacturing** (`OrderManufacturing.tsx`, ~line 957-970):
- Remove the "Moved to Next Phase" section (lines 927-953)
- Add `order_item_id` to the batch mapping for ProductionRateSection

**Finishing** (`OrderFinishing.tsx`, ~line 923-963):
- Remove the "Moved to Next Phase" section (lines 923-946)
- Add `order_item_id` to the batch mapping

**Packaging** (`OrderPackaging.tsx`, ~line 942-982):
- Remove the "Moved to Next Phase" section (lines 942-965)
- Add `order_item_id` to the batch mapping

**Boxing** (`OrderBoxing.tsx`, ~line 1291-1303):
- Add `order_item_id` to the batch mapping (no "Moved to Next Phase" section here)

#### 3. Batch splitting for partial assignment

When the user assigns a sub-quantity to a machine, the system needs to handle partial batches:

1. Sort unassigned batches by quantity (ascending)
2. Walk through batches, fully assigning until the remaining requested qty is less than the next batch's qty
3. If partial: update the current batch's quantity to the assigned portion and set its machine, then insert a new batch with the leftover quantity (same order_item_id, product_id, order_id, current_state, no machine)
4. This uses `supabase.from('order_batches').update(...)` and `.insert(...)` as needed

### Summary of Changes

| File | Change |
|------|--------|
| `src/components/ProductionRateSection.tsx` | Full rewrite: group by order_item_id, collapsible UI with qty input + machine dropdown, batch splitting on assign |
| `src/pages/OrderManufacturing.tsx` | Remove "Moved to Next Phase" section, add `order_item_id` to ProductionRateSection batch mapping |
| `src/pages/OrderFinishing.tsx` | Remove "Moved to Next Phase" section, add `order_item_id` to ProductionRateSection batch mapping |
| `src/pages/OrderPackaging.tsx` | Remove "Moved to Next Phase" section, add `order_item_id` to ProductionRateSection batch mapping |
| `src/pages/OrderBoxing.tsx` | Add `order_item_id` to ProductionRateSection batch mapping |

