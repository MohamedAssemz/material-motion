

# Per-Order-Item Raw Materials with Timeline History

## Overview
Move raw material tracking from order-level to order-item-level. Each order item gets its own raw material timeline (text + images with version history). The order creation form stays clean — raw materials are entered/updated afterward via a drawer. The existing order-level `RawMaterialsDrawer` is replaced by an item-aware version.

## Database Changes

### Migration: Add `order_item_id` column to `raw_material_versions`
```sql
ALTER TABLE public.raw_material_versions 
  ADD COLUMN order_item_id uuid;
```
Existing rows keep `order_item_id = NULL` (legacy order-level entries). New entries will always have an `order_item_id`.

No new tables needed — reusing the existing `raw_material_versions` table with an additional column.

## Frontend Changes

### 1. New Component: `RawMaterialsItemDrawer`
A new drawer that replaces the current `RawMaterialsDrawer`. It shows:
- A **list of all order items** (product name + size) as tabs or an accordion on the left/top
- Selecting an item shows its raw material timeline (same timeline UI as current drawer)
- Admin can post new versions per item (text + images)
- An **"All Items"** summary view that aggregates all item timelines in read-only mode

This keeps the familiar timeline pattern but scoped per item.

### 2. Update `OrderDetail.tsx`
- Replace `RawMaterialsDrawer` with `RawMaterialsItemDrawer`
- Pass `orderItems` (with product name, size, id) to the new drawer
- Remove order-level raw materials references

### 3. Update `OrderCreate.tsx`
- Remove the raw materials textarea + image upload from the creation form (since entry happens after creation via the drawer)
- Remove `rawMaterials` and `rawMaterialImages` state
- Remove the `raw_material_versions` insert during order creation
- Clean up the Zod schema (remove `raw_materials` field)

### 4. Remove old `RawMaterialsDrawer`
- Delete `src/components/RawMaterialsDrawer.tsx` (replaced by the new item-aware drawer)

### 5. Translations
- Add keys for item-level raw materials labels

## UX Design

The new drawer layout:

```text
┌─────────────────────────────────────────┐
│  Raw Materials - ORD-00123              │
├─────────────────────────────────────────┤
│  [All Items] [Product A - S] [Product B]│  ← tab bar (scrollable)
├─────────────────────────────────────────┤
│                                         │
│  ┌─ Post new version ────────────────┐  │
│  │ [textarea]                        │  │
│  │ [+ images]           [Post]       │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Timeline:                              │
│  ○ User A · Apr 5 at 2pm               │
│  │ "Updated fabric details..."          │
│  │ [img] [img]                          │
│  │                                      │
│  ○ User B · Apr 3 at 10am              │
│  │ "Initial material specs..."          │
│  └──────────────────────────────────────│
└─────────────────────────────────────────┘
```

- **"All Items" tab**: Read-only, shows all items' latest raw material info grouped by item (product + size), no post form
- **Individual item tabs**: Show that item's timeline + post form (admin only)
- Tab labels show product name + size (e.g., "Product A - L")
- If an item has raw material entries, its tab shows a small dot/indicator

## Migration of Existing Data
Legacy `raw_material_versions` rows (where `order_item_id IS NULL`) will still be visible in the "All Items" summary tab as "Order-level notes" so no data is lost.

## Files to Create/Edit
1. **Migration** — add `order_item_id` to `raw_material_versions`
2. **Create**: `src/components/RawMaterialsItemDrawer.tsx` — new per-item drawer
3. **Edit**: `src/pages/OrderDetail.tsx` — swap drawer, pass order items
4. **Edit**: `src/pages/OrderCreate.tsx` — remove raw materials section from form
5. **Delete**: `src/components/RawMaterialsDrawer.tsx` — replaced
6. **Edit**: `src/lib/translations.ts` — add new keys

