

## Catalog Management System (CMS) - Complete Redesign

### Overview

Redesigning the catalog to use a **flat product structure** where each product is an independent item with its own SKU. Products are grouped/organized through **Categories** and **Brands** instead of parent-child relationships. This simplifies the system while maintaining rich filtering and search capabilities.

---

### Current State vs New Design

| Aspect | Current | New |
|--------|---------|-----|
| Structure | Parent SKU + Child SKU variants | Single independent products |
| Grouping | Parent product → variants | Categories & Brands (tags) |
| Size/Color | Creates N variants per combination | Single product with 1 size + 1 color |
| Photos | Not implemented | Main photo + gallery |
| Filtering | Limited | Categories, Brands, Countries, Search |

---

### Database Schema Changes

#### New Tables to Create

**1. `categories` - Product categories for grouping**
```sql
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**2. `brands` - Brand management**
```sql
CREATE TABLE public.brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**3. `product_images` - Product photo gallery**
```sql
CREATE TABLE public.product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  is_main BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**4. `product_categories` - Junction table for product-category relationship**
```sql
CREATE TABLE public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(product_id, category_id)
);
```

#### Modify `products` Table

Add new columns to the existing products table:

```sql
ALTER TABLE public.products
  ADD COLUMN brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  ADD COLUMN size TEXT,           -- From fixed dropdown: XXS, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL
  ADD COLUMN color TEXT,
  ADD COLUMN country TEXT;        -- Target market/origin country
```

Drop unused columns (optional - can keep for backwards compatibility):
- `parent_product_id` - No longer needed
- `size_id` - Replaced by `size` text field
- `color_id` - Replaced by `color` text field

#### Storage Bucket for Product Images

```sql
-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true);

-- RLS Policy: Anyone can view images
CREATE POLICY "Public can view product images"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

-- RLS Policy: Only admins can upload/manage images
CREATE POLICY "Admins can manage product images"
ON storage.objects FOR ALL
USING (bucket_id = 'product-images' AND has_role(auth.uid(), 'admin'));
```

---

### Product Data Model

```text
Product (products table)
├── id (UUID)
├── sku (TEXT, unique, auto-generated)
├── name (TEXT)
├── description (TEXT)
├── size (TEXT) - dropdown: XXS, XS, S, M, L, XL, 2XL, 3XL, 4XL, 5XL, 6XL
├── color (TEXT) - free text
├── brand_id (UUID) → brands table
├── country (TEXT) - target market
├── needs_packing (BOOLEAN)
├── created_at (TIMESTAMPTZ)
│
├── Categories (many-to-many via product_categories)
├── Potential Customers (many-to-many via product_potential_customers)
└── Images (one-to-many via product_images)
```

---

### Size Dropdown Options

Fixed list for the size dropdown:
```typescript
const SIZE_OPTIONS = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL',
  '2XL', '3XL', '4XL', '5XL', '6XL'
] as const;
```

---

### UI Components

#### 1. Catalog Page (`/catalog`)

**Header Section:**
- Page title + description
- "Add Product" button (admin only)
- Search input (searches name, SKU, description)
- Filter dropdowns:
  - Category (multi-select)
  - Brand (multi-select)
  - Country (multi-select)
  - Size (multi-select)

**Product Grid:**
- Vertical product cards in a responsive grid
- Card shows: Main image, Name, SKU, Size, Color, Brand badge, Category badges
- Click card to view/edit details

**Product Card Layout:**
```text
┌─────────────────────────┐
│                         │
│       [Main Photo]      │
│         300x300         │
│                         │
├─────────────────────────┤
│ Product Name            │
│ SKU-0001                │
│ Size: M | Color: Blue   │
│ [Category] [Category]   │
│ Brand: BrandName        │
└─────────────────────────┘
```
When clicking on the card, it opens the details of this product with the remaining details and photos
#### 2. Add/Edit Product Dialog

**Form Fields:**
- Product Name (required)
- Description (textarea)
- Size (dropdown: XXS → 6XL)
- Color (text input)
- Brand (searchable dropdown from brands table)
- Country (dropdown or text input)
- Categories (multi-select checkboxes)
- Potential Customers (multi-select checkboxes - current implementation)
- Needs Packaging (toggle)
- Photos:
  - Main Photo upload (with preview)
  - Additional Photos upload (gallery with drag-to-reorder)

#### 3. Category Management Page (`/catalog/categories`)

- Simple CRUD table for categories
- Columns: Name, Description, Product Count, Actions
- Add/Edit dialog with name and description fields
- view the creation timestamp of the product

#### 4. Brand Management Page (`/catalog/brands`)

- Simple CRUD table for brands
- Columns: Logo, Name, Product Count, Actions
- Add/Edit dialog with name and optional logo upload

---

### File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/pages/Catalog.tsx` | **Rewrite** | Complete redesign with flat product structure, search, filters, product cards |
| `src/components/ProductCard.tsx` | **Create** | Vertical card component for product display |
| `src/components/ProductFormDialog.tsx` | **Create** | Add/Edit product dialog with all fields and image upload |
| `src/components/ProductImageUpload.tsx` | **Create** | Image upload component with main photo + gallery |
| `src/pages/CatalogCategories.tsx` | **Create** | Category management page |
| `src/pages/CatalogBrands.tsx` | **Create** | Brand management page |
| `src/App.tsx` | **Modify** | Add routes for category/brand management |
| `src/components/AppLayout.tsx` | **Modify** | Add submenu items under Catalog (if applicable) |
| Migration file | **Create** | Database schema changes |

