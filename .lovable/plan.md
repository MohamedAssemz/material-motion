

# Show all catalog products in Extra Inventory Analysis

## Why some products are missing

The analysis page currently hides any product where **both** `minimum_quantity = 0` **and** `available = 0`. The reasoning was "nothing to report", but it means catalog items you haven't set a minimum for never appear — even though you may want to see them.

## Fix

Remove the filter so **every catalog product** is listed. Each row still shows available, minimum, delta, and status:

- Products with `minimum = 0` are always **Healthy** (no threshold to breach).
- Sorting stays the same (`available − minimum` ascending), so critical items remain at the top and zero-minimum products naturally sink toward the bottom.
- The size-breakdown panel for products with no stock will display "No available stock" (existing translation key).

## Files

**Modified**
- `src/pages/ExtraInventoryAnalysis.tsx` — remove the `if (minimum <= 0 && available <= 0) continue;` skip so all products are included.

**No DB changes, no new translations.**

