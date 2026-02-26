

## Upgrade Bulk Upload Template to Excel with Dropdowns

### Overview
Replace the current CSV template with a proper Excel (.xlsx) file that includes dropdown validations for size, brand, and needs_packing columns. Remove the country and categories columns as requested.

### Template Structure
| Column | Type | Validation |
|--------|------|------------|
| name | Free text | Required |
| description | Free text | Optional |
| size | Dropdown | XXS, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL |
| color | Free text | Optional |
| brand | Dropdown | Populated from existing brands in the database |
| needs_packing | Dropdown | true, false |

### Changes

**1. Add `exceljs` dependency**
- Install `exceljs` library for creating and reading Excel files with data validation (dropdown lists)

**2. Update `src/components/catalog/BulkUploadDialog.tsx`**

Download template changes:
- Replace CSV generation with Excel workbook creation using `exceljs`
- Create a "Products" sheet with the 6 column headers (name, description, size, color, brand, needs_packing)
- Add data validation (dropdown lists) on the size column using SIZE_OPTIONS values
- Add data validation on the brand column using the current list of brand names passed as props
- Add data validation on needs_packing column with "true" / "false" options
- Style header row (bold, colored background) for clarity
- Set column widths for readability
- Add one example row
- Download as .xlsx file

Upload/parsing changes:
- Accept both `.csv` and `.xlsx` files in the file input
- For .xlsx files: use `exceljs` to read the workbook, iterate rows from the first sheet
- Remove all country and categories processing logic (no more `country` field in insert, no more `categoryIds` or `product_categories` inserts)
- Keep brand matching logic (case-insensitive name to ID lookup)
- Keep size validation against SIZE_OPTIONS

**3. Update `src/pages/Catalog.tsx`**
- Remove `categories` prop from `BulkUploadDialog` (no longer needed)

**4. Update `BulkUploadDialog` props**
- Remove `categories` from the interface since they are no longer used in bulk upload

### UI Text Updates
- Change "Download CSV Template" to "Download Excel Template"
- Change "Upload Completed CSV" to "Upload Completed File"
- Update description text to mention Excel format
- Update file accept to `.csv,.xlsx,.xls`