---

### Migration Strategy for Existing Data

Since the current system has parent-child products with variants:

1. **Keep existing `products` table records** - they already have SKUs
2. **Add new columns** to products table (brand_id, size, color, country)
3. **Migrate size/color data:**
   - For each product with `size_id`, copy the `size_name` to the new `size` column
   - For each product with `color_id`, copy the `color_name` to the new `color` column
4. **Migrate potential customers:**
   - Copy from `product_potential_customers` (parent_product_id) to use product_id directly
5. **Deprecate parent tables** (keep for reference but stop using):
   - `parent_products`
   - `product_sizes`
   - `product_colors`

---

### Search and Filter Implementation

**Search Query:**
```typescript
// Full-text search on name, SKU, description
const { data } = await supabase
  .from('products')
  .select(`
    *,
    brand:brands(id, name),
    categories:product_categories(category:categories(id, name)),
    images:product_images(id, image_url, is_main, sort_order),
    potential_customers:product_potential_customers(customer:customers(id, name, code, country))
  `)
  .ilike('name', `%${searchTerm}%`)
  .order('created_at', { ascending: false });
```

**Filter by Category:**
```typescript
// Using inner join to filter by category
const { data } = await supabase
  .from('products')
  .select('*, categories:product_categories!inner(category_id)')
  .in('categories.category_id', selectedCategoryIds);
```

---

### RLS Policies

**Categories:**
- SELECT: Authenticated users can view
- ALL: Admin only

**Brands:**
- SELECT: Authenticated users can view
- ALL: Admin only

**Product Images:**
- SELECT: Authenticated users can view
- ALL: Admin only

**Product Categories:**
- SELECT: Authenticated users can view
- ALL: Admin only

---

### Implementation Phases

**Phase 1: Database Setup**
- Create migration for new tables (categories, brands, product_images, product_categories)
- add the creation timestamp of the product
- Add new columns to products table
- Create storage bucket for images
- Set up RLS policies

**Phase 2: Category & Brand Management**
- Create CatalogCategories page
- Create CatalogBrands page
- Add routes and navigation

**Phase 3: Catalog Redesign**
- Create ProductCard component
- Create ProductFormDialog with image upload
- Rewrite Catalog page with search and filters

**Phase 4: Data Migration (if needed)**
- Script to migrate existing size/color data
- Update existing product records

---

### Summary

This redesign transforms the catalog from a complex parent-child variant system to a simple flat structure where:

- Each product is independent with its own SKU
- Products are grouped via Categories (many-to-many) and Brands (one-to-many)
- Size is a fixed dropdown (XXS to 6XL)
- Color is free text
- Multiple photos are supported with a main image designation
- Multiple potential customers can be assigned
- Rich filtering by category, brand, country, and full-text search

