import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { Play, Package, Loader2, ChevronRight, Sparkles } from "lucide-react";

interface OrderItem {
  id: string; // order_item_id
  product_id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    sku: string;
  };
}

interface ExtraBatch {
  id: string;
  product_id: string;
  quantity: number;
  current_state: string;
  box_id: string;
  product: {
    name: string;
    sku: string;
  };
}

interface StartOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderItems: OrderItem[];
  onOrderStarted: () => void;
}

export function StartOrderDialog({
  open,
  onOpenChange,
  orderId,
  orderItems,
  onOrderStarted,
}: StartOrderDialogProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'choose' | 'extra' | 'confirm'>('choose');
  const [loading, setLoading] = useState(false);
  const [extraBatches, setExtraBatches] = useState<ExtraBatch[]>([]);
  const [selectedExtras, setSelectedExtras] = useState<Map<string, { batchId: string; quantity: number }[]>>(new Map()); // key is order_item_id
  const [fetchingExtras, setFetchingExtras] = useState(false);

  const fetchAvailableExtras = async () => {
    setFetchingExtras(true);
    try {
      const productIds = orderItems.map(item => item.product_id);
      
      const { data, error } = await supabase
        .from('extra_batches')
        .select('id, product_id, quantity, current_state, box_id, product:products(name, sku)')
        .eq('inventory_state', 'AVAILABLE')
        .eq('current_state', 'extra_ready_for_finishing')
        .in('product_id', productIds);

      if (error) throw error;
      setExtraBatches(data as ExtraBatch[] || []);
    } catch (error: any) {
      console.error('Error fetching extra batches:', error);
      toast.error('Failed to load extra inventory');
    } finally {
      setFetchingExtras(false);
    }
  };

  const handleUseExtra = async () => {
    await fetchAvailableExtras();
    setStep('extra');
  };

  const handleStartWithoutExtra = () => {
    setStep('confirm');
  };

  const handleStartOrder = async () => {
    setLoading(true);
    try {
      // First, process any selected extra inventory
      // selectedExtras is now keyed by order_item_id
      for (const [orderItemId, selections] of selectedExtras.entries()) {
        const orderItem = orderItems.find(item => item.id === orderItemId);
        if (!orderItem) continue;

        for (const selection of selections) {
          // Get the extra batch
          const { data: extraBatch, error: fetchError } = await supabase
            .from('extra_batches')
            .select('*')
            .eq('id', selection.batchId)
            .single();

          if (fetchError) throw fetchError;

          // If using partial quantity, split the batch
          if (selection.quantity < extraBatch.quantity) {
            // Update original batch with reduced quantity
            await supabase
              .from('extra_batches')
              .update({ quantity: extraBatch.quantity - selection.quantity })
              .eq('id', selection.batchId);

            // Create reserved batch for the order with order_item_id
            await supabase
              .from('extra_batches')
              .insert({
                product_id: extraBatch.product_id,
                box_id: extraBatch.box_id,
                quantity: selection.quantity,
                current_state: extraBatch.current_state,
                inventory_state: 'RESERVED',
                order_id: orderId,
                order_item_id: orderItemId,
                created_by: user?.id,
              });
          } else {
            // Reserve the entire batch with order_item_id
            await supabase
              .from('extra_batches')
              .update({ 
                inventory_state: 'RESERVED',
                order_id: orderId,
                order_item_id: orderItemId,
              })
              .eq('id', selection.batchId);
          }

          // Reduce the order batch quantity for this specific order_item_id
          const { data: orderBatches } = await supabase
            .from('order_batches')
            .select('id, quantity')
            .eq('order_id', orderId)
            .eq('order_item_id', orderItemId)
            .eq('current_state', 'pending_rm');

          if (orderBatches && orderBatches.length > 0) {
            let remainingToReduce = selection.quantity;
            for (const batch of orderBatches) {
              if (remainingToReduce <= 0) break;

              if (batch.quantity <= remainingToReduce) {
                // Delete this batch entirely
                await supabase.from('order_batches').delete().eq('id', batch.id);
                remainingToReduce -= batch.quantity;
              } else {
                // Reduce batch quantity
                await supabase
                  .from('order_batches')
                  .update({ quantity: batch.quantity - remainingToReduce })
                  .eq('id', batch.id);
                remainingToReduce = 0;
              }
            }
          }
        }
      }

      // Transition remaining order batches from pending_rm to in_manufacturing
      const { error: updateError } = await supabase
        .from('order_batches')
        .update({ 
          current_state: 'in_manufacturing',
          updated_at: new Date().toISOString(),
        })
        .eq('order_id', orderId)
        .eq('current_state', 'pending_rm');

      if (updateError) throw updateError;

      // Update order status to in_progress
      await supabase
        .from('orders')
        .update({ status: 'in_progress' })
        .eq('id', orderId);

      toast.success('Order started successfully');
      onOrderStarted();
      onOpenChange(false);
      resetDialog();
    } catch (error: any) {
      console.error('Error starting order:', error);
      toast.error(error.message || 'Failed to start order');
    } finally {
      setLoading(false);
    }
  };

  const resetDialog = () => {
    setStep('choose');
    setSelectedExtras(new Map());
    setExtraBatches([]);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) resetDialog();
    onOpenChange(open);
  };

  const getAvailableForProduct = (productId: string) => {
    return extraBatches.filter(b => b.product_id === productId);
  };

  const getSelectedQuantityForOrderItem = (orderItemId: string) => {
    const selections = selectedExtras.get(orderItemId) || [];
    return selections.reduce((sum, s) => sum + s.quantity, 0);
  };

  const toggleBatchSelection = (orderItemId: string, batchId: string, maxQty: number) => {
    const current = new Map(selectedExtras);
    const itemSelections = current.get(orderItemId) || [];
    
    const existingIndex = itemSelections.findIndex(s => s.batchId === batchId);
    if (existingIndex >= 0) {
      itemSelections.splice(existingIndex, 1);
    } else {
      itemSelections.push({ batchId, quantity: maxQty });
    }
    
    current.set(orderItemId, itemSelections);
    setSelectedExtras(current);
  };

  const hasAnyExtraAvailable = orderItems.some(item => 
    extraBatches.some(b => b.product_id === item.product_id)
  );

  const totalExtraSelected = Array.from(selectedExtras.values())
    .flat()
    .reduce((sum, s) => sum + s.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Start Order
          </DialogTitle>
          <DialogDescription>
            {step === 'choose' && 'Choose how to start this order'}
            {step === 'extra' && 'Select extra inventory to use'}
            {step === 'confirm' && 'Confirm to start manufacturing'}
          </DialogDescription>
        </DialogHeader>

        {step === 'choose' && (
          <div className="space-y-3">
            <Card 
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={handleUseExtra}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Package className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Use Extra Inventory</p>
                    <p className="text-sm text-muted-foreground">
                      Check available extras before starting
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>

            <Card 
              className="cursor-pointer hover:border-primary transition-colors"
              onClick={handleStartWithoutExtra}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                    <Sparkles className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="font-medium">Start Manufacturing</p>
                    <p className="text-sm text-muted-foreground">
                      Begin without extra inventory
                    </p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'extra' && (
          <div className="space-y-4">
            {fetchingExtras ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : !hasAnyExtraAvailable ? (
              <div className="text-center py-6">
                <Package className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
                <p className="text-muted-foreground">No extra inventory available for this order's products</p>
                <Button className="mt-4" onClick={() => setStep('confirm')}>
                  Continue to Start Order
                </Button>
              </div>
            ) : (
              <>
                <div className="max-h-[300px] overflow-y-auto space-y-4">
                  {orderItems.map(item => {
                    const available = getAvailableForProduct(item.product_id);
                    const selectedQty = getSelectedQuantityForOrderItem(item.id);
                    
                    if (available.length === 0) return null;

                    return (
                      <div key={item.id} className="border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-medium">{item.product.name}</p>
                            <p className="text-xs text-muted-foreground">{item.product.sku}</p>
                          </div>
                          <Badge variant="outline">
                            Need: {item.quantity} | Using: {selectedQty}
                          </Badge>
                        </div>
                        
                        <div className="space-y-2">
                          {available.map(batch => {
                            const isSelected = (selectedExtras.get(item.id) || [])
                              .some(s => s.batchId === batch.id);
                            
                            return (
                              <div 
                                key={batch.id}
                                className={`p-2 rounded border cursor-pointer transition-colors ${
                                  isSelected 
                                    ? 'border-primary bg-primary/5' 
                                    : 'hover:border-muted-foreground/50'
                                }`}
                                onClick={() => toggleBatchSelection(item.id, batch.id, batch.quantity)}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-sm">Available: {batch.quantity} units</span>
                                  {isSelected && (
                                    <Badge className="bg-primary">Selected</Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t">
                  <p className="text-sm text-muted-foreground">
                    {totalExtraSelected > 0 
                      ? `Using ${totalExtraSelected} units from extra inventory`
                      : 'No extra inventory selected'
                    }
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <Play className="h-12 w-12 mx-auto mb-3 text-primary" />
              <p className="font-medium">Ready to Start Manufacturing</p>
              <p className="text-sm text-muted-foreground mt-1">
                {totalExtraSelected > 0 
                  ? `Using ${totalExtraSelected} units from extra inventory`
                  : 'All items will enter manufacturing'
                }
              </p>
            </div>

            <div className="bg-muted rounded-lg p-3">
              <p className="text-sm font-medium mb-2">Order Items:</p>
              <ul className="space-y-1">
                {orderItems.map(item => {
                  const extraUsed = getSelectedQuantityForOrderItem(item.id);
                  const toManufacture = Math.max(0, item.quantity - extraUsed);
                  
                  return (
                    <li key={item.id} className="text-sm flex justify-between">
                      <span>{item.product.name}</span>
                      <span className="text-muted-foreground">
                        {extraUsed > 0 
                          ? `${toManufacture} to make (${extraUsed} from extra)`
                          : `${item.quantity} to make`
                        }
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        <DialogFooter>
          {step !== 'choose' && (
            <Button 
              variant="outline" 
              onClick={() => setStep(step === 'confirm' ? 'choose' : 'choose')}
              disabled={loading}
            >
              Back
            </Button>
          )}
          
          {step === 'extra' && hasAnyExtraAvailable && (
            <Button onClick={() => setStep('confirm')} disabled={fetchingExtras}>
              Continue
            </Button>
          )}
          
          {step === 'confirm' && (
            <Button onClick={handleStartOrder} disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Start Order
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
