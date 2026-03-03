## Retrieved from Extra Inventory -- Completed/Shipments Tab Visibility

### Problem

When extra inventory items are consumed into an order, the resulting `order_batches` have `from_extra_state` set. Currently these batches are filtered out of Completed tabs, giving zero visibility. There is no traceability showing retrieved items contributed to the order.

### Key Rule: "Skipped THIS phase" vs "Processed in THIS phase"

An item's `from_extra_state` tells us which phase it was diverted from. If it was diverted from an **earlier** phase, it was still **processed** in the current phase and belongs in Production Rate. Only items where `from_extra_state` matches the **current** phase's extra state skipped this phase and belong in the "Retrieved from Extra" section.


| Phase              | Belongs in Production Rate                                                                       | Belongs in "Retrieved from Extra"          | &nbsp; |
| ------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ------ |
| Manufacturing      | `from_extra_state` is null                                                                       | `from_extra_state = 'extra_manufacturing'` | &nbsp; |
| Finishing          | `from_extra_state` is null or `'extra_manufacturing'`                                            | `from_extra_state = 'extra_finishing'`     | &nbsp; |
| Packaging          | `from_extra_state` is null, `'extra_manufacturing'`, or `'extra_finishing'`                      | `from_extra_state = 'extra_packaging'`     | &nbsp; |
| Boxing (Shipments) | `from_extra_state` is null, `'extra_manufacturing'`, `'extra_finishing'`, or `'extra_packaging'` | `from_extra_state = 'extra_boxing'`        | &nbsp; |


For example: an item retrieved from `extra_packaging` that enters boxing at `ready_for_boxing`, gets processed through `in_boxing` to `shipped` -- this item **was processed in boxing** and correctly appears in Production Rate, not in "Retrieved from Extra."

---

### Changes

#### 1. New Component: `RetrievedFromExtraSection`

**File**: `src/components/RetrievedFromExtraSection.tsx` (new)

A read-only display component with purple/indigo theme:

- Accepts an array of batches that skipped the current phase
- Groups by product (name, SKU)
- Shows quantity per product with a "From Extra" badge indicating source state
- No machine assignment controls
- Renders nothing if array is empty
- Header: "Retrieved from Extra Inventory" with a distinguishing icon

#### 2. Update `OrderManufacturing.tsx`

- Currently filters out ALL `from_extra_state` batches from completed (line 177-179)
- Change: split into `completedBatches` (no `from_extra_state`) and `retrievedBatches` (where `from_extra_state = 'extra_manufacturing'`)
- Render `RetrievedFromExtraSection` below `ProductionRateSection` in Completed tab

#### 3. Update `OrderFinishing.tsx`

- Currently filters out `extra_finishing`, `extra_packaging`, `extra_boxing` (line 207-208)
- Keep same filtering for Production Rate (this is already correct -- items from `extra_manufacturing` stay in Production Rate)
- Collect the filtered-out batches into `retrievedBatches`
- Render `RetrievedFromExtraSection` in Completed tab

#### 4. Update `OrderPackaging.tsx`

- Currently filters out batches based on `from_extra_state` and skipped states (line 191)
- Same pattern: split into production rate vs retrieved
- Render `RetrievedFromExtraSection` in Completed tab

#### 5. Update `OrderBoxing.tsx`

- **Add** `from_extra_state` **to the fetch query** (currently missing from line 152)
- In the Shipments tab, split shipped batches:
  - `from_extra_state = 'extra_boxing'` goes to `RetrievedFromExtraSection`
  - Everything else stays in `ProductionRateSection` (including items from `extra_packaging` that were actually processed in boxing)
- In the Ready tab: add a small "From Extra" badge on `ready_for_shipment` items that have `from_extra_state = 'extra_boxing'`
- In shipment cards: show "From Extra" badge on items with any `from_extra_state` set (fetch this field in `fetchShipments`)

### UI Layout

**Completed Tab (Manufacturing/Finishing/Packaging)**:

```text
+-- Completed Tab ----------------------------------------+
|                                                         |
|  [Production Rate Section]  (existing, unchanged)       |
|  - Product A: 50 processed, Machine M1: 30, M2: 20     |
|                                                         |
|  --- Retrieved from Extra Inventory (purple header) --- |
|  [Product A]  SKU-001  |  20 units  |  From Extra Mfg  |
|  [Product B]  SKU-002  |  10 units  |  From Extra Mfg  |
|                                                         |
+---------------------------------------------------------+
```

**Shipments Tab (Boxing)**:

```text
+-- Shipments Tab ----------------------------------------+
|                                                         |
|  [Production Rate]  (processed + from earlier phases)   |
|                                                         |
|  --- Retrieved from Extra Inventory (purple header) --- |
|  [Product B]  SKU-002  |  10 units  |  From Extra Box  |
|                                                         |
|  [Kartona SHP-001]                                      |
|    SKU-001 - Product A     x 30                         |
|    SKU-002 - Product B     x 10  [From Extra] badge     |
|                                                         |
+---------------------------------------------------------+
```

### Files Summary


| File                                           | Action                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `src/components/RetrievedFromExtraSection.tsx` | Create -- reusable read-only display                               |
| `src/pages/OrderManufacturing.tsx`             | Split completed batches, render new section                        |
| `src/pages/OrderFinishing.tsx`                 | Same pattern                                                       |
| `src/pages/OrderPackaging.tsx`                 | Same pattern                                                       |
| `src/pages/OrderBoxing.tsx`                    | Add `from_extra_state` to query, split shipped batches, add badges |
