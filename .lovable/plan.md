

# Global Audit Logs System

## Overview
Add a project-wide `audit_logs` table that captures every meaningful write across modules, plus a reusable `logAudit()` helper, integration calls at all key write points, and a "Timeline Logs" drawer launched from the Production Timeline card on the Order Details page.

The existing `order_activity_logs` table keeps working for the order-scoped activity card; `audit_logs` is the new global, cross-module trail (orders, batches, boxes, shipments, extra inventory, users, catalog, machines, etc.).

## 1. Database — new `audit_logs` table

Columns:
- `id` uuid PK, default `gen_random_uuid()`
- `created_at` timestamptz default `now()`
- `user_id` uuid (nullable — system actions)
- `user_name` text (denormalized snapshot for fast display)
- `user_email` text (snapshot)
- `action` text NOT NULL — short slug, e.g. `order.created`, `batch.assigned_to_box`, `shipment.sealed`
- `entity_type` text NOT NULL — `order` | `order_item` | `batch` | `extra_batch` | `box` | `extra_box` | `shipment` | `user` | `product` | `machine`
- `entity_id` text — UUID or code of the affected entity
- `module` text NOT NULL — `orders` | `manufacturing` | `finishing` | `packaging` | `boxing` | `shipments` | `extra_inventory` | `boxes` | `catalog` | `admin`
- `order_id` uuid (nullable, indexed) — fast lookup for the order timeline drawer
- `metadata` jsonb default `'{}'`

Indexes: `(order_id, created_at desc)`, `(entity_type, entity_id)`, `(created_at desc)`, `(module, created_at desc)`.

RLS:
- SELECT: any authenticated user (true) — matches existing `order_activity_logs` pattern.
- INSERT: admin OR any phase manager (matches existing log policies).
- No UPDATE / DELETE policies → immutable.

## 2. Helper — `src/lib/auditLog.ts`

```ts
type AuditEntry = {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  module: string;
  order_id?: string | null;
  metadata?: Record<string, any>;
};

export async function logAudit(entry: AuditEntry): Promise<void>
```

Behavior:
- Resolves `user_id`/`user_name`/`user_email` from `supabase.auth.getUser()` + cached profile (in-memory cache to avoid extra queries).
- Fire-and-forget: wraps insert in try/catch, never throws, never awaits-block the caller's UI.
- Exported convenience: `logAuditBatch(entries: AuditEntry[])` for bulk operations.

## 3. Integration points (call sites)

Add `logAudit(...)` calls (non-blocking) at these existing write sites — no logic changes, just one extra line each:

| Module | File | Action slug |
|---|---|---|
| Orders | `OrderCreate.tsx` | `order.created` |
| Orders | `StartOrderDialog.tsx` | `order.started` |
| Orders | `EditOrderDialog.tsx` | `order.edited` (with item-level changes in metadata) |
| Orders | `OrderDetail.tsx` (cancel) | `order.cancelled` |
| Orders | `OrderDetail.tsx` (commit extra) | `extra_inventory.committed` |
| Manufacturing | `OrderManufacturing.tsx` | `batch.start_working`, `batch.assigned_to_box`, `batch.moved_to_extra` |
| Finishing | `OrderFinishing.tsx` | `batch.received`, `batch.assigned_to_box`, `batch.moved_to_next`, `batch.moved_to_extra` |
| Packaging | `OrderPackaging.tsx` | same pattern |
| Boxing | `OrderBoxing.tsx` | `batch.received`, `batch.moved_to_ready_for_shipment`, `batch.moved_to_extra` |
| Shipments | `ShipmentDialog.tsx` | `shipment.created` |
| Boxing | `OrderBoxing.tsx` (create cartona) | `shipment.created` (+ reprint = `shipment.reprinted`) |
| Extra inventory | `ExtraInventoryDialog.tsx` | `extra_inventory.reserved` |
| Extra inventory | `ExtraItemsTab.tsx` | `extra_inventory.injected`, `extra_inventory.assigned_to_box`, `extra_inventory.moved_directly` |
| Extra inventory | `ExtraInventory.tsx` | `extra_batch.created`, `extra_batch.assigned_to_box`, `extra_batch.deleted`, `extra_batch.force_unreserved` |
| Boxes | `Boxes.tsx` / box utilities | `box.created`, `box.force_emptied`, `box.deleted` |
| Machine assign | `ProductionRateSection.tsx` | `batch.machine_assigned` |
| Admin | `Admin.tsx`, `CreateUserDialog.tsx`, `EditUserDialog.tsx`, `DeleteUserDialog.tsx` | `user.created`, `user.role_changed`, `user.deleted` |
| Catalog | `ProductFormDialog.tsx`, `BulkUploadDialog.tsx` | `product.created`, `product.updated`, `product.deleted`, `product.bulk_uploaded` |

Each call passes `order_id` when applicable so the order drawer can filter cleanly.

Metadata examples:
- `batch.assigned_to_box`: `{ box_code, product_id, product_name, quantity, from_state, to_state }`
- `shipment.created`: `{ shipment_code, total_units, item_count }`
- `extra_inventory.reserved`: `{ total_reserved, by_product: [...] }`
- `order.edited`: reuse the `changes[]` array already built in `EditOrderDialog`

## 4. UI — Timeline Logs drawer

**New file:** `src/components/OrderTimelineLogsDrawer.tsx`
- Uses existing `Sheet` component (right-side, RTL-aware).
- Props: `{ open, onOpenChange, orderId }`.
- Fetches `audit_logs` filtered by `order_id`, sorted `created_at desc`.
- Renders a vertical timeline (icon circle + connecting line, same visual language as `OrderActivityLog.tsx`).
- Each entry shows:
  - Icon + colored dot keyed by `module`
  - Action label (human-readable map: `batch.assigned_to_box` → "Assigned to box BOX-0042")
  - `by {user_name} · {relative time}` with absolute timestamp tooltip
  - Module badge
  - Expandable metadata block (collapsed by default) showing key/value pairs
- Real-time: subscribe to `postgres_changes` on `audit_logs` filtered by `order_id` to append new entries live.
- Search/filter bar: free-text + module multi-select chips.

**Trigger button:** In `src/pages/OrderDetail.tsx`, add a "Timeline Logs" button (with `History` icon from lucide-react) at the top-right of the Production Timeline card header. Bilingual via `t('timeline.logs')`.

**Translations** (`src/lib/translations.ts`): add `timeline.logs` ("Timeline Logs" / "سجل الأحداث") and action label keys.

## 5. Constraints respected

- **Never blocks**: `logAudit` is fire-and-forget (`.then().catch()`, not awaited in critical paths).
- **No flow changes**: only additive calls; existing `order_activity_logs` writes remain untouched.
- **Lightweight**: single insert per action, indexed lookups, RLS leverages existing `has_role` function (no recursion).
- **Immutable**: no UPDATE/DELETE RLS → tamper-resistant audit trail.

## Technical details (for reference)

- Order drawer query: `select * from audit_logs where order_id = $1 order by created_at desc limit 200` (paginated "Load more" beyond 200).
- User snapshot fields denormalized so deleted/renamed users still display correctly historically.
- Action slug convention: `<entity>.<verb_past>` — easy to grep, easy to map to icons/labels.
- Realtime channel name: `audit-logs-${orderId}` to avoid cross-order noise.
- A future global `/audit` admin page can reuse the same drawer component — out of scope for this task but the schema supports it.

