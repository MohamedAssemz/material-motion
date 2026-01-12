/**
 * Utility functions for grouping batches by product + needs_boxing
 * This ensures that order batches in the same state are displayed together
 * when they share the same product and needs_boxing flag.
 */

export interface BatchForGrouping {
  id: string;
  product_id: string;
  quantity: number;
  current_state: string;
  order_item_id: string | null;
  product?: {
    id: string;
    name: string;
    sku: string;
    needs_packing?: boolean;
  };
  order_item?: {
    needs_boxing: boolean;
  } | null;
  [key: string]: any; // Allow additional properties
}

export interface ProductNeedsBoxingGroup {
  groupKey: string; // product_id + needs_boxing
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_packing: boolean;
  needs_boxing: boolean;
  quantity: number;
  batches: BatchForGrouping[];
  order_item_ids: string[]; // Track all order_item_ids in this group
}

/**
 * Groups batches by product_id + needs_boxing flag
 * This combines multiple order items that have the same product and needs_boxing
 */
export function groupBatchesByProductAndBoxing<T extends BatchForGrouping>(
  batches: T[],
  stateFilter?: string | string[]
): ProductNeedsBoxingGroup[] {
  const filteredBatches = stateFilter
    ? batches.filter(b => 
        Array.isArray(stateFilter) 
          ? stateFilter.includes(b.current_state)
          : b.current_state === stateFilter
      )
    : batches;

  const groupMap = new Map<string, ProductNeedsBoxingGroup>();

  filteredBatches.forEach(batch => {
    const needsBoxing = batch.order_item?.needs_boxing ?? true;
    const groupKey = `${batch.product_id}-${needsBoxing ? 'boxing' : 'no-boxing'}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        groupKey,
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        needs_packing: batch.product?.needs_packing ?? true,
        needs_boxing: needsBoxing,
        quantity: 0,
        batches: [],
        order_item_ids: [],
      });
    }

    const group = groupMap.get(groupKey)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
    
    // Track unique order_item_ids
    if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
      group.order_item_ids.push(batch.order_item_id);
    }
  });

  // Sort groups by product name
  return Array.from(groupMap.values()).sort((a, b) => 
    a.product_name.localeCompare(b.product_name)
  );
}

/**
 * Gets the first batch from each order_item_id in a group
 * Useful when you need to process batches but maintain order_item separation
 */
export function getBatchesByOrderItem<T extends BatchForGrouping>(
  group: ProductNeedsBoxingGroup
): Map<string, T[]> {
  const orderItemBatches = new Map<string, T[]>();
  
  group.batches.forEach(batch => {
    const key = batch.order_item_id || batch.product_id;
    if (!orderItemBatches.has(key)) {
      orderItemBatches.set(key, []);
    }
    orderItemBatches.get(key)!.push(batch as T);
  });
  
  return orderItemBatches;
}
