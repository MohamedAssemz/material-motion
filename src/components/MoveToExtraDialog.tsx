import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Box, Loader2, Search, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

type OrderPhase = 'in_manufacturing' | 'in_finishing' | 'in_packaging' | 'in_boxing';

const PHASE_TO_EXTRA_STATE: Record<OrderPhase, string> = {
  'in_manufacturing': 'extra_manufacturing',
  'in_finishing': 'extra_finishing',
  'in_packaging': 'extra_packaging',
  'in_boxing': 'extra_boxing',
};

const PHASE_LABELS: Record<OrderPhase, string> = {
  'in_manufacturing': 'Manufacturing',
  'in_finishing': 'Finishing',
  'in_packaging': 'Packaging',
  'in_boxing': 'Boxing',
};

interface ExtraBoxOption {
  id: string;
  box_code: string;
  content_type: string;
  current_state: string | null;
  items_list: Array<{
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
  }>;
}

interface ProductSelection {
  groupKey: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  order_item_ids: string[];
  batches: Array<{
    id: string;
    quantity: number;
    current_state: string;
    order_item_id: string | null;
  }>;
}

interface MoveToExtraDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  phase: OrderPhase;
  selections: ProductSelection[];
  totalQuantity: number;
  onSuccess: () => void;
  userId?: string;
}

