import { supabase } from '@/integrations/supabase/client';

/**
 * Extra Inventory Operations
 * 
 * Handles the movement of quantities between order batches and extra inventory.
 * 
 * INVARIANTS:
 * - Quantities are owned by batches, not boxes or products
 * - A box can contain multiple batches of different products
 * - Order item quantity = sum of its active order batches
 * - Order items must never store independent quantities
 */

type OrderPhase = 'in_manufacturing' | 'in_finishing' | 'in_packaging' | 'in_boxing';

// Map order batch phase to corresponding extra batch state
const PHASE_TO_EXTRA_STATE: Record<OrderPhase, string> = {
  'in_manufacturing': 'extra_manufacturing',
  'in_finishing': 'extra_finishing',
  'in_packaging': 'extra_packaging',
  'in_boxing': 'extra_boxing',
};

interface MoveToExtraResult {
  success: boolean;
  error?: string;
  createdExtraBatchIds: string[];
  removedOrderBatchIds: string[];
  updatedOrderBatchIds: string[];
}

interface BatchSelection {
  batchId: string;
  quantity: number;
}

/**
 * Moves selected quantities from order batches to an Extra Inventory Box (EBox).
 * 
 * Behavior:
 * - For each affected order batch:
 *   - If partial quantity selected: Reduce the existing order batch quantity
 *   - If full quantity selected: Delete the order batch entirely
 * 
 * - For each selected quantity:
 *   - Create a new extra_batch with:
 *     - Same product_id
 *     - Selected quantity
 *     - current_state = extra_<current_phase>
 *     - Linked to the selected EBox (box_id)
 *     - inventory_state = 'AVAILABLE'
 * 
 * @param selections - Array of batch IDs and quantities to move
 * @param targetEboxId - The ID of the target Extra Box
 * @param currentPhase - The current phase of the order batches
 * @param userId - The ID of the user performing the operation
 */
