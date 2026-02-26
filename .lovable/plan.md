

## Search, Filter, and Table Redesign for Extra Inventory and Box Management

### 1. Extra Inventory Page (`src/pages/ExtraInventory.tsx`)

**Search and Filter Bar** (added above the batches table):
- Text search input: filters by product name or SKU (client-side)
- State filter dropdown: "All States", "Extra Manufacturing", "Extra Finishing", "Extra Packaging", "Extra Boxing"
- Status filter dropdown: "All", "Available", "Reserved"
- Product filter dropdown: filter by specific product

**Table Redesign**:
- Remove the "QR Code" column
- Keep columns: Product (name + SKU), Quantity, Current State (badge), Status (badge), Box (code or assign button), Created
- Replace the non-functional "Print" action button with a row-click to open a detail/action popover or just remove the actions column entirely -- the "Assign EBox" action already exists inline in the Box column
- Filtered results respect pagination (reset to page 1 on filter change)

**Filtering Logic**:
- All filtering is client-side using `useMemo` over the `batches` array
- Search matches against `product.name` or `product.sku` (case-insensitive)
- State and status filters use exact match
- Pagination resets to page 1 when any filter changes

### 2. Box Management Page (`src/pages/Boxes.tsx`)

**Search and Filter Bar** (added inside each tab, above the stats cards or between stats and table):
- Text search input: filters by box code (with auto BOX-/EBOX- prefix normalization)
- Status filter dropdown: "All", "Empty", "Occupied", "Inactive"
- Batch count filter: min/max inputs or a simple dropdown ("Any", "0", "1-5", "6-10", "10+")
- Quantity filter: min/max inputs or dropdown ("Any", "0", "1-10", "11-50", "50+")
- Date filter: date range picker (From/To) using existing Calendar/Popover pattern

**Filtering Logic**:
- Client-side filtering with `useMemo`
- Search normalizes input (prepends BOX-/EBOX- to pure numbers per existing convention)
- Status filter maps to: Empty = `batch_count === 0 && is_active`, Occupied = `batch_count > 0`, Inactive = `!is_active`
- Batch count and quantity use range matching
- Date filter uses `isWithinInterval` from date-fns
- Both order and extra tabs get independent filter state
- Pagination resets on filter change

### Technical Details

**Files to modify:**
- `src/pages/ExtraInventory.tsx`: Add filter state variables, search/filter UI row, update table columns, wrap batches in `useMemo` with filters, remove QR Code column and Actions column
- `src/pages/Boxes.tsx`: Add filter state variables per tab, search/filter UI row, wrap `orderBoxes`/`extraBoxes` in `useMemo` with filters

**No new dependencies or database changes needed.** All filtering is client-side on already-fetched data.

