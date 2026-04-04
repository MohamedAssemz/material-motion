import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Search, Box, Package, Loader2, Printer } from 'lucide-react';

interface ExtraBatch {
  id: string;
  qr_code_data: string | null;
  product_id: string;
  quantity: number;
  current_state: string;
  inventory_state: string;
  box_id: string | null;
  size: string | null;
  product: {
    id: string;
    name_en: string;
    sku: string;
  };
  box?: {
    id: string;
    box_code: string;
  } | null;
}

interface ProductGroup {
  product_id: string;
  product_name: string;
  product_sku: string;
  size: string | null;
  boxes: Array<{
    box_id: string | null;
    box_code: string;
    batches: ExtraBatch[];
    totalQty: number;
  }>;
  totalQty: number;
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  needs_boxing: boolean;
  size?: string | null;
}

interface ExtraInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: 'manufacturing' | 'finishing' | 'packaging' | 'boxing';
  orderId: string;
  orderItems: OrderItem[];
  onItemsSelected: (selections: Array<{ batch_id: string; quantity: number; product_id: string }>) => void;
}

// Map phase to the current_state that extra batches should have to be available
// Extra batches in state X are usable when order is in phase X
const PHASE_CURRENT_STATE_MAP: Record<string, string> = {
  manufacturing: 'extra_manufacturing',
  finishing: 'extra_finishing',
  packaging: 'extra_packaging',
  boxing: 'extra_boxing',
};

const PHASE_LABELS: Record<string, string> = {
  manufacturing: 'Extra Manufacturing',
  finishing: 'Extra Finishing',
  packaging: 'Extra Packaging',
  boxing: 'Extra Boxing',
};

// Extra batch states allowed based on needs_boxing
// Items that don't need boxing cannot use extra_boxing (already boxed items)
const ALLOWED_EXTRA_STATES = {
  needs_boxing_true: ['extra_manufacturing', 'extra_finishing', 'extra_packaging', 'extra_boxing'],
  needs_boxing_false: ['extra_manufacturing', 'extra_finishing', 'extra_packaging'],
};

