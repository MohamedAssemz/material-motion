

# Fix: Duplicate `move_order_batches_to_extra` function

## Problem
Two overloads of `public.move_order_batches_to_extra` exist in the database with identical parameter names/types but different declared parameter order. PostgREST cannot disambiguate them, so every "Move to Extra" call from Finishing (and the other phases) fails with `PGRST203`.

The two overloads are functionally identical — both insert into `extra_batches` and update `order_batches` — but only the newer one also propagates `size` from `order_items` into the new extra batch. The older overload (without `size`) is the leftover that needs to go.

## Fix

**Migration**: drop the older overload, keeping the size-aware one.

```sql
DROP FUNCTION IF EXISTS public.move_order_batches_to_extra(
  jsonb, uuid, text, uuid
);
-- Keep: public.move_order_batches_to_extra(text, jsonb, uuid, uuid)
-- (the size-aware version)
```

Both client call-sites (`MoveToExtraDialog.tsx`) already invoke via named parameters (`p_selections`, `p_target_box_id`, `p_phase`, `p_user_id`), so once the duplicate is removed PostgREST will resolve cleanly to the remaining function — no client changes needed.

## Files

**New**
- One Supabase migration dropping the duplicate function signature.

**Modified**
- None.