export async function moveOrderBatchesToExtraInventory(
  selections: BatchSelection[],
  targetEboxId: string,
  currentPhase: OrderPhase,
  userId?: string
): Promise<MoveToExtraResult> {
  const result: MoveToExtraResult = {
    success: false,
    createdExtraBatchIds: [],
    removedOrderBatchIds: [],
    updatedOrderBatchIds: [],
  };

  try {
    // Validate phase
    if (!PHASE_TO_EXTRA_STATE[currentPhase]) {
      throw new Error(`Invalid phase: ${currentPhase}. Must be one of: in_manufacturing, in_finishing, in_packaging, in_boxing`);
    }

    const extraState = PHASE_TO_EXTRA_STATE[currentPhase];

    // Fetch all affected order batches in one query
    const batchIds = selections.map(s => s.batchId);
    const { data: orderBatches, error: fetchError } = await supabase
      .from('order_batches')
      .select('id, product_id, quantity, current_state, order_id, order_item_id')
      .in('id', batchIds);

    if (fetchError) throw fetchError;
    if (!orderBatches || orderBatches.length === 0) {
      throw new Error('No order batches found for the provided IDs');
    }

    // Validate all batches are in the expected phase
    for (const batch of orderBatches) {
      if (batch.current_state !== currentPhase) {
        throw new Error(
          `Batch ${batch.id} is in state "${batch.current_state}", expected "${currentPhase}"`
        );
      }
    }

    // Create a map for quick lookup
    const batchMap = new Map(orderBatches.map(b => [b.id, b]));

    // Process each selection
    for (const selection of selections) {
      const batch = batchMap.get(selection.batchId);
      if (!batch) continue;

      if (selection.quantity <= 0) continue;
      if (selection.quantity > batch.quantity) {
        throw new Error(
          `Cannot move ${selection.quantity} from batch ${batch.id} - only ${batch.quantity} available`
        );
      }

      // Generate a new QR code for the extra batch
      const { data: extraBatchCode } = await supabase.rpc('generate_extra_batch_code');

      // Create new extra_batch with selected quantity
      const { data: newExtraBatch, error: insertError } = await supabase
        .from('extra_batches')
        .insert({
          qr_code_data: extraBatchCode || `EB-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          product_id: batch.product_id,
          quantity: selection.quantity,
          current_state: extraState,
          inventory_state: 'AVAILABLE',
          box_id: targetEboxId,
          order_id: null, // Not linked to any order - it's now extra inventory
          created_by: userId,
        })
        .select('id')
        .single();

      if (insertError) throw insertError;
      if (newExtraBatch) {
        result.createdExtraBatchIds.push(newExtraBatch.id);
      }

      // Update or delete the order batch based on remaining quantity
      const remainingQuantity = batch.quantity - selection.quantity;

      if (remainingQuantity <= 0) {
        // Full quantity selected: Delete the order batch
        const { error: deleteError } = await supabase
          .from('order_batches')
          .delete()
          .eq('id', batch.id);

        if (deleteError) throw deleteError;
        result.removedOrderBatchIds.push(batch.id);
      } else {
        // Partial quantity selected: Reduce the order batch quantity
        const { error: updateError } = await supabase
          .from('order_batches')
          .update({ quantity: remainingQuantity })
          .eq('id', batch.id);

        if (updateError) throw updateError;
        result.updatedOrderBatchIds.push(batch.id);
      }
    }

    result.success = true;
    return result;
  } catch (error: any) {
    result.error = error.message || 'Failed to move batches to extra inventory';
    return result;
  }
}

/**
 * Validates that the target box exists and is an extra box.
 */
export async function validateExtraBox(boxId: string): Promise<{ valid: boolean; error?: string; boxCode?: string }> {
  try {
    const { data, error } = await supabase
      .from('extra_boxes')
      .select('id, box_code, is_active')
      .eq('id', boxId)
      .single();

    if (error || !data) {
      return { valid: false, error: 'Extra box not found' };
    }

    if (!data.is_active) {
      return { valid: false, error: 'Extra box is not active' };
    }

    return { valid: true, boxCode: data.box_code };
  } catch (error: any) {
    return { valid: false, error: error.message };
  }
}

/**
 * Fetches available extra boxes for selection.
 */
export async function fetchAvailableExtraBoxes(): Promise<Array<{ id: string; box_code: string }>> {
  const { data, error } = await supabase
    .from('extra_boxes')
    .select('id, box_code')
    .eq('is_active', true)
    .order('box_code', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Creates a new extra box and returns its ID.
 */
export async function createExtraBox(userId?: string): Promise<{ id: string; box_code: string }> {
  const { data: boxCode } = await supabase.rpc('generate_extra_box_code');
  
  const { data, error } = await supabase
    .from('extra_boxes')
    .insert({
      box_code: boxCode || `EBOX-${Date.now()}`,
      is_active: true,
      content_type: 'EXTRA',
      items_list: [],
    })
    .select('id, box_code')
    .single();

  if (error) throw error;
  return data;
}

/**
 * Updates the items_list of an extra box after batches are added to it.
 * The items_list is informational and summarizes what's in the box.
 */
export async function updateExtraBoxItemsList(boxId: string): Promise<void> {
  // Fetch all batches in this box
  const { data: batches, error: fetchError } = await supabase
    .from('extra_batches')
    .select('product_id, quantity, product:products(name_en, sku)')
    .eq('box_id', boxId);

  if (fetchError) throw fetchError;

  // Aggregate by product
  const productMap = new Map<string, { name: string; sku: string; quantity: number }>();
  
  (batches || []).forEach((batch: any) => {
    const productId = batch.product_id;
    if (!productMap.has(productId)) {
      productMap.set(productId, {
        name: batch.product?.name_en || 'Unknown',
        sku: batch.product?.sku || 'N/A',
        quantity: 0,
      });
    }
    const item = productMap.get(productId)!;
    item.quantity += batch.quantity;
  });

  const itemsList = Array.from(productMap.entries()).map(([productId, data]) => ({
    product_id: productId,
    product_name: data.name,
    product_sku: data.sku,
    quantity: data.quantity,
  }));

  // Update box
  const { error: updateError } = await supabase
    .from('extra_boxes')
    .update({
      items_list: itemsList,
      content_type: itemsList.length > 0 ? 'EXTRA' : 'EMPTY',
    })
    .eq('id', boxId);

  if (updateError) throw updateError;
}
