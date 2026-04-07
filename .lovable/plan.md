

# Add Raw Materials Excel Export to Drawer

## Overview
Add an "Export" button in the Raw Materials drawer header that generates an XLSX file listing all order items with their raw material entries (text content, author, date, image URLs).

## Changes

### File: `src/components/RawMaterialsItemDrawer.tsx`
- Add a `Download` icon button next to the drawer title (or in the header area)
- On click, use the `xlsx` library (already available via the packing invoice generator) to build a workbook:
  - **Sheet: "Raw Materials"**
  - Columns: `Product Name`, `SKU`, `Size`, `Version #`, `Content`, `Images (URLs)`, `Updated By`, `Date`
  - One row per version entry, grouped by order item
  - Items with no entries get a single row with "No raw materials" in the Content column
- Download the file as `Raw Materials - {orderNumber}.xlsx`

### Dependencies
- Uses `exceljs` (already in project from `packingInvoiceGenerator.ts`)

### No database or schema changes needed — purely frontend export of already-fetched data.