export function MoveToExtraDialog({
  open,
  onOpenChange,
  orderId,
  phase,
  selections,
  totalQuantity,
  onSuccess,
  userId,
}: MoveToExtraDialogProps) {
  const [boxes, setBoxes] = useState<ExtraBoxOption[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const extraState = PHASE_TO_EXTRA_STATE[phase];

  useEffect(() => {
    if (open) {
      fetchExtraBoxes();
      setSelectedBoxId('');
      setSearchQuery('');
    }
  }, [open]);

  const fetchExtraBoxes = async () => {
    setLoading(true);
    try {
      // Fetch all active extra boxes
      const { data: allBoxes, error: boxesError } = await supabase
        .from('extra_boxes')
        .select('id, box_code, content_type, items_list')
        .eq('is_active', true)
        .order('box_code');

      if (boxesError) throw boxesError;

      // For each box, determine its current_state from its batches
      const boxIds = allBoxes?.map(b => b.id) || [];
      const { data: batchStates } = await supabase
        .from('extra_batches')
        .select('box_id, current_state')
        .in('box_id', boxIds);

      const boxStateMap = new Map<string, string>();
      batchStates?.forEach(b => {
        if (!boxStateMap.has(b.box_id)) {
          boxStateMap.set(b.box_id, b.current_state);
        }
      });

      const formattedBoxes: ExtraBoxOption[] = allBoxes?.map((box) => ({
        id: box.id,
        box_code: box.box_code,
        content_type: box.content_type || 'EMPTY',
        current_state: boxStateMap.get(box.id) || null,
        items_list: (box.items_list as ExtraBoxOption['items_list']) || [],
      })) || [];

      setBoxes(formattedBoxes);
    } catch (error) {
      console.error('Error fetching extra boxes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter boxes: only show empty boxes or boxes with matching state
  const compatibleBoxes = useMemo(() => {
    return boxes.filter(box => {
      // Empty boxes are always compatible
      if (!box.current_state || box.items_list.length === 0) {
        return true;
      }
      // Boxes with items must have matching state
      return box.current_state === extraState;
    });
  }, [boxes, extraState]);

  const filteredBoxes = useMemo(() => {
    if (!searchQuery.trim()) return compatibleBoxes;
    return compatibleBoxes.filter(box =>
      box.box_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      box.items_list.some(item =>
        item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product_sku.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [compatibleBoxes, searchQuery]);

  const handleConfirm = async () => {
    if (!selectedBoxId || selections.length === 0) return;

    setSubmitting(true);
    try {
      const targetBox = boxes.find(b => b.id === selectedBoxId);

      // Process each product selection
      for (const selection of selections) {
        if (selection.quantity <= 0) continue;

        let remainingQty = selection.quantity;

        // Sort batches: prioritize "in_*" state batches
        const sortedBatches = [...selection.batches]
          .filter(b => b.current_state === phase)
          .sort((a, b) => b.quantity - a.quantity);

        // Track how much to deduct per order_item_id
        const deductionsByOrderItem = new Map<string, number>();

        for (const batch of sortedBatches) {
          if (remainingQty <= 0) break;

          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          // Track deduction for this order_item_id
          if (batch.order_item_id) {
            const current = deductionsByOrderItem.get(batch.order_item_id) || 0;
            deductionsByOrderItem.set(batch.order_item_id, current + useQty);
          }

          // Generate QR code for extra batch
          const { data: extraBatchCode } = await supabase.rpc('generate_extra_batch_code');

          // Check if there's an existing extra batch in this box with same product & state
          const { data: existingBatch } = await supabase
            .from('extra_batches')
            .select('id, quantity')
            .eq('box_id', selectedBoxId)
            .eq('product_id', selection.product_id)
            .eq('current_state', extraState)
            .eq('inventory_state', 'AVAILABLE')
            .maybeSingle();

          if (existingBatch) {
            // Merge with existing batch
            await supabase
              .from('extra_batches')
              .update({ quantity: existingBatch.quantity + useQty })
              .eq('id', existingBatch.id);

            // Log CREATED event in history (even for merge, we track the source)
            await supabase.from('extra_batch_history').insert({
              extra_batch_id: existingBatch.id,
              event_type: 'CREATED',
              quantity: useQty,
              from_state: phase,
              source_order_id: orderId,
              source_order_item_id: batch.order_item_id,
              product_id: selection.product_id,
              performed_by: userId,
            });
          } else {
            // Create new extra batch
            const { data: newExtraBatch } = await supabase
              .from('extra_batches')
              .insert({
                qr_code_data: extraBatchCode || `EB-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                product_id: selection.product_id,
                quantity: useQty,
                current_state: extraState,
                inventory_state: 'AVAILABLE',
                box_id: selectedBoxId,
                order_id: null,
                order_item_id: null,
                created_by: userId,
              })
              .select('id')
              .single();

            // Log CREATED event in history
            if (newExtraBatch) {
              await supabase.from('extra_batch_history').insert({
                extra_batch_id: newExtraBatch.id,
                event_type: 'CREATED',
                quantity: useQty,
                from_state: phase,
                source_order_id: orderId,
                source_order_item_id: batch.order_item_id,
                product_id: selection.product_id,
                performed_by: userId,
              });
            }
          }

          // Update or delete the order batch
          const remainingBatchQty = batch.quantity - useQty;
          if (remainingBatchQty <= 0) {
            await supabase
              .from('order_batches')
              .delete()
              .eq('id', batch.id);
          } else {
            await supabase
              .from('order_batches')
              .update({ quantity: remainingBatchQty })
              .eq('id', batch.id);
          }
        }

        // Update deducted_to_extra for each affected order_item
        for (const [orderItemId, deductedQty] of deductionsByOrderItem.entries()) {
          const { data: orderItem } = await supabase
            .from('order_items')
            .select('deducted_to_extra')
            .eq('id', orderItemId)
            .single();

          if (orderItem) {
            await supabase
              .from('order_items')
              .update({ 
                deducted_to_extra: (orderItem.deducted_to_extra || 0) + deductedQty 
              })
              .eq('id', orderItemId);
          }
        }
      }

      toast.success(`Moved ${totalQuantity} items to ${targetBox?.box_code || 'extra inventory'}`);
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error moving to extra:', error);
      toast.error(error.message || 'Failed to move items to extra inventory');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedBox = boxes.find(b => b.id === selectedBoxId);
  const incompatibleBoxes = boxes.filter(b => 
    b.current_state && 
    b.items_list.length > 0 && 
    b.current_state !== extraState
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Assign to Extra Inventory
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="p-3 bg-muted/50 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Items to move:</span>
            <span className="font-medium">{totalQuantity}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">From phase:</span>
            <Badge variant="outline">{PHASE_LABELS[phase]}</Badge>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Extra state:</span>
            <Badge variant="secondary">{extraState.replace('extra_', 'Extra ')}</Badge>
          </div>
        </div>

        {/* Products being moved */}
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Products:</p>
          <div className="text-sm space-y-1">
            {selections.filter(s => s.quantity > 0).map(s => (
              <div key={s.groupKey} className="flex justify-between">
                <span>{s.product_sku}</span>
                <span className="font-mono">× {s.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        <Alert variant="default" className="border-yellow-500/50 bg-yellow-500/5">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertDescription className="text-sm">
            Moving items to extra inventory will reduce the order's effective quantity. 
            These items become available surplus inventory.
          </AlertDescription>
        </Alert>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search EBoxes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {filteredBoxes.length === 0 ? (
              <div className="text-center py-6">
                <Box className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
                {compatibleBoxes.length === 0 ? (
                  <>
                    <p className="text-muted-foreground text-sm">No compatible EBoxes available</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Boxes must be empty or contain items in "{extraState.replace('_', ' ')}" state
                    </p>
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No boxes match your search</p>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 pr-4">
                  {filteredBoxes.map((box) => {
                    const isSelected = selectedBoxId === box.id;
                    const totalQty = box.items_list.reduce((sum, item) => sum + item.quantity, 0);
                    const isEmpty = box.items_list.length === 0;

                    return (
                      <div
                        key={box.id}
                        onClick={() => setSelectedBoxId(box.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-muted-foreground/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Box className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="font-mono font-medium">{box.box_code}</span>
                          </div>
                          {isEmpty ? (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                              EMPTY
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              {totalQty} units
                            </Badge>
                          )}
                        </div>

                        {box.items_list.length > 0 && (
                          <div className="mt-2 pl-6 text-xs text-muted-foreground space-y-0.5">
                            {box.items_list.slice(0, 2).map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{item.product_sku}</span>
                                <span>× {item.quantity}</span>
                              </div>
                            ))}
                            {box.items_list.length > 2 && (
                              <div className="text-muted-foreground/70">
                                +{box.items_list.length - 2} more...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}

            {incompatibleBoxes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {incompatibleBoxes.length} box(es) hidden (different state)
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedBoxId || submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Package className="h-4 w-4 mr-2" />
            )}
            {selectedBox ? `Move to ${selectedBox.box_code}` : 'Select EBox'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}