

## Bulk Upload Products via CSV/Excel

### Overview
Add a "Bulk Upload" button to the Catalog page that opens a dialog where admins can:
1. Download an empty CSV template with the correct column headers
2. Fill in product data offline
3. Upload the completed file to create all products at once

### Template Columns
The CSV template will include these columns:
- `name` (required)
- `description`
- `size` (valid values: XXS, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL)
- `color`
- `brand` (brand name -- matched to existing brands)
- `country` (ISO code, e.g. US, GB)
- `needs_packing` (true/false, defaults to true)
- `categories` (comma-separated category names -- matched to existing categories)

SKU will be auto-generated for each product (same logic as the form dialog).

### Implementation

**New file: `src/components/catalog/BulkUploadDialog.tsx`**
- Dialog with two sections: Download Template and Upload File
- Download button generates a CSV with headers and an example row
- File input accepts `.csv` files
- On upload:
  - Parse CSV rows using basic string splitting (no extra library needed)
  - Validate required fields (name), validate size values against SIZE_OPTIONS
  - Match brand names to existing brands (case-insensitive); skip unmatched brands with a warning
  - Match category names to existing categories (case-insensitive)
  - Auto-generate SKUs using the same timestamp-based approach
  - Batch insert products into `products` table
  - For each product with categories, insert into `product_categories`
- Show a summary: X products created, Y warnings/skipped
- Call `onSuccess` to refresh the catalog

**Modified file: `src/pages/Catalog.tsx`**
- Import `BulkUploadDialog`
- Add state for `bulkUploadOpen`
- Add "Bulk Upload" button next to "Add Product" (admin only)
- Render the dialog

### CSV Parsing Approach
Use the built-in FileReader API to read the file as text, then parse CSV manually (split by newlines, then by commas with basic quote handling). This avoids adding a new dependency. For Excel support, we will only support CSV format but label the button clearly.

### Error Handling
- Rows missing a `name` are skipped with a warning
- Invalid size values are cleared (set to null)
- Unmatched brand/category names are noted in warnings
- Database errors are caught and displayed
- A results summary dialog shows successes and any issues

### Technical Details
- No new dependencies required
- No database changes required
- Products are inserted in a single batch call to the database
- Category associations are inserted after product creation
- The template download uses a Blob + anchor click approach

