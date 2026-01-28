

## Fix Public Box Lookup Page - RLS Policy Update

The `/box/:code` page is correctly routed as a public page (not wrapped in `ProtectedRoute`), but the database queries fail because the Row Level Security (RLS) policies on the underlying tables only allow authenticated users to read data.

---

### Root Cause

The following tables have RLS policies with `Permissive: No` that use the condition `true` for SELECT operations, but these policies are **RESTRICTIVE**, meaning they only allow access for authenticated users:

| Table | Current Policy |
|-------|---------------|
| `boxes` | "Authenticated users can view boxes" |
| `extra_boxes` | "Authenticated users can view extra boxes" |
| `shipments` | "Authenticated users can view shipments" |
| `order_batches` | "Authenticated users can view batches" |
| `extra_batches` | "Authenticated users can view extra batches" |
| `products` | "Authenticated users can view products" |

When an unauthenticated user (scanning QR with mobile) queries these tables, the policies block access and return empty results.

---

### Solution

Add **PERMISSIVE** policies that allow public/anonymous SELECT access to these tables. This will enable unauthenticated users to view box information while maintaining the existing authenticated user policies.

**Database Migration:**

```sql
-- Allow anonymous users to view boxes (for public box lookup)
CREATE POLICY "Public can view boxes"
  ON public.boxes FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view extra boxes
CREATE POLICY "Public can view extra boxes"
  ON public.extra_boxes FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view shipments  
CREATE POLICY "Public can view shipments"
  ON public.shipments FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view order batches
CREATE POLICY "Public can view order batches"
  ON public.order_batches FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view extra batches
CREATE POLICY "Public can view extra batches"
  ON public.extra_batches FOR SELECT
  TO anon
  USING (true);

-- Allow anonymous users to view products
CREATE POLICY "Public can view products"
  ON public.products FOR SELECT
  TO anon
  USING (true);
```

---

### Security Considerations

This change is safe because:

1. **Read-only access**: Only SELECT operations are allowed for anonymous users
2. **No sensitive data exposed**: Box contents show product names, SKUs, and quantities - all non-sensitive operational data
3. **No write access**: Anonymous users cannot modify any data
4. **Existing policies preserved**: Authenticated user policies remain intact for full system functionality

The public lookup page intentionally provides view-only information to anyone who scans a QR code on a physical box, which is the desired behavior for factory floor operations.

---

### Files to Modify

**Database Migration only** - No code changes needed since `BoxLookup.tsx` is already correctly implemented as a public page.

---

### Additional Note

The same fix should be applied to support the `BatchLookup.tsx` page (`/batch/:code`) which has the same issue. If batch lookup should also be public, the `order_batches`, `orders`, `products`, and `units` tables would need similar anonymous SELECT policies.

