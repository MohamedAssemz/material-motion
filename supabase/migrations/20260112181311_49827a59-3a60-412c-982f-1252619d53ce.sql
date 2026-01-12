-- Drop the old constraint and add a new one with 'shipped' state
ALTER TABLE order_batches DROP CONSTRAINT IF EXISTS order_batches_current_state_check;

ALTER TABLE order_batches ADD CONSTRAINT order_batches_current_state_check 
CHECK (current_state = ANY (ARRAY[
  'pending_rm'::text, 
  'in_manufacturing'::text, 
  'ready_for_finishing'::text, 
  'in_finishing'::text, 
  'ready_for_packaging'::text, 
  'in_packaging'::text, 
  'ready_for_boxing'::text, 
  'in_boxing'::text, 
  'ready_for_shipment'::text, 
  'shipped'::text
]));