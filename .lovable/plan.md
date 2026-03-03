

## Standardize SKU Format

**Problem**: Bulk upload generates SKUs with `PRD-` prefix while manual product creation uses `SKU-` prefix. Both should use the same `SKU-` format.

**Change**: Update the `generateSKU` function in `src/components/catalog/BulkUploadDialog.tsx` (line 69-72) to use the `SKU-` prefix instead of `PRD-`, matching the format used in `ProductFormDialog.tsx`.

### Technical Details

**File: `src/components/catalog/BulkUploadDialog.tsx`**

Change the `generateSKU` function from:
```typescript
function generateSKU(index: number): string {
  const timestamp = Date.now();
  return `PRD-${timestamp}-${String(index).padStart(3, '0')}`;
}
```
To:
```typescript
function generateSKU(index: number): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  return `SKU-${timestamp}${String(index).padStart(3, '0')}`;
}
```

This aligns the bulk upload SKU format with the manual creation format (`SKU-<base36 timestamp>`), with an appended index to ensure uniqueness across rows in the same batch.

