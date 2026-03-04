

## Roles & Permissions Overhaul

### Summary
Replace the current 9-role system with 5 roles. Each phase manager owns CRUD for their phase; admin owns everything else. All other roles view only.

### New Roles
| Role | DB Enum Value | Display Name |
|------|--------------|--------------|
| Admin | `admin` | Administrator |
| Manufacturing Manager | `manufacturing_manager` | Manufacturing Manager |
| Finishing Manager | `finishing_manager` | Finishing Manager |
| Packaging Manager | `packaging_manager` | Packaging Manager |
| Boxing Manager | `boxing_manager` | Boxing Manager |

### Role Mapping (existing → new)
- `manufacture_lead`, `manufacturer` → `manufacturing_manager`
- `packer` → `packaging_manager`
- `boxer` → `boxing_manager`
- `qc`, `viewer` → remove (reassign users manually)
- `packaging_manager`, `boxing_manager`, `admin` → keep as-is

### Phase 1: Database Migration

**1a. Replace `app_role` enum:**
- Create new enum with 5 values
- Migrate `profiles.primary_role` and `user_roles.role` columns
- Map old values to new values
- Drop old enum

**1b. Update `handle_new_user()` trigger** — default to `manufacturing_manager` instead of `viewer`

**1c. Update `has_role()` function** — works as-is (generic)

**1d. Update `notify_unit_update()` function** — replace old role references

**1e. Update ALL RLS policies** referencing old roles:

| Table | Policy | Change |
|-------|--------|--------|
| `boxes` | "Leads and admins can manage" | `admin` only |
| `extra_boxes` | "Leads and admins can manage" | `admin` only |
| `orders` | INSERT/UPDATE/DELETE policies | `admin` only |
| `order_items` | "Leads can manage" | `admin` only |
| `order_batches` | "Leads and admins can manage" | `admin` only |
| `order_batches` | "Boxing roles can insert/update" | `boxing_manager` (remove `boxer`) |
| `extra_batches` | "Leads and admins can manage" | `admin` only + phase managers for updates |
| `extra_products` | "Leads and admins can manage" | `admin` only |
| `extra_batch_history` | "Leads and admins can insert" | `admin` + all phase managers |
| `customers` | "Leads and admins can manage" | `admin` only |
| `raw_material_versions` | "Leads and admins can manage" | `admin` only |
| `raw_material_receipts` | "Leads and admins can manage" | `admin` only |
| `units` | "Role-based unit updates" | Replace old roles with new manager roles |
| `machine_production` | "Workers can record" | Replace `manufacturer`/`packer` with managers |
| `shipments` | "Boxing managers and admins" | Keep (already correct) |

**Add new UPDATE policies on `order_batches`** for phase managers:
- `manufacturing_manager`: can update batches in manufacturing states
- `finishing_manager`: can update batches in finishing states
- `packaging_manager`: can update batches in packaging states

### Phase 2: Edge Function Update

**`supabase/functions/admin-users/index.ts`** — no code change needed (accepts any `app_role` from DB)

### Phase 3: Frontend — Constants & Auth

**`src/lib/stateUtils.ts`:**
- Update `roleDisplayNames` to 5 roles
- Update `stateTransitionPermissions` roles arrays
- Update `UserRole` type

**`src/components/AppLayout.tsx`:**
- Update `roleDisplayNames` map to 5 roles
- No nav filtering changes needed (all roles see all pages, actions are gated)

**`src/contexts/AuthContext.tsx`** — no change needed

### Phase 4: Frontend — Permission Gating

**Per-phase `canManage` updates:**

| File | Current `canManage` | New `canManage` |
|------|-------------------|-----------------|
| `OrderManufacturing.tsx` (line 123) | `manufacture_lead \|\| manufacturer \|\| admin` | `manufacturing_manager \|\| admin` |
| `OrderFinishing.tsx` (line 117) | `manufacture_lead \|\| packaging_manager \|\| packer \|\| admin` | `finishing_manager \|\| admin` |
| `OrderPackaging.tsx` (line 112) | `packaging_manager \|\| packer \|\| admin` | `packaging_manager \|\| admin` |
| `OrderBoxing.tsx` (line 134) | `boxing_manager \|\| boxer \|\| admin` | `boxing_manager \|\| admin` |

