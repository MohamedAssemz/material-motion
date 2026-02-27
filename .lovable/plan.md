

## Extra Tab Enhancements: "Move Directly" and "Added to Extra" Relocation

### Overview
Two changes to the Extra tab across all phase pages (Manufacturing, Finishing, Packaging, Boxing):

1. **"Move Directly" button** in `ExtraItemsTab` -- lets users move reserved extra inventory items directly into the next phase's state (creating `order_batches` in the "in_X" state) without needing a box assignment and then a separate receive step.

2. **Move "Added to Extra Inventory" section** from the Completed tab into the Extra tab, so the Extra tab becomes the single place for all extra-inventory-related information for an order.

---

### Part 1: "Move Directly" in ExtraItemsTab

**File: `src/components/ExtraItemsTab.tsx`**

Currently the Extra tab has two actions:
- **Boxing phase**: "Move to Ready" (skips box, creates `ready_for_shipment` batches)
- **Other phases**: "Assign to Box" (requires selecting a box, creates `ready_for_X` batches)

Add a new **"Move Directly"** button for non-boxing phases that:
- Creates `order_batches` in the **"in" state** of the next phase (not "ready for"), so items skip the receive step
  - Manufacturing: creates batches in `in_finishing`
  - Finishing: creates batches in `in_packaging`
  - Packaging: creates batches in `in_boxing`
- Does NOT require a box (sets `box_id = null`)
- Consumes from extra batches the same way as existing logic (reduce/delete extra_batch, log CONSUMED history, update EBox items_list)
- Uses `from_extra_state` on the created `order_batch` for proper tracking

Implementation:
- Add a new constant map: `PHASE_DIRECT_MOVE_STATE` mapping phase to the target "in" state
- Add a new handler `handleMoveDirectly()` similar to `handleMoveToReady()` but targeting the direct state
- Add a "Move Directly" button next to the existing "Assign to Box" button (for manufacturing, finishing, packaging phases)
- Boxing phase keeps existing "Move to Ready" behavior unchanged

### Part 2: Move "Added to Extra" from Completed to Extra Tab

**Files: All 4 phase pages**
- `src/pages/OrderManufacturing.tsx`
- `src/pages/OrderFinishing.tsx`
- `src/pages/OrderPackaging.tsx`
- `src/pages/OrderBoxing.tsx`

Currently each phase page:
- Has `fetchAddedToExtra()` that queries `extra_batch_history` for `CREATED` events from this order
- Renders `addedToExtraItems` in the Completed tab with orange-themed cards
- Also passes `extraBatchesForRate` to `ProductionRateSection` in the Completed tab

Changes per page:
1. **Move the "Added to Extra Inventory" UI section** from `<TabsContent value="completed">` to `<TabsContent value="extra">`, placing it **below** the `<ExtraItemsTab>` component
2. The section will appear with a divider/header: "Added to Extra from this Order"
3. Keep `extraBatchesForRate` in the Completed tab's `ProductionRateSection` (production rate tracking stays in Completed)
4. The Extra tab layout becomes:
   - First: `<ExtraItemsTab>` (reserved items needing retrieval/processing)
   - Divider
   - Second: "Added to Extra from this Order" cards (orange-themed, read-only summary)

### Technical Details

**No database changes required.** All changes are UI-only.

**`ExtraItemsTab.tsx` changes:**
- Add `PHASE_DIRECT_MOVE_STATE` map:
  ```text
  manufacturing -> in_finishing
  finishing -> in_packaging
  packaging -> in_boxing
  boxing -> (not used, keeps existing "Move to Ready")
  ```
- New `handleMoveDirectly()` function: same pattern as `handleMoveToReady()` but uses the direct state and sets `box_id = null`
- Add button in the actions bar: "Move Directly" (with ArrowRight icon), visible only for non-boxing phases, disabled when `totalSelected === 0`

**Phase page changes (all 4 files):**
- Cut the "Added to Extra Inventory" JSX block from the completed `TabsContent`
- Paste it into the extra `TabsContent`, after the `<ExtraItemsTab>` component
- Add a section header/divider before it

