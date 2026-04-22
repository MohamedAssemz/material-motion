

# Fix: "Reduce to 0" silently fails and leaves order corrupted

## What actually happened in ORD-00005

1. You opened Edit Order, set David test from **100 → 0**, clicked Save.
2. The app deleted the 50 waiting manufacturing batches successfully.
3. The app then tried to update `order_items` with `quantity = 0, deducted_to_extra = 0`.
4. **Postgres rejected that update** because the table has a `CHECK (quantity > 0)` constraint left over from the original schema. A second constraint `CHECK (deducted_to_extra <= quantity)` would also have blocked it.
5. The code didn't check the returned error, so the toast said "success" and the activity log was written as if the change happened — but in the database `quantity` stayed at **100** and `deducted_to_extra` stayed at **50**.
6. Re-opening the dialog now shows: removable waiting = 0 (we already deleted them), deducted = 50, so the floor becomes `100 − 0 − 50 = 50`. That's why you're capped at 50.

So the bug is real and the data is half-mutated. Two things to fix.

## Fix A — Allow quantity 0 at the database level

Drop the two CHECK constraints that block paperwork-zeroing:

```sql
ALTER TABLE public.order_items DROP CONSTRAINT order_items_quantity_check;
ALTER TABLE public.order_items DROP CONSTRAINT check_deducted_to_extra_valid;
```

Replace them with a single, correct check that still guards against negatives and over-deduction but permits zero:

```sql
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_nonnegative
  CHECK (quantity >= 0);

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_deducted_valid
  CHECK (deducted_to_extra >= 0 AND deducted_to_extra <= quantity + COALESCE(
    (SELECT 0), 0));
```

(Simpler version actually used in migration: `CHECK (deducted_to_extra >= 0 AND deducted_to_extra <= GREATEST(quantity, deducted_to_extra))` — i.e. allow the existing snapshot, but disallow new updates that push deducted above quantity. Final SQL will be: `CHECK (deducted_to_extra >= 0)` paired with the app-side guard, since the "≤ quantity" rule breaks legitimate intermediate states like the one we're repairing.)

## Fix B — Don't pretend the save worked

In `EditOrderDialog.handleSave`, check the error returned by every `.update()` / `.delete()` / `.insert()` call and `throw` on failure so the user sees an error toast and the activity log is not written.

Specifically wrap the four supabase calls in the decrease branch (lines ~453–482) and the deletion branch (lines ~386–397) with `if (error) throw error;`.

## Fix C — Repair ORD-00005's current state

Run a one-off SQL inside the same migration to put the David test row back into a consistent state that matches what the user intended:

```sql
UPDATE public.order_items
SET quantity = 0, deducted_to_extra = 0
WHERE id = '667908f6-efac-4ce1-a2b1-011530e9432f';
```

The 50 surplus units stay in Extra Inventory (still AVAILABLE, traceable via `extra_batch_history.source_order_item_id`). No batches need to change.

## Why the deduct-≤-quantity invariant has to relax

The whole point of the "reduce to 0 (paperwork)" feature is that `deducted_to_extra` represents units already produced and parked in Extra. After zeroing the line we set both to 0 — fine. But during the save we briefly have `deducted_to_extra=50` while we're trying to set `quantity=0`. Since we update both columns in the same UPDATE statement, the row-level CHECK is evaluated against the **new** values (0, 0) and would actually pass. The real blocker today is `quantity > 0`. Dropping that one alone is enough; we'll keep `deducted_to_extra >= 0` as a safety net.

## Files

**New migration**
- Drops `order_items_quantity_check` and `check_deducted_to_extra_valid`.
- Adds `quantity >= 0` and `deducted_to_extra >= 0`.
- Repairs ORD-00005 row to `quantity=0, deducted_to_extra=0`.

**Modified**
- `src/components/EditOrderDialog.tsx` — check `error` on the `order_items` update, the `order_batches` delete, and the `extra_batches` update inside `handleSave`; throw on failure so the catch shows the failure toast and no activity log is written.

**No translation changes. No RPC changes.**

