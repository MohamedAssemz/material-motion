
## Root Cause

In the **Completed** tab of the Manufacturing phase, `ProductionRateSection` shows batches that have already advanced past manufacturing (they're now in `ready_for_packaging` state in the DB, with `box_id` set). When the user tries to assign a machine to a **partial** quantity (e.g. assigning 9 out of a batch of 10), the `assign_machine_to_batches` database function does a **split**:

1. Updates the existing batch → sets quantity to 9 + assigns machine ✅
2. **Inserts a new "remainder" batch** of 1 — but only inherits `current_state` (`ready_for_packaging`), **not `box_id`** ❌

The `check_batch_container_integrity` trigger then fires on that INSERT and raises:
> `"Order batches in state 'ready_for_packaging' must be assigned to a box"`

because `ready_for_packaging` is a transitioning state that requires `box_id` — but the remainder batch was created without one.

## Fix: One database migration

Update the `assign_machine_to_batches` function in two places:

**1. Add `box_id` to the cursor SELECT:**
```sql
SELECT id, quantity, order_id, product_id, order_item_id, current_state,
       created_by, eta, lead_time_days, from_extra_state, box_id  -- add box_id
FROM order_batches
WHERE id = ANY(p_batch_ids)
```

**2. Add `box_id` to the remainder batch INSERT:**
```sql
INSERT INTO order_batches (
  order_id, product_id, order_item_id, current_state,
  quantity, created_by, eta, lead_time_days, from_extra_state, box_id  -- add box_id
) VALUES (
  v_batch.order_id, v_batch.product_id, v_batch.order_item_id,
  v_batch.current_state, v_batch.quantity - v_remaining,
  v_batch.created_by, v_batch.eta, v_batch.lead_time_days,
  v_batch.from_extra_state, v_batch.box_id  -- inherit box_id
);
```

This same bug would affect machine assignment in the Completed tab of **all** production phases (finishing, packaging, boxing) whenever a partial quantity is assigned and the batch is in a transitioning state that requires a box. The fix covers all of them since they all use the same RPC.

No frontend changes needed — this is purely a database function fix.
