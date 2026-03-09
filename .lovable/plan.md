

## Clean Slate: Delete All Order-Related Data

### Current Data

| Table | Rows |
|-------|------|
| orders | 10 |
| order_items | 14 |
| order_batches | 36 |
| extra_batches | 20 |
| extra_batch_history | 48 |
| shipments | 6 |
| raw_material_versions | 11 |
| order_comments | 0 |
| notifications | 0 |

### Plan

Run DELETE statements in the correct order to avoid foreign key / trigger conflicts. Also reset box contents since boxes reference batches via `items_list`.

**Deletion order:**
1. `extra_batch_history` (references extra_batches)
2. `order_batches` (references orders, boxes, shipments)
3. `extra_batches` (references extra_boxes)
4. `shipments` (references orders)
5. `raw_material_versions` (references orders)
6. `order_comments` (references orders)
7. `order_items` (references orders)
8. `orders`
9. Reset `boxes.items_list` to `'[]'` and `content_type` to `'EMPTY'`
10. Reset `extra_boxes.items_list` to `'[]'` and `content_type` to `'EMPTY'`

No schema or code changes needed — just data cleanup.

