

# Production Forms Generator — Replace Exports Tab

Replace the 3 placeholder cards in the Exports tab with **6 production-form generators** that mirror the uploaded Miracle Medical Industries paper templates pixel-for-pixel as printable PDFs.

## 1. UI — `ExportsTab.tsx` rewrite

Six cards in a responsive grid, each opens a modal selector → generates a PDF download. Cards:

| # | Title (EN/AR) | Trigger inputs | Data source |
|---|---|---|---|
| 01 | Weekly Production Plan / خطة الإنتاج الأسبوعية | Date range (week from→to) | `order_batches` grouped by product, day-of-week machine-assigned counts |
| 02 | Production Order Form / امر الإنتاج | Pick an order | `orders` + `order_items` (product name, qty, remarks=size/special) |
| 04 | Accepted Items Identification Tag / علامة تعريف المنتجات المقبولة | Pick a box (BOX-XXXX) | `boxes.items_list` + parent `order` (work order, delivery date) |
| 05 | Hold Items Identification Tag / بطاقة تعريف المنتجات المحجوزة | Pick order + product, free-text reason + extra info | Manual fill (user-typed) + product/order metadata |
| 06 | Delivery Order / امر التوصيل | Pick a shipment (SHP-XXXX) | `shipments` + linked `order_batches` → product description, lot (qr_code), unit, qty |
| 07 | Release Order Form / طلب الإصدار | Pick an order or shipment | `order_batches` rows (description, unit, qty, lot, notes) |

Each card: icon + bilingual title + 1-line description + "Generate" button. Removed: Orders Export / Production Report / Inventory Snapshot placeholders.

## 2. Modals — one per report

Reusable shadcn `Dialog`. Inputs vary:
- **Date range**: shadcn `Calendar` popover (from + to, defaults to current week Sat→Thu).
- **Order picker**: searchable combobox listing `ORD-XXXXX — customer name`.
- **Box picker**: searchable combobox listing active `BOX-XXXX` codes with product preview.
- **Shipment picker**: searchable combobox listing `SHP-XXXX` with order number.
- **Hold Tag** modal extends the order picker with: product select (from order_items), `Reason` select (Under Inspection / Under Repair / Rejected), `Additional Information` textarea.

Each modal has a "Generate PDF" button → fetches the data → passes to the PDF generator → downloads file named `<report-code>_<reference>_<YYYYMMDD>.pdf` (e.g. `02_PO_ORD-00042_20260420.pdf`).

## 3. PDF generator — `src/lib/productionFormsPdf.ts`

Use **jsPDF + jspdf-autotable** (lightweight, already common; install if missing). One file exporting six functions:

```ts
generateWeeklyProductionPlanPDF(data)
generateProductionOrderPDF(data)
generateAcceptedItemsTagPDF(data)
generateHoldItemsTagPDF(data)
generateDeliveryOrderPDF(data)
generateReleaseOrderPDF(data)
```

Shared helpers:
- `drawHeader(doc)` — Miracle logo (left, ~30mm wide) + "Miracle Medical Industries" title in a bordered cell.
- `drawFooter(doc, refNo, revNo)` — bottom-left bordered table `Ref. no. | Page 1 of 1 | Rev. no.` matching uploaded forms (`02/01/01/01` … `02/01/01/07`).
- Bilingual labels: every label rendered as `English العربية` pairs using a font that supports Arabic. Use **Amiri** (Google Font, free, Arabic-friendly) loaded via `doc.addFont` from a base64 `.ttf` placed in `src/assets/fonts/`. Fall back to Helvetica for Latin.
- Page size: A4 portrait, 15mm margins, matching paper proportions.

**Logo asset**: copy the existing Miracle logo from the uploaded PDFs (`page_1_image_1_v2.jpg`) into `src/assets/miracle-logo.png` and embed as base64.

Each generator builds a layout that visually matches its source PDF (table positions, signature lines, headings). Tables built with `autoTable` for clean borders matching the templates.

## 4. Data fetchers

Each modal's "Generate" handler calls a small fetcher that returns the typed payload:

- **Weekly plan**: `order_batches` with `production_date` BETWEEN week range → group by `product_id` → for each product, sum quantities per weekday column. Include `order.order_number` as Work Order No.
- **Production order**: `orders.order_number` + joined `order_items(product, quantity, size, is_special, initial_state)`. Remarks = special tag / size.
- **Accepted Tag**: `boxes` row → `items_list` (already a JSON summary) → take linked order via batches in box → fill product name, work order, delivery date (`orders.estimated_fulfillment_time`), quantity, source = "Production", lot = `box_code`.
- **Hold Tag**: pure form input + `orders` + `products` lookup; nothing persisted (no DB write).
- **Delivery order**: `shipments` row + `order_batches` where `shipment_id = X` joined to `products` → table rows: description, lot=`qr_code_data`, unit="pcs", quantity, total. Header: invoice no = `shipment_code`, To = customer, Delivery Location = `orders.country`.
- **Release order**: `order_batches` for selected order → rows: description, unit, quantity, lot, notes (state).

## 5. Translations

Add to `src/lib/translations.ts`:
- `reports.forms.weekly_plan`, `reports.forms.production_order`, `reports.forms.accepted_tag`, `reports.forms.hold_tag`, `reports.forms.delivery_order`, `reports.forms.release_order` (EN + AR).
- Modal labels: pick order, pick box, pick shipment, date from/to, reason, additional info, generate, cancel.

## 6. Audit

Each successful PDF generation fires `logAudit({ action: "report.generated", entity_type: "report", entity_id: reportCode, module: "reports", order_id?, metadata: { report: "production_order", reference: "ORD-00042" } })` so report exports show up in the global audit log and (when `order_id` is set) the order's Timeline Logs drawer.

## 7. Files

**New**
- `src/components/reports/forms/WeeklyPlanDialog.tsx`
- `src/components/reports/forms/ProductionOrderDialog.tsx`
- `src/components/reports/forms/AcceptedTagDialog.tsx`
- `src/components/reports/forms/HoldTagDialog.tsx`
- `src/components/reports/forms/DeliveryOrderDialog.tsx`
- `src/components/reports/forms/ReleaseOrderDialog.tsx`
- `src/lib/productionFormsPdf.ts` (six generators + shared header/footer/logo helpers)
- `src/assets/miracle-logo.png` (extracted from uploaded PDFs)
- `src/assets/fonts/Amiri-Regular.ttf` (Arabic-capable font, base64-loaded)

**Modified**
- `src/components/reports/ExportsTab.tsx` — replace 3 placeholder cards with 6 active generator cards.
- `src/lib/translations.ts` — add form titles, modal labels, button strings.
- `package.json` — add `jspdf` + `jspdf-autotable` if not already present.

## Technical notes

- All forms render in **portrait A4**; bilingual labels use right-to-left text via `doc.text(arabic, x, y, { align: "right" })` while English stays left/center, mirroring the uploaded templates.
- Ref-no codes per template are hard-coded constants (`02/01/01/01` through `02/01/01/07`), Rev. no. constant `01`.
- The Weekly Plan's day columns map to Sat–Thu (Egyptian work week, matching the uploaded template).
- All fetchers cap rows reasonably (Weekly Plan: top 30 products in week; Delivery/Release: all batches in shipment/order — paginate to extra pages if >15 rows).
- No new DB tables or migrations needed.

