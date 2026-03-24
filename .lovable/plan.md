

# Plan: Extra Inventory Commit Action

## What It Does

A "Commit" button on the Order Detail page that finalizes extra inventory usage:
1. **Retrieved items** — already consumed, no action needed
2. **Unretrieved reserved batches** — returned to AVAILABLE (unreserved)
3. **Unretrieved quantities** — new `order_batches` created in `in_manufacturing` state so they enter the production pipeline

## Example Flow
Order reserved 200 units across 4 phases. Managers retrieved 100 total. On commit:
- 100 unretrieved reserved extra batches → set back to AVAILABLE
- 100 new order_batches created in `in_manufacturing` for the same products/order_items

## Implementation

### 1. Database: Create RPC function `commit_extra_inventory`
A new migration with an RPC that atomically:
- Fetches all RESERVED extra_batches for the order
- Fetches CONSUMED history to calculate retrieved quantities per product/order_item
- For each reserved batch: unreserve it (set `inventory_state=AVAILABLE`, `order_id=null`, `order_item_id=null`)
- For unretrieved quantity per order_item: create `order_batches` in `in_manufacturing`
- Log `RELEASED` events in `extra_batch_history` for audit trail
- Returns summary of what was committed

### 2. UI: Add Commit button to OrderDetail.tsx
- Show a "Commit Extra Inventory" button in the order detail page (visible when order is `in_progress` and has reserved extra batches)
- Button opens an AlertDialog showing a summary: per-product breakdown of retrieved vs unretrieved quantities
- On confirm, calls the RPC and refreshes the page
- Admin-only action

### 3. Translations
- Add keys for commit button, dialog title/description, summary labels

### Files to modify
| File | Change |
|------|--------|
| New migration SQL | `commit_extra_inventory` RPC function |
| `src/pages/OrderDetail.tsx` | Add commit button + confirmation dialog with summary |
| `src/lib/translations.ts` | Add ~8 commit-related translation keys |

