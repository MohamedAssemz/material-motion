

## Phase 3b: RTL Sidebar Fix + Translate Phase Pages, Analytics & Reports

This phase ensures the sidebar drawer slides from the right in Arabic mode, and translates all phase pages (Manufacturing/Finishing/Packaging/Boxing) plus Analytics and Reports.

---

### Part 1: RTL Sidebar Enhancement

**Issue**: The AppLayout sidebar already positions correctly via `isRTL ? "right-0" : "left-0"`, but the mobile slide animation needs adjustment.

**File**: `src/components/AppLayout.tsx`

Changes:
- Mobile overlay drawer should slide from right when `isRTL` is true
- Mobile close animation should respect RTL direction
- Current code already handles most RTL positioning, just verify animation direction

---

### Part 2: Add ~80 New Translation Keys

**File**: `src/lib/translations.ts`

New keys needed for phase pages and reports:

**Phase Page Common Keys:**
- `phase.back_to_queue` / `phase.view_order_details` / `phase.order_not_found`
- `phase.in_phase` / `phase.products` / `phase.total_items` / `phase.completed`
- `phase.receive` / `phase.process` / `phase.extra` / `phase.ready` / `phase.shipments`
- `phase.select_all` / `phase.deselect_all` / `phase.accept_boxes` / `phase.assign_to_box`
- `phase.select_items_first` / `phase.no_boxes_ready` / `phase.search_box_sku`
- `phase.cancelled_order_msg` / `phase.high_priority` / `phase.select_machine` / `phase.optional`
- `phase.items_assigned` / `phase.items_selected` / `phase.boxes_waiting`

**Manufacturing Phase:**
- `manufacturing.send_to_finishing` / `manufacturing.process_selected`

**Finishing Phase:**
- `finishing.ready_for_finishing` / `finishing.products_in_finishing` / `finishing.send_to_packaging`

**Packaging Phase:**
- `packaging.ready_for_packaging` / `packaging.products_in_packaging` / `packaging.send_to_boxing`

**Boxing Phase:**
- `boxing.ready_for_boxing` / `boxing.in_boxing` / `boxing.ready_for_shipment`
- `boxing.total_kartonas` / `boxing.total_shipped` / `boxing.create_kartona`
- `boxing.select_items_to_ship` / `boxing.export_csv` / `boxing.print_label` / `boxing.reprint_label`

**Analytics Keys:**
- `analytics.title` / `analytics.batch_tracking` / `analytics.avg_lead_time` / `analytics.late_batches`
- `analytics.items_by_state` / `analytics.current_distribution` / `analytics.machine_production_rate`
- `analytics.production_output` / `analytics.batch_eta_timeline` / `analytics.upcoming_deadlines`
- `analytics.no_batches_eta` / `analytics.no_machine_data` / `analytics.days_remaining` / `analytics.overdue`

**Reports Keys:**
- `reports.title` / `reports.operational_insights`
- `reports.order_performance` / `reports.production_flow` / `reports.machine_rate` / `reports.inventory_boxes` / `reports.catalog_insights`
- `reports.exports` / `reports.exports_coming_soon`
- `reports.units_per_machine` / `reports.daily_production_trend` / `reports.units_per_phase` / `reports.machine_leaderboard`
- `reports.total_units` / `reports.active_machines` / `reports.all_types` / `reports.machine_type`
- `reports.created_vs_shipped` / `reports.shipment_count` / `reports.avg_items_box` / `reports.extra_usage_phase`
- `reports.on_time_rate` / `reports.avg_lead_time` / `reports.top_products` / `reports.top_countries` / `reports.top_customers`

---

### Part 3: Translate Phase Pages

**Files to modify:**
1. `src/pages/OrderManufacturing.tsx`
2. `src/pages/OrderFinishing.tsx`  
3. `src/pages/OrderPackaging.tsx`
4. `src/pages/OrderBoxing.tsx`

Common pattern for each:
- Import `useLanguage` hook
- Replace hardcoded strings: header titles, button labels, tab names, stat card labels, dialog text, toast messages, empty states
- Keep: order_number, customer name, product names, SKUs, box codes as-is

---

### Part 4: Translate Queue Pages

**Files to modify:**
1. `src/pages/QueueManufacturing.tsx`
2. `src/pages/QueueFinishing.tsx`
3. `src/pages/QueuePackaging.tsx`
4. `src/pages/QueueBoxing.tsx`

Common pattern:
- Replace page titles, tab labels ("Active", "Completed"), table headers, empty states, badges
- Keep: order_number, dates, counts as-is

---

### Part 5: Translate Analytics & Reports

**Files to modify:**
1. `src/pages/Analytics.tsx`
2. `src/pages/Reports.tsx`
3. `src/components/reports/MachineProductionTab.tsx`
4. `src/components/reports/OrderPerformanceTab.tsx`
5. `src/components/reports/ProductionFlowTab.tsx`
6. `src/components/reports/InventoryBoxesTab.tsx`
7. `src/components/reports/CatalogInsightsTab.tsx`

Changes:
- Replace all chart titles, axis labels, legend text, KPI labels, filter labels
- Replace empty states and tooltips
- Keep: data values, dates, product/machine names as-is

---

### Files Changed
1. `src/components/AppLayout.tsx` — mobile RTL slide direction
2. `src/lib/translations.ts` — ~80 new keys
3. `src/pages/OrderManufacturing.tsx` — full translation
4. `src/pages/OrderFinishing.tsx` — full translation
5. `src/pages/OrderPackaging.tsx` — full translation
6. `src/pages/OrderBoxing.tsx` — full translation
7. `src/pages/QueueManufacturing.tsx` — full translation
8. `src/pages/QueueFinishing.tsx` — full translation
9. `src/pages/QueuePackaging.tsx` — full translation
10. `src/pages/QueueBoxing.tsx` — full translation
11. `src/pages/Analytics.tsx` — full translation
12. `src/pages/Reports.tsx` — full translation
13. `src/components/reports/MachineProductionTab.tsx` — full translation
14. `src/components/reports/OrderPerformanceTab.tsx` — full translation
15. `src/components/reports/ProductionFlowTab.tsx` — full translation
16. `src/components/reports/InventoryBoxesTab.tsx` — full translation
17. `src/components/reports/CatalogInsightsTab.tsx` — full translation

