import { useState } from "react";
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
import { Play, Loader2 } from "lucide-react";

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

  const handleStartOrder = async () => {
    setLoading(true);
    try {
      // Transition all order batches from pending_rm to in_manufacturing
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
    } catch (error: any) {
      console.error('Error starting order:', error);
      toast.error(error.message || 'Failed to start order');
    } finally {
      setLoading(false);
    }
  };

  const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);

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
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-3">Items to Manufacture:</p>
            <ul className="space-y-2">
              {orderItems.map(item => (
                <li key={item.id} className="text-sm flex justify-between items-center">
                  <div>
                    <span className="font-medium">{item.product.name}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{item.product.sku}</span>
                  </div>
                  <span className="font-semibold">{item.quantity}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 pt-3 border-t flex justify-between text-sm font-medium">
              <span>Total</span>
              <span>{totalQuantity} units</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleStartOrder} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Start Manufacturing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
