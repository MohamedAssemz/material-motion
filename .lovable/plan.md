

## Phase 3a: Translate Dashboard, Order Detail, Warehouse, Extra Inventory

This phase replaces all hardcoded English strings in 4 pages with `t()` calls using the existing `useLanguage` hook, and adds ~60 new translation keys. Human-entered values (order names, product names, SKUs, customer names) stay as-is.

---

### Sub-part 1: Add missing translation keys to `src/lib/translations.ts`

New keys needed (not already in the file):

**Dashboard-specific:**
- `dashboard.factory_overview` — "Here's your factory overview"
- `dashboard.new_orders` / `dashboard.late_orders` / `dashboard.completed` / `dashboard.extra_inventory`
- `dashboard.with_late_batches` / `dashboard.available_items` / `dashboard.items_ready_shipment` / `dashboard.ready_to_kartona`
- `dashboard.production_pipeline` / `dashboard.item_distribution` / `dashboard.order_status_breakdown` / `dashboard.distribution_by_status`
- `dashboard.no_orders_yet` / `dashboard.orders_label` / `dashboard.most_completed_in`
- `dashboard.avg_finished_day` / `dashboard.items_per_day` / `dashboard.daily_average_in`
- `dashboard.most_used_machines` / `dashboard.by_production_records`
- `dashboard.no_completed_yet` / `dashboard.no_machine_activity`
- `dashboard.production_queues` / `dashboard.waiting` / `dashboard.ready` / `dashboard.alerts_attention` / `dashboard.items_needing_attention`
- `dashboard.all_clear` / `dashboard.no_alerts_desc` / `dashboard.late` / `dashboard.stalled` / `dashboard.approaching_deadline`
- `dashboard.overdue` / `dashboard.no_updates_for` / `dashboard.due` / `dashboard.last_30_days` / `dashboard.view`
- `dashboard.items_processed_per_phase` / `dashboard.no_production_recorded`

**Order Detail-specific:**
- `orders.total_items` / `orders.shipped` / `orders.added_to_extra` / `orders.shipping` / `orders.eft`
- `orders.not_set` / `orders.production_timeline` / `orders.start_to_track` / `orders.track_progress`
- `orders.timeline_inactive` / `orders.click_start` / `orders.items_planned`
- `orders.waiting` / `orders.in_progress_label` / `orders.processed` / `orders.retrieved` / `orders.added_to_extra_label` / `orders.extra_to_retrieve` / `orders.completed_label`
- `orders.available_extra` / `orders.view_shipments` / `orders.items_shipped`
- `orders.order_items` / `orders.products_in_order` / `orders.packing` / `orders.boxing_col` / `orders.progress`
- `orders.go_back` / `orders.cancel_confirm_desc` / `orders.high_priority` / `orders.no_customer`
- `orders.no_packaging_ref`

**Warehouse-specific:**
- `warehouse.box_management` / `warehouse.manage_desc` / `warehouse.scan`
- `warehouse.print_labels` / `warehouse.create_order_boxes` / `warehouse.create_extra_boxes`
- `warehouse.num_boxes` / `warehouse.box_auto_gen` / `warehouse.ebox_auto_gen`
- `warehouse.empty_boxes` / `warehouse.occupied_boxes` / `warehouse.inactive_boxes`
- `warehouse.no_order_boxes` / `warehouse.create_to_start` / `warehouse.no_extra_boxes` / `warehouse.create_extra_to_start` / `warehouse.no_filter_match`
- `warehouse.all_statuses` / `warehouse.empty` / `warehouse.occupied` / `warehouse.any_batches` / `warehouse.any_qty`
- `warehouse.from` / `warehouse.to` / `warehouse.pick_date`
- `warehouse.batches` / `warehouse.total_qty`