**Admin-only actions:**

| File | Action | Change |
|------|--------|--------|
| `Orders.tsx` (line 360) | Create Order button | `admin` only |
| `OrderCreate.tsx` (line 88) | Access gate | `admin` only |
| `OrderDetail.tsx` (line 558-560) | `canUpdate` (Start Order) | `admin` only |
| `OrderDetail.tsx` (line 560) | `canDelete` (Cancel Order) | `admin` only |
| `OrderDetail.tsx` | Extra Inventory reservation | `admin` only |
| `ExtraInventory.tsx` (line 82) | `canManage` | `admin` only |

**`src/pages/Admin.tsx` + `CreateUserDialog.tsx`:**
- Update `AVAILABLE_ROLES` to 5 new roles

### Phase 5: Admin-Only Deletion Features

**5a. Delete Machines (`Machines.tsx`):**
- Add delete button (admin only) — sets `is_active = false` permanently
- Existing machine queries already filter `is_active = true` for assignment
- Historical batch references preserved

**5b. Delete Extra Inventory Batches (`ExtraInventory.tsx`):**
- Add delete button per batch (admin only)
- If `AVAILABLE`: hard delete from `extra_batches`
- If `RESERVED`: update `order_items.deducted_to_extra -= quantity`, clear reservation fields, then delete

**5c. Delete Catalog Products (`Catalog.tsx`):**
- Add delete action (admin only)
- Hard delete from `products` — past `order_items`/`order_batches` retain the UUID (no FK constraints)
- UI already handles missing products gracefully

### Phase 6: Force Empty Box (Admin Only)

- New `ForceEmptyBoxDialog` component
- For each batch in the box:
  - If `from_extra_state` is set: look up original EBox from `extra_batch_history` (CONSUMED event), recreate `extra_batch` as RESERVED in that EBox, delete the `order_batch`
  - If not from extra: revert to previous state (e.g., `ready_for_finishing` → `in_manufacturing`), clear `box_id`
- Clear box `items_list`
- Add button in `BoxDetailsDialog` (admin only)

### Phase 7: Queue Pages

Update queue pages to be view-only for non-managers:
- `QueueManufacturing.tsx` — view only unless `manufacturing_manager` or `admin`
- `QueueFinishing.tsx` — view only unless `finishing_manager` or `admin`
- `QueuePackaging.tsx` — view only unless `packaging_manager` or `admin`
- `QueueBoxing.tsx` — view only unless `boxing_manager` or `admin`

### Files to modify
**Database:** 1 large migration (enum swap, data migration, RLS policy updates, trigger updates)
**Edge function:** `supabase/functions/admin-users/index.ts` (minor)
**Frontend (~20 files):**
- `src/lib/stateUtils.ts`
- `src/components/AppLayout.tsx`
- `src/components/CreateUserDialog.tsx`
- `src/pages/Admin.tsx`
- `src/pages/Orders.tsx`
- `src/pages/OrderCreate.tsx`
- `src/pages/OrderDetail.tsx`
- `src/pages/OrderManufacturing.tsx`
- `src/pages/OrderFinishing.tsx`
- `src/pages/OrderPackaging.tsx`
- `src/pages/OrderBoxing.tsx`
- `src/pages/ExtraInventory.tsx`
- `src/pages/Machines.tsx`
- `src/pages/Catalog.tsx`
- `src/pages/Boxes.tsx`
- `src/pages/QueueManufacturing.tsx` – `QueueBoxing.tsx`
- New: `src/components/ForceEmptyBoxDialog.tsx`

### Implementation order
1. Database migration (enum + RLS + triggers)
2. `stateUtils.ts` + `AppLayout.tsx` + `AuthContext` constants
3. Admin page + CreateUserDialog role lists
4. Phase pages `canManage` updates
5. OrderDetail / Orders / OrderCreate admin gating
6. ExtraInventory admin gating
7. Deletion features (Machines, Extra batches, Catalog)
8. Force Empty Box dialog
9. Queue pages view-only gating

