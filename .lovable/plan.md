

## New "Catalog Insights" Tab in Reports

### Overview
Add a 5th tab to the Reports page called "Catalog Insights" that provides product/customer/country-level analytics derived from orders and order items data.

### Data Requirements
The tab needs data already partially fetched in Reports.tsx, plus additional fields:
- **orders**: need `customer_id` and `created_at` (add `customer_id` to the existing query)
- **order_items**: need `quantity` (add to existing query)
- **customers**: new fetch for `id, name, code, country`
- **products**: already fetched (`id, name`)

All filtering and aggregation will be client-side using `useMemo`.

### Duration Filter
A dropdown (Select) at the top with preset options:
- **Last Month** (default)
- Last 3 Months
- Last 6 Months
- Last Year
- Custom Date (shows From/To date pickers when selected)

### Dashboard Sections

**1. KPI Summary Cards (top row)**
- Total Products Ordered (unique product count in period)
- Total Units Ordered (sum of order_items.quantity in period)
- Unique Customers
- Unique Countries

**2. Top Selling Products (bar chart + ranked table)**
- Horizontal bar chart of top 10 products by total quantity ordered
- Below it, a scrollable ranked list showing product name, total quantity, and number of orders

**3. Top Ordering Countries (with flags)**
- Ranked cards/rows, each showing:
  - Country flag emoji + country name (from `customers.country` using `getCountryByCode`/`getCountryByName`)
  - Total quantity ordered from that country
  - Number of orders
  - Expandable/collapsible section listing the products ordered per country with quantities
- Uses the existing `countries.ts` helpers for flag display

**4. Top Ordering Customers**
- Ranked cards/rows showing:
  - Customer name and code
  - Total quantity ordered
  - Number of orders
  - Expandable section listing products ordered by that customer with quantities

### Technical Details

**Files to modify:**
- `src/pages/Reports.tsx`: 
  - Add `customer_id` to orders query, `quantity` to order_items query
  - Add new fetch for `customers` table
  - Add 5th tab trigger and content
  - Update `grid-cols-4` to `grid-cols-5`
  
**Files to create:**
- `src/components/reports/CatalogInsightsTab.tsx`: New component receiving `orders`, `orderItems`, `products`, `customers` as props. Contains:
  - Duration filter state + date range logic
  - `useMemo` computations for top products, top countries, top customers
  - Recharts bar chart for top products
  - Collapsible sections (using Radix Collapsible or manual toggle) for country/customer product breakdowns
  - Country flags via `getCountryByCode` / `getCountryByName` from `src/lib/countries.ts`

**No database changes needed.** All data is derived from existing tables via client-side joins on `order_id`, `product_id`, and `customer_id`.

