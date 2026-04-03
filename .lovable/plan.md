

# Order Activity Log

## Overview
Add an audit trail system that records key actions taken on orders and displays them in a timeline below the order items table. Admins can see who did what and when.

## Database Changes

### New table: `order_activity_logs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| order_id | uuid | NOT NULL |
| action | text | NOT NULL (e.g. 'created', 'started', 'edited', 'cancelled', 'reserved_extra', 'committed_extra', 'shipment_created') |
| performed_by | uuid | NOT NULL |
| details | jsonb | nullable, stores action-specific metadata |
| created_at | timestamptz | default now() |

RLS: authenticated SELECT for all, INSERT for admin + phase managers.

### Actions to log (inserted from frontend code)
1. **Order Created** - in `OrderCreate.tsx` after insert
2. **Order Started** - in `StartOrderDialog.tsx` after status update
3. **Order Edited** - in `EditOrderDialog.tsx` after save (details: what changed)
4. **Order Cancelled** - in `OrderDetail.tsx` handleCancelOrder
5. **Extra Reserved** - in `ExtraInventoryDialog.tsx` after reservation
6. **Extra Committed** - in `OrderDetail.tsx` handleCommitExtra
7. **Shipment Created** - in `ShipmentDialog.tsx` after insert

## New Component: `OrderActivityLog`
- Placed below the Order Items table in `OrderDetail.tsx`
- Card with vertical timeline layout (similar to OrderCommentsDrawer style)
- Each entry shows: icon per action type, action label, performer name, timestamp
- Fetches from `order_activity_logs` joined with `profiles` for performer names
- Only visible to admins (`hasRole('admin')`)

## Files to Create/Edit
1. **Migration** - create `order_activity_logs` table with RLS
2. **New**: `src/components/OrderActivityLog.tsx` - timeline display component
3. **Edit**: `src/pages/OrderDetail.tsx` - add component below order items table
4. **Edit**: `src/pages/OrderCreate.tsx` - log 'created' action
5. **Edit**: `src/components/StartOrderDialog.tsx` - log 'started' action
6. **Edit**: `src/components/EditOrderDialog.tsx` - log 'edited' action
7. **Edit**: `src/pages/OrderDetail.tsx` - log 'cancelled' and 'committed_extra' actions
8. **Edit**: `src/components/ExtraInventoryDialog.tsx` - log 'reserved_extra' action
9. **Edit**: `src/components/ShipmentDialog.tsx` - log 'shipment_created' action

## Technical Details

### Timeline UI
```text
  [icon] Order Created
         by Ahmed Mohamed - 2 days ago
  |
  [icon] Order Started
         by Ahmed Mohamed - 1 day ago
  |
  [icon] Order Edited
         by Sarah Ali - 5 hours ago
         Changed: EFT updated, Item qty increased
  |
  [icon] Shipment Created (SHP-0012)
         by Hassan Mahmoud - 1 hour ago
```

### Log insertion pattern (added to each action handler)
```typescript
await supabase.from('order_activity_logs').insert({
  order_id: orderId,
  action: 'started',
  performed_by: user.id,
  details: { /* optional context */ }
});
```

