

# Fix: Commit Extra Inventory Double-Counting Bug

## Problem
When 75 items are reserved and 50 retrieved, the consumption process reduces `extra_batches.quantity` from 75 to 25. At commit time, both the UI and RPC calculate:
- `reserved` = 25 (current batch quantity)
- `consumed` = 50 (from history)
- `unretrieved` = max(0, 25 - 50) = **0** ← wrong

The correct unretrieved count is **25** — the current batch quantity itself.

## Fix

The display should show:
- **Originally reserved** = current quantity + consumed from history = 75
- **Retrieved** = consumed from history = 50  
- **Unretrieved** = current batch quantity = 25

### 1. UI: Fix `prepareCommitSummary` in `OrderDetail.tsx`
Change the summary calculation:
- `reserved` = `g.reserved + consumed` (original reservation = what's left + what was consumed)
- `consumed` = from history (unchanged)
- `unretrieved` = `g.reserved` (current batch qty IS the unretrieved amount)

### 2. Database RPC: Fix `commit_extra_inventory`
Same logic fix:
- `v_unretrieved_qty` should equal `v_order_item.reserved_qty` (the current remaining quantity), not `reserved_qty - consumed_qty`
- The summary should report `original_reserved = reserved_qty + consumed_qty`

### Files to modify
| File | Change |
|------|--------|
| `src/pages/OrderDetail.tsx` | Fix `prepareCommitSummary` calculation (~3 lines) |
| New migration SQL | Update `commit_extra_inventory` RPC to fix unretrieved calculation |