export function ExtraInventoryDialog({
  open,
  onOpenChange,
  phase,
  orderId,
  orderItems,
  onItemsSelected,
}: ExtraInventoryDialogProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ExtraBatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
  const [submitting, setSubmitting] = useState(false);
  const [reservedPerOrderItem, setReservedPerOrderItem] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (open) {
      fetchExtraBatches();
      setSelections(new Map());
      setSearchQuery('');
    }
  }, [open, phase]);

  const fetchExtraBatches = async () => {
    setLoading(true);
    try {
      // Get product IDs from order items
      const orderProductIds = [...new Set(orderItems.map(oi => oi.product_id))];
      
      if (orderProductIds.length === 0) {
        setBatches([]);
        setLoading(false);
        return;
      }

      // Fetch already-reserved extra batches for this order to deduct from capacity
      const { data: reservedData, error: reservedError } = await supabase
        .from('extra_batches')
        .select('order_item_id, quantity')
        .eq('order_id', orderId)
        .eq('inventory_state', 'RESERVED');

      if (reservedError) throw reservedError;

      const reservedMap = new Map<string, number>();
      (reservedData || []).forEach(rb => {
        if (rb.order_item_id) {
          reservedMap.set(rb.order_item_id, (reservedMap.get(rb.order_item_id) || 0) + rb.quantity);
        }
      });
      setReservedPerOrderItem(reservedMap);
      
      // Determine which products have needs_boxing=true order items
      const productNeedsBoxingMap = new Map<string, { hasNeedsBoxing: boolean; hasNoBoxing: boolean }>();
      orderItems.forEach(oi => {
        const existing = productNeedsBoxingMap.get(oi.product_id) || { hasNeedsBoxing: false, hasNoBoxing: false };
        if (oi.needs_boxing) {
          existing.hasNeedsBoxing = true;
        } else {
          existing.hasNoBoxing = true;
        }
        productNeedsBoxingMap.set(oi.product_id, existing);
      });
      
      // Get the target state for the selected phase
      const targetState = PHASE_CURRENT_STATE_MAP[phase];
      
      // Check if any order item can use this phase's state
      let hasEligibleOrderItem = false;
      if (targetState === 'extra_boxing') {
        hasEligibleOrderItem = Array.from(productNeedsBoxingMap.values()).some(v => v.hasNeedsBoxing);
      } else {
        hasEligibleOrderItem = true;
      }
      
      if (!hasEligibleOrderItem) {
        setBatches([]);
        setLoading(false);
        return;
      }
      
      // Fetch available extra inventory batches for the selected phase only
      const { data, error } = await supabase
        .from('extra_batches')
        .select(`
          id,
          qr_code_data,
          product_id,
          quantity,
          current_state,
          inventory_state,
          box_id,
          size,
          product:products(id, name_en, sku)
        `)
        .eq('inventory_state', 'AVAILABLE')
        .eq('current_state', targetState)
        .is('order_id', null)
        .in('product_id', orderProductIds);

      if (error) throw error;

      // Fetch box info from extra_boxes
      const boxIds = data?.filter(b => b.box_id).map(b => b.box_id) || [];
      let boxMap = new Map<string, { id: string; box_code: string }>();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase
          .from('extra_boxes')
          .select('id, box_code')
          .in('id', [...new Set(boxIds)]);
        boxesData?.forEach(box => boxMap.set(box.id, box));
      }

      const batchesWithBoxes: ExtraBatch[] = (data || []).map(batch => ({
        id: batch.id,
        qr_code_data: batch.qr_code_data,
        product_id: batch.product_id,
        quantity: batch.quantity,
        current_state: batch.current_state,
        inventory_state: batch.inventory_state,
        box_id: batch.box_id,
        size: (batch as any).size || null,
        product: batch.product as unknown as { id: string; name_en: string; sku: string },
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
      }));

      // Filter batches to only show ones matching order item sizes
      const filteredBySize = batchesWithBoxes.filter(batch => {
        // Find order items for this product that match the batch's size
        return orderItems.some(oi => 
          oi.product_id === batch.product_id &&
          (oi.size || null) === (batch.size || null)
        );
      });

      setBatches(filteredBySize);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Group batches by product + size, then by box
  const productGroups: ProductGroup[] = [];
  const productMap = new Map<string, ProductGroup>();

  batches.forEach(batch => {
    const groupKey = `${batch.product_id}::${batch.size || ''}`;
    if (!productMap.has(groupKey)) {
      productMap.set(groupKey, {
        product_id: batch.product_id,
        product_name: batch.product?.name_en || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        size: batch.size || null,
        boxes: [],
        totalQty: 0,
      });
    }
    const group = productMap.get(groupKey)!;
    group.totalQty += batch.quantity;

    // Group by box
    const boxKey = batch.box_id || 'no-box';
    let boxGroup = group.boxes.find(b => (b.box_id || 'no-box') === boxKey);
    if (!boxGroup) {
      boxGroup = {
        box_id: batch.box_id,
        box_code: batch.box?.box_code || 'No Box',
        batches: [],
        totalQty: 0,
      };
      group.boxes.push(boxGroup);
    }
    boxGroup.batches.push(batch);
    boxGroup.totalQty += batch.quantity;
  });

  productMap.forEach(g => productGroups.push(g));

  // Filter by search
  const filteredGroups = searchQuery.trim()
    ? productGroups.filter(g => 
        g.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        g.product_sku.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : productGroups;

  // Check if an order item can use a specific batch based on needs_boxing and batch state
  const canOrderItemUseBatch = (orderItem: OrderItem, batchState: string): boolean => {
    const allowed = orderItem.needs_boxing 
      ? ALLOWED_EXTRA_STATES.needs_boxing_true 
      : ALLOWED_EXTRA_STATES.needs_boxing_false;
    return allowed.includes(batchState);
  };

  // Get max quantity for a product+size considering the batch state
  const getMaxForProduct = (productId: string, batchState?: string, batchSize?: string | null): number => {
    return orderItems
      .filter(oi => {
        if (oi.product_id !== productId) return false;
        if ((oi.size || null) !== (batchSize === undefined ? null : batchSize)) return false;
        if (batchState) {
          return canOrderItemUseBatch(oi, batchState);
        }
        return true;
      })
      .reduce((sum, oi) => {
        const alreadyReserved = reservedPerOrderItem.get(oi.id) || 0;
        return sum + Math.max(0, oi.quantity - alreadyReserved);
      }, 0);
  };

  // Get order items for a product+size sorted with needs_boxing=true first
  const getOrderItemsForProduct = (productId: string, batchState?: string, batchSize?: string | null): OrderItem[] => {
    return orderItems
      .filter(oi => {
        if (oi.product_id !== productId) return false;
        if ((oi.size || null) !== (batchSize === undefined ? null : batchSize)) return false;
        if (batchState) {
          return canOrderItemUseBatch(oi, batchState);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.needs_boxing && !b.needs_boxing) return -1;
        if (!a.needs_boxing && b.needs_boxing) return 1;
        return 0;
      });
  };

  const handleQuantityChange = (batchId: string, value: number, maxAvailable: number, productId: string, batchState: string, batchSize?: string | null) => {
    // Get max for this product+size considering the batch state restrictions
    const maxOrder = getMaxForProduct(productId, batchState, batchSize);
    
    // Get current total selected for this product from batches with the same state restriction
    // We need to consider that extra_boxing batches can only be used by needs_boxing=true items
    let currentProductTotal = 0;
    batches.forEach(b => {
      if (b.product_id === productId && b.id !== batchId && (b.size || null) === (batchSize === undefined ? null : batchSize)) {
        if (batchState === 'extra_boxing' && b.current_state === 'extra_boxing') {
          currentProductTotal += selections.get(b.id) || 0;
        } else if (batchState !== 'extra_boxing' && b.current_state !== 'extra_boxing') {
          currentProductTotal += selections.get(b.id) || 0;
        }
      }
    });
    
    const remainingForOrder = maxOrder - currentProductTotal;
    const clamped = Math.max(0, Math.min(value, maxAvailable, remainingForOrder));
    
    setSelections(prev => {
      const newMap = new Map(prev);
      if (clamped > 0) {
        newMap.set(batchId, clamped);
      } else {
        newMap.delete(batchId);
      }
      return newMap;
    });
  };

  const totalSelected = Array.from(selections.values()).reduce((a, b) => a + b, 0);

  /**
   * Extra Inventory Consumption Logic:
   * 
   * INVARIANT: Order items do NOT own quantities directly.
   * Quantities are owned by batches.
   * Order Item Quantity = sum of its order batches
   * 
   * RULE: When using extra inventory for an order:
   * - The total quantity of the order item must remain UNCHANGED
   * - The used extra inventory quantity must be SUBTRACTED from the order's own batches
   * - Extra inventory batches never increase order totals; they only REPLACE internal order batches
   * 
   * When a user selects a subset of an AVAILABLE extra batch:
   * 
   * 1. Reserve the extra batch (full or partial):
   *    - If partial: Split the batch, new portion becomes RESERVED
   *    - If full: Update existing batch to RESERVED
   *    - Preserve box linkage
   * 
   * 2. CRITICAL: Reduce the order's own batches by the same quantity:
   *    - Find order batches for the same product
   *    - Reduce or delete them to offset the extra inventory being used
   *    - This ensures order item quantity remains constant
   */
  const handleConfirm = async () => {
    if (totalSelected === 0) return;
    setSubmitting(true);

    try {
      const selectedItems: Array<{ batch_id: string; quantity: number; product_id: string }> = [];
      
      // Track remaining capacity per order_item_id for distribution
      // This ensures we distribute extra batches across all matching order items
      const orderItemCapacity = new Map<string, { remaining: number; productId: string }>();
      orderItems.forEach(oi => {
        const alreadyReserved = reservedPerOrderItem.get(oi.id) || 0;
        orderItemCapacity.set(oi.id, { remaining: Math.max(0, oi.quantity - alreadyReserved), productId: oi.product_id });
      });

      // Track quantities to reduce from order batches per order_item_id
      const orderItemReductions = new Map<string, number>();
      
      // Process each selection and distribute to order items
      for (const [batchId, quantity] of selections.entries()) {
        if (quantity <= 0) continue;
        
        const batch = batches.find(b => b.id === batchId);
        if (!batch) continue;
        
        // Find order items for this product that can use this batch and have remaining capacity
        // Sorted with needs_boxing=true first (priority deduction)
        const matchingOrderItems = getOrderItemsForProduct(batch.product_id, batch.current_state, batch.size);
        
        let remainingToAssign = quantity;
        
        for (const orderItem of matchingOrderItems) {
          if (remainingToAssign <= 0) break;
          
          const capacity = orderItemCapacity.get(orderItem.id);
          if (!capacity || capacity.remaining <= 0) continue;
          
          // Determine how much to assign to this order item
          const assignQty = Math.min(remainingToAssign, capacity.remaining);
          
          if (assignQty > 0) {
            // Track the reduction for this order item
            orderItemReductions.set(
              orderItem.id,
              (orderItemReductions.get(orderItem.id) || 0) + assignQty
            );
            
            // Check if there's an existing RESERVED batch for this order_item, product, and box
            // If so, increase its quantity instead of creating a new batch
            const { data: existingReserved } = await supabase
              .from('extra_batches')
              .select('id, quantity')
              .eq('order_id', orderId)
              .eq('order_item_id', orderItem.id)
              .eq('product_id', batch.product_id)
              .eq('box_id', batch.box_id)
              .eq('inventory_state', 'RESERVED')
              .eq('current_state', batch.current_state)
              .maybeSingle();
            
            if (existingReserved) {
              // MERGE: Add quantity to existing reserved batch
              const { error: updateError } = await supabase
                .from('extra_batches')
                .update({ quantity: existingReserved.quantity + assignQty })
                .eq('id', existingReserved.id);

              if (updateError) throw updateError;

              selectedItems.push({
                batch_id: existingReserved.id,
                quantity: assignQty,
                product_id: batch.product_id,
              });
              
              // Reduce the source batch
              if (assignQty === batch.quantity) {
                // Delete the source batch entirely
                await supabase.from('extra_batches').delete().eq('id', batchId);
              } else {
                // Reduce the source batch quantity
                await supabase
                  .from('extra_batches')
                  .update({ quantity: batch.quantity - assignQty })
                  .eq('id', batchId);
              }
            } else if (assignQty === batch.quantity && remainingToAssign === quantity) {
              // FULL QUANTITY & NO EXISTING: Update existing batch to RESERVED
              const { error: updateError } = await supabase
                .from('extra_batches')
                .update({
                  inventory_state: 'RESERVED',
                  order_id: orderId,
                  order_item_id: orderItem.id,
                })
                .eq('id', batchId);

              if (updateError) throw updateError;

              selectedItems.push({
                batch_id: batchId,
                quantity: assignQty,
                product_id: batch.product_id,
              });
            } else {
              // PARTIAL or SPLIT & NO EXISTING: Create new reserved batch
              const { data: newBatchCode } = await supabase.rpc('generate_extra_batch_code');
              
              const { data: newBatch, error: insertError } = await supabase
                .from('extra_batches')
                .insert({
                  qr_code_data: newBatchCode || `EB-${Date.now()}`,
                  order_id: orderId,
                  order_item_id: orderItem.id,
                  product_id: batch.product_id,
                  current_state: batch.current_state,
                  quantity: assignQty,
                  box_id: batch.box_id,
                  inventory_state: 'RESERVED',
                  created_by: user?.id,
                })
                .select('id')
                .single();

              if (insertError) throw insertError;

              selectedItems.push({
                batch_id: newBatch?.id || batchId,
                quantity: assignQty,
                product_id: batch.product_id,
              });
            }
            
            // Update capacity tracking
            capacity.remaining -= assignQty;
            remainingToAssign -= assignQty;
          }
        }
        
        // If we used a partial quantity and didn't merge into existing, update the original batch's remaining quantity
        // Note: The merge case already handles reducing the source batch, so we only do this for the non-merge cases
        if (remainingToAssign < quantity) {
          const usedFromBatch = quantity - remainingToAssign;
          // Only reduce if we didn't already handle it in the else branches above
          // Check if the batch still exists and has remaining quantity
          const { data: currentBatch } = await supabase
            .from('extra_batches')
            .select('quantity, inventory_state')
            .eq('id', batchId)
            .maybeSingle();
          
          if (currentBatch && currentBatch.inventory_state === 'AVAILABLE' && currentBatch.quantity > usedFromBatch) {
            const { error: updateError } = await supabase
              .from('extra_batches')
              .update({ quantity: currentBatch.quantity - usedFromBatch })
              .eq('id', batchId);

            if (updateError) throw updateError;
          } else if (currentBatch && currentBatch.inventory_state === 'AVAILABLE' && currentBatch.quantity <= usedFromBatch) {
            // Delete the batch if we've used all of it
            await supabase.from('extra_batches').delete().eq('id', batchId);
          }
        }
      }

      // CRITICAL: Reduce order batches for each order_item to maintain quantity invariant
      for (const [orderItemId, quantityToReduce] of orderItemReductions.entries()) {
        const capacity = orderItemCapacity.get(orderItemId);
        if (capacity) {
          await reduceOrderBatchesForOrderItem(orderId, orderItemId, quantityToReduce);
        }
      }

      // Log activity
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (currentUser) {
        await supabase.from("order_activity_logs").insert({
          order_id: orderId,
          action: "reserved_extra",
          performed_by: currentUser.id,
          details: { total_reserved: totalSelected, phase },
        });
      }

      toast.success(`Reserved ${totalSelected} extra items for order`);
      onItemsSelected(selectedItems);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Reduces order batches for a specific order item by the given quantity.
   * This ensures the order item quantity remains unchanged when extra inventory is used.
   * 
   * @param orderId - The order to reduce batches for
   * @param orderItemId - The order item ID to reduce batches for
   * @param quantityToReduce - The amount to reduce
   */
  const reduceOrderBatchesForOrderItem = async (
    orderId: string,
    orderItemId: string,
    quantityToReduce: number
  ) => {
    // Fetch order batches for this specific order_item_id
    const { data: orderBatches, error: fetchError } = await supabase
      .from('order_batches')
      .select('id, quantity, current_state, order_item_id')
      .eq('order_id', orderId)
      .eq('order_item_id', orderItemId)
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;
    if (!orderBatches || orderBatches.length === 0) {
      console.warn(`No order batches found for order_item ${orderItemId} in order ${orderId}`);
      return;
    }

    let remaining = quantityToReduce;

    for (const batch of orderBatches) {
      if (remaining <= 0) break;

      if (batch.quantity <= remaining) {
        // Delete this batch entirely - it's fully replaced by extra inventory
        const { error: deleteError } = await supabase
          .from('order_batches')
          .delete()
          .eq('id', batch.id);

        if (deleteError) throw deleteError;
        remaining -= batch.quantity;
      } else {
        // Reduce batch quantity - partially replaced by extra inventory
        const { error: updateError } = await supabase
          .from('order_batches')
          .update({ quantity: batch.quantity - remaining })
          .eq('id', batch.id);

        if (updateError) throw updateError;
        remaining = 0;
      }
    }

    if (remaining > 0) {
      console.warn(`Could not reduce all ${quantityToReduce} units for order_item ${orderItemId}. ${remaining} units remaining.`);
    }
  };

  const handlePrintGuide = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const selectedBatches = batches.filter(b => selections.has(b.id) && (selections.get(b.id) || 0) > 0);
    
    // Group by box for printing
    const boxGroups = new Map<string, { box_code: string; items: Array<{ product_name: string; product_sku: string; quantity: number }> }>();
    
    selectedBatches.forEach(batch => {
      const boxKey = batch.box?.box_code || 'No Box';
      if (!boxGroups.has(boxKey)) {
        boxGroups.set(boxKey, { box_code: boxKey, items: [] });
      }
      boxGroups.get(boxKey)!.items.push({
        product_name: batch.product.name_en,
        product_sku: batch.product.sku,
        quantity: selections.get(batch.id) || 0,
      });
    });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${PHASE_LABELS[phase]} Guide</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .title { font-size: 24px; font-weight: bold; }
            .box-section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
            .box-header { font-weight: bold; font-size: 16px; margin-bottom: 10px; display: flex; align-items: center; gap: 8px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; }
            .total { font-weight: bold; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="title">${PHASE_LABELS[phase]} - Picking Guide</div>
            <div>Generated: ${new Date().toLocaleString()}</div>
          </div>
          
          ${Array.from(boxGroups.entries()).map(([boxCode, group]) => `
            <div class="box-section">
              <div class="box-header">📦 ${boxCode}</div>
              <table>
                <tr><th>Product</th><th>SKU</th><th>Quantity</th></tr>
                ${group.items.map(item => `
                  <tr>
                    <td>${item.product_name}</td>
                    <td>${item.product_sku}</td>
                    <td><strong>${item.quantity}</strong></td>
                  </tr>
                `).join('')}
              </table>
            </div>
          `).join('')}
          
          <div class="total">Total Items: ${totalSelected}</div>
          
          <script>
            setTimeout(function() {
              window.print();
            }, 100);
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{PHASE_LABELS[phase]}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col flex-1 min-h-0 space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by product..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Content */}
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No extra inventory available for this phase</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-4">
                {filteredGroups.map(group => {
                  const maxOrder = getMaxForProduct(group.product_id, PHASE_CURRENT_STATE_MAP[phase]);
                  const currentProductSelected = group.boxes.reduce((sum, box) => 
                    sum + box.batches.reduce((s, b) => s + (selections.get(b.id) || 0), 0), 0
                  );
                  
                  return (
                    <div key={group.product_id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium">{group.product_name}</p>
                          <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary">{group.totalQty} available</Badge>
                          {maxOrder > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Order needs: {maxOrder} | Selected: {currentProductSelected}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.boxes.map(boxGroup => (
                          <div key={boxGroup.box_id || 'no-box'} className="ml-4 space-y-2">
                            {boxGroup.batches.map(batch => (
                              <div key={batch.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded">
                                <Box className="h-4 w-4 text-muted-foreground" />
                                <span className="font-mono text-sm">{batch.box?.box_code || 'No Box'}</span>
                                {batch.current_state === 'extra_boxing' && (
                                  <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                                    Boxing items only
                                  </Badge>
                                )}
                                <span className="text-sm text-muted-foreground">
                                  Available: {batch.quantity}
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                  <Label className="text-xs">Qty:</Label>
                                  <NumericInput
                                    min={0}
                                    max={batch.quantity}
                                    value={selections.get(batch.id) || undefined}
                                    onValueChange={val => handleQuantityChange(
                                      batch.id, 
                                      val ?? 0, 
                                      batch.quantity,
                                      batch.product_id,
                                      batch.current_state
                                    )}
                                    className="w-20 h-8"
                                    placeholder="0"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 mr-auto">
            {totalSelected > 0 && (
              <>
                <Badge>{totalSelected} selected</Badge>
                <Button variant="outline" size="sm" onClick={handlePrintGuide}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print Guide
                </Button>
              </>
            )}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={totalSelected === 0 || submitting}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Add to Order ({totalSelected})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
