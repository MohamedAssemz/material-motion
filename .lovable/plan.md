

# Two-part plan: deletion safety + Extra Inventory Analysis page

## Part 1 — Answer: Can deleting the order item break extra-inventory logic?

**Short answer: No, because the system already prevents that deletion.**

Walkthrough of your scenario (item qty = 100, 50 moved to extra, 50 still waiting in manufacturing):

- `EditOrderDialog.canDeleteItem` only enables delete when **all 100 units sit in waiting (eta IS NULL) manufacturing batches**. With 50 already moved to extra, `removable = 50 < originalQuantity = 100` → **the Delete button is disabled**.
- `revalidateConstraints` re-checks this server-side at save time, so a stale UI can't bypass it.
- This is by design: units in `extra_batches` are physically detached from the order. `commit_extra_inventory` and `extra_batch_history` rely on `order_items.id` and `deducted_to_extra` to reconcile reserved/consumed/released amounts. Deleting the order item would orphan those references and corrupt the extras' provenance and audit history.

**What the user CAN do** (already supported by the recently-shipped paperwork-reduction flow):
- Reduce the item's quantity from 100 → 50 (paperwork-only, decrements `deducted_to_extra`). This aligns ISO documents with the shipped reality, leaves the 50 extras safely in the pool, and preserves all audit links.
- Only when `deducted_to_extra` returns to 0 AND no batches exist outside "waiting manufacturing" can the item itself be deleted.

**Conclusion: no code change needed for Part 1.** The invariant is already enforced.

---

## Part 2 — Extra Inventory Analysis page

### Goal
A new page reachable from the Extra Inventory page via an **"Analysis"** button, showing per-product stock health vs. each product's `minimum_quantity`, sorted by the most critical first.

### Route & navigation
- New route: `/extra-inventory/analysis` registered in `src/App.tsx` (protected, same as the parent page).
- Add an **Analysis** button in the Extra Inventory header (next to the existing "Settings" button), navigating to the new page. Uses a `BarChart3` (or similar) Lucide icon.

### Data source

Single page-load fetch (no realtime needed, but we'll subscribe to `extra_batches` changes so the table refreshes if stock moves):

1. `products` → `id, sku, name_en, name_ar, minimum_quantity, sizes`.
2. `extra_batches` filtered to `inventory_state = 'AVAILABLE'` → `product_id, size, quantity`.
   - Only AVAILABLE batches count as "in stock". RESERVED batches are earmarked for an order and are NOT free inventory.
   - All four `current_state` values (`extra_manufacturing` / `_finishing` / `_packaging` / `_boxing`) are summed — they are all surplus stock regardless of which phase they sit in.

### Aggregation (client-side)

For each product:
- `available = Σ quantity of AVAILABLE extra_batches for that product` (across all sizes & phases).
- `sizeBreakdown = [{ size, quantity, percentageOfTotal }]` sorted by quantity desc. `size = null` is shown as "—" / "بدون مقاس".
- `minimum = product.minimum_quantity` (default 0 already in schema).
- `delta = available − minimum` (used for sorting; smaller/more-negative = more critical).
- `status` = one of:
  - **red** — `available <= minimum`
  - **yellow** — `minimum < available <= minimum * 1.10` (i.e., available is ≤ 10% above minimum)
  - **normal** — `available > minimum * 1.10`
  - Edge case: `minimum = 0` → product is always **normal** (no threshold to breach). Surfaced in the same table; `delta = available` so they sink to the bottom of the critical sort.

Products that have a `minimum_quantity > 0` but **zero** available batches are still shown (they are the most critical). Products with `minimum = 0` AND `available = 0` are hidden (nothing to report).

### UI / layout

Header bar mirrors the Extra Inventory page (back arrow → `/extra-inventory`, title, subtitle).

**Filters row** above the table:
- Search by product name / SKU.
- Status filter: All / Red / Yellow / Normal.

**Summary cards** (3 cards): count of products in each status (red, yellow, normal).

**Table** using shadcn `Table` with the following columns:
- **Expand chevron** (per row).
- **Product** — name (language-aware, per existing convention) + SKU subtitle.
- **Available** — total quantity, badge styled by status color.
- **Minimum** — `product.minimum_quantity`.
- **Delta** — `available − minimum`, signed, colored.
- **Status** — pill: Red / Yellow / Normal (translated).

Row background tint:
- Red: `bg-destructive/10` with `border-l-4 border-destructive`.
- Yellow: `bg-yellow-500/10` with `border-l-4 border-yellow-500`.
- Normal: default.

**Sort order**: ascending by `delta` (most critical first). Stable secondary sort by product name.

**Expanded row** (on chevron click):
- A nested mini-table showing each size with: size label, quantity, contribution % (of this product's available total), and a thin progress bar.
- If product has only one size or no size variants, just show "—" with the full quantity.

### Pagination
Reuse `TablePagination` (PAGE_SIZE = 15) — the analysis is product-scoped so the row count stays manageable.

### Permissions
Read-only, available to all authenticated users (RLS on `extra_batches` and `products` already allows SELECT for everyone).

### Translations (`src/lib/translations.ts`)
New keys (EN/AR) under an `extra_analysis.` namespace:
- `extra_analysis.title`, `extra_analysis.subtitle`, `extra_analysis.button`
- `extra_analysis.col.product`, `.col.available`, `.col.minimum`, `.col.delta`, `.col.status`
- `extra_analysis.status.red`, `.status.yellow`, `.status.normal`
- `extra_analysis.size_breakdown`, `extra_analysis.no_size`
- `extra_analysis.summary.critical`, `.summary.warning`, `.summary.healthy`
- `extra_analysis.empty_state`

### Files

**New**
- `src/pages/ExtraInventoryAnalysis.tsx` — full page (fetch, aggregate, filter, render).

**Modified**
- `src/App.tsx` — register `/extra-inventory/analysis` route.
- `src/pages/ExtraInventory.tsx` — add "Analysis" button in header beside "Settings".
- `src/lib/translations.ts` — add translation keys listed above.

**No DB migrations, no RPC changes, no schema changes.**

