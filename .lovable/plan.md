

## Updated Plan: Restrict Extra Inventory Assignment to Admin Only

### What changed from the approved plan
The `ExtraItemsTab` component (the "Extra" tab within each phase page) currently allows any user to retrieve reserved extra batches, assign them to boxes, and move them directly. The approved plan already gates these actions behind `canManage` per phase. However, the user clarifies:

- **Assigning extra batches to an order** (via `ExtraInventoryDialog` on OrderDetail) = **admin only** (already in plan)
- **Retrieving/consuming reserved extra batches** within a phase page (`ExtraItemsTab`) = **phase manager + admin only** (already in plan)
- **Managers should NOT be able to assign (reserve) extra inventory to orders** — this is the `ExtraInventoryDialog` on `OrderDetail.tsx`, which is already gated as admin-only in the plan

### Confirmation: No plan changes needed

The approved plan already covers all three requirements:

1. **`ExtraInventoryDialog`** (reserve extra for order): Already listed as admin-only in Phase 4 (`OrderDetail.tsx` → Extra Inventory reservation → admin only)
2. **`ExtraItemsTab`** actions (retrieve, assign to box, move directly): Will receive a `canManage` prop, passed as `{phase}_manager || admin` from each phase page
3. **`ProductionRateSection`** machine assignment: Will receive a `canManage` prop, same gating

### Implementation (from pending plan items)

**`src/components/ExtraItemsTab.tsx`:**
- Add `canManage?: boolean` prop
- Gate "Assign to Box", "Move Directly", "Move to Ready" buttons behind `canManage`
- Gate quantity selection inputs behind `canManage`

**`src/components/ProductionRateSection.tsx`:**
- Add `canManage?: boolean` prop  
- Gate machine assignment Select, quantity Input, and Assign button behind `canManage`

**Phase pages pass `canManage`:**
- `OrderManufacturing.tsx`: `canManage={hasRole('manufacturing_manager') || hasRole('admin')}`
- `OrderFinishing.tsx`: `canManage={hasRole('finishing_manager') || hasRole('admin')}`
- `OrderPackaging.tsx`: `canManage={hasRole('packaging_manager') || hasRole('admin')}`
- `OrderBoxing.tsx`: `canManage={hasRole('boxing_manager') || hasRole('admin')}`

**`src/pages/OrderDetail.tsx`:**
- The "Extra Inventory" button that opens `ExtraInventoryDialog` is already gated to admin-only (confirmed in approved plan)

### Files to modify
- `src/components/ExtraItemsTab.tsx`
- `src/components/ProductionRateSection.tsx`
- `src/pages/OrderManufacturing.tsx`
- `src/pages/OrderFinishing.tsx`
- `src/pages/OrderPackaging.tsx`
- `src/pages/OrderBoxing.tsx`