**Extra Inventory-specific:**
- `extra.batch_tracking` / `extra.add_batch` / `extra.create_batch`
- `extra.select_product` / `extra.current_state` / `extra.state_desc`
- `extra.select_ebox` / `extra.only_matching_state` / `extra.creating`
- `extra.available_units` / `extra.available_batches` / `extra.reserved_count`
- `extra.search_product_sku` / `extra.all_states` / `extra.all_statuses`
- `extra.extra_batches` / `extra.no_batches` / `extra.create_when_overproduction` / `extra.no_filter_match`
- `extra.assign` / `extra.assign_box` / `extra.delete_batch` / `extra.delete_confirm` / `extra.reserved_release`

---

### Sub-part 2: Translate `src/pages/Dashboard.tsx`

- Import `useLanguage` and call `const { t } = useLanguage()`
- Replace `PHASE_LABELS` values with `t('state.*')` calls (build dynamically)
- Replace `ORDER_STATUS_LABELS` values with `t('status.*')` calls
- Replace `TIME_RANGE_LABELS` with `t()` calls
- Replace `getGreeting()` to use `t('dashboard.good_morning')` etc.
- Replace all hardcoded text in JSX: KPI labels, card titles, descriptions, queue names, alert section headers, empty states
- Keep user-entered data (profile name, order numbers, product names, machine names) untranslated

---

### Sub-part 3: Translate `src/pages/OrderDetail.tsx`

- Import `useLanguage`, use `t()` for all UI labels
- Translate: header buttons ("Start Order", "Print", "Notes", "Cancel Order"), dropdown items ("Raw Materials", "Packaging Reference", "Comments")
- Translate: summary cards ("Total Items", "Shipped", "Added to Extra", "Shipping", "EFT"), shipping types ("International", "Domestic")
- Translate: production timeline card labels ("Manufacturing", "Finishing", etc.), stat labels ("Waiting", "In Progress", "Processed", "Completed", etc.)
- Translate: extra inventory section, shipments section, order items table headers ("Product", "SKU", "Quantity", "Packing", "Boxing", "Progress")
- Translate: cancel dialog text, timeline inactive state text
- Keep: order_number, customer name, product names, SKUs, dates as-is

---

### Sub-part 4: Translate `src/pages/Boxes.tsx`

- Import `useLanguage`, use `t()` for all UI text
- Translate: page header ("Box Management", subtitle), tab labels ("Order Boxes", "Extra Boxes")
- Translate: buttons ("Create Order Boxes", "Print Labels", "Scan", "Create Extra Boxes")
- Translate: dialog titles and form labels ("Number of boxes to create", "Box codes will be auto-generated")
- Translate: stats cards ("Empty Boxes", "Occupied Boxes", "Inactive Boxes")
- Translate: table headers ("Box Code", "Status", "Batches", "Total Qty", "Created", "Active")
- Translate: filter labels ("All Statuses", "Empty", "Occupied", "Inactive", "Any Batches", "Any Qty", "From:", "To:", "Pick date")
- Translate: empty states ("No order boxes created yet", "No boxes match the current filters")
- Translate: toast messages
- Keep: box codes (BOX-0001), dates as-is

---

### Sub-part 5: Translate `src/pages/ExtraInventory.tsx`

- Import `useLanguage`, use `t()` for all UI text
- Translate: header ("Extra Inventory", "Batch-based surplus inventory tracking"), "Add Extra Batch" button
- Translate: create dialog ("Create Extra Inventory Batch", form labels, state options)
- Translate: stats cards ("Available Units", "Available Batches", "Reserved")
- Translate: filter labels ("Search by product name or SKU...", "All States", state labels, "All Statuses", "Available", "Reserved")
- Translate: table headers ("Product", "Quantity", "Current State", "Status", "Box", "Created")
- Translate: empty states, delete dialog, "Assign" button
- Keep: product names, SKUs, box codes, batch codes as-is

---

### Files changed
1. `src/lib/translations.ts` — ~60 new keys
2. `src/pages/Dashboard.tsx` — all hardcoded strings → `t()` calls
3. `src/pages/OrderDetail.tsx` — all hardcoded strings → `t()` calls
4. `src/pages/Boxes.tsx` — all hardcoded strings → `t()` calls
5. `src/pages/ExtraInventory.tsx` — all hardcoded strings → `t()` calls

