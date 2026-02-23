import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Play, Loader2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    sku: string;
  };
}

interface PendingBatch {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
}

interface ReservedExtraItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
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
  const [loading, setLoading] = useState(false);
  const [pendingBatches, setPendingBatches] = useState<PendingBatch[]>([]);
  const [reservedExtraItems, setReservedExtraItems] = useState<ReservedExtraItem[]>([]);
  const [fetchingBatches, setFetchingBatches] = useState(false);

  useEffect(() => {
    if (open && orderId) {
      fetchPendingBatches();
    }
  }, [open, orderId]);

  const fetchPendingBatches = async () => {
    setFetchingBatches(true);
    try {
      // Fetch pending_rm batches and reserved extra batches in parallel
      const [batchesResult, extraResult] = await Promise.all([
        supabase
          .from('order_batches')
          .select(`id, product_id, quantity, product:products(id, name, sku)`)
          .eq('order_id', orderId)
          .eq('current_state', 'pending_rm'),
        supabase
          .from('extra_batches')
          .select(`id, product_id, quantity, product:products(id, name, sku)`)
          .eq('order_id', orderId)
          .eq('inventory_state', 'RESERVED'),
      ]);

      if (batchesResult.error) throw batchesResult.error;
      if (extraResult.error) throw extraResult.error;

      // Group pending batches by product
      const grouped = (batchesResult.data || []).reduce((acc: Record<string, PendingBatch>, batch: any) => {
        const productId = batch.product_id;
        if (!acc[productId]) {
          acc[productId] = {
            product_id: productId,
            product_name: batch.product?.name || 'Unknown',
            product_sku: batch.product?.sku || '',
            quantity: 0,
          };
        }
        acc[productId].quantity += batch.quantity;
        return acc;
      }, {});
      setPendingBatches(Object.values(grouped));

      // Group reserved extra items by product
      const extraGrouped = (extraResult.data || []).reduce((acc: Record<string, ReservedExtraItem>, batch: any) => {
        const productId = batch.product_id;
        if (!acc[productId]) {
          acc[productId] = {
            product_id: productId,
            product_name: batch.product?.name || 'Unknown',
            product_sku: batch.product?.sku || '',
            quantity: 0,
          };
        }
        acc[productId].quantity += batch.quantity;
        return acc;
      }, {});
      setReservedExtraItems(Object.values(extraGrouped));
    } catch (error: any) {
      console.error('Error fetching pending batches:', error);
      toast.error('Failed to load pending batches');
    } finally {
      setFetchingBatches(false);
    }
  };

  const handleStartOrder = async () => {
    setLoading(true);
    try {
      // Transition pending_rm batches to in_manufacturing (if any exist)
      if (pendingBatches.length > 0) {
        const { error: updateError } = await supabase
          .from('order_batches')
          .update({ 
            current_state: 'in_manufacturing',
            updated_at: new Date().toISOString(),
          })
          .eq('order_id', orderId)
          .eq('current_state', 'pending_rm');

        if (updateError) throw updateError;
      }

      // Update order status to in_progress
      await supabase
        .from('orders')
        .update({ status: 'in_progress' })
        .eq('id', orderId);

      toast.success('Order started successfully');
      onOrderStarted();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error starting order:', error);
      toast.error(error.message || 'Failed to start order');
    } finally {
      setLoading(false);
    }
  };

  const totalPendingQty = pendingBatches.reduce((sum, b) => sum + b.quantity, 0);
  const totalExtraQty = reservedExtraItems.reduce((sum, b) => sum + b.quantity, 0);
  const hasAnythingToStart = pendingBatches.length > 0 || reservedExtraItems.length > 0;
  const isFullyFromExtra = pendingBatches.length === 0 && reservedExtraItems.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="h-5 w-5 text-primary" />
            Start Order
          </DialogTitle>
          <DialogDescription>
            Confirm to begin manufacturing
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {fetchingBatches ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasAnythingToStart ? (
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground text-center py-2">
                No pending items to manufacture
              </p>
            </div>
          ) : (
            <>
              {/* Pending manufacturing batches */}
              {pendingBatches.length > 0 && (
                <div className="bg-muted rounded-lg p-4">
                  <p className="text-sm font-medium mb-3">Items to Manufacture:</p>
                  <ul className="space-y-2">
                    {pendingBatches.map(batch => (
                      <li key={batch.product_id} className="text-sm flex justify-between items-center">
                        <div>
                          <span className="font-medium">{batch.product_name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{batch.product_sku}</span>
                        </div>
                        <span className="font-semibold">{batch.quantity}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 pt-3 border-t flex justify-between text-sm font-medium">
                    <span>Total</span>
                    <span>{totalPendingQty} units</span>
                  </div>
                </div>
              )}

              {/* Reserved extra inventory items */}
              {reservedExtraItems.length > 0 && (
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">From Extra Inventory:</p>
                    <Badge variant="secondary" className="text-xs">Reserved</Badge>
                  </div>
                  <ul className="space-y-2">
                    {reservedExtraItems.map(item => (
                      <li key={item.product_id} className="text-sm flex justify-between items-center">
                        <div>
                          <span className="font-medium">{item.product_name}</span>
                          <span className="text-muted-foreground ml-2 text-xs">{item.product_sku}</span>
                        </div>
                        <span className="font-semibold">{item.quantity}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 pt-3 border-t flex justify-between text-sm font-medium">
                    <span>Total</span>
                    <span>{totalExtraQty} units</span>
                  </div>
                </div>
              )}

              {isFullyFromExtra && (
                <p className="text-sm text-muted-foreground text-center">
                  All items will be fulfilled from extra inventory
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleStartOrder} disabled={loading || fetchingBatches || !hasAnythingToStart}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Start Manufacturing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
