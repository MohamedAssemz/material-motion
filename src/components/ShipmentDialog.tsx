import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/lib/auditLog';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Package, Truck, Printer } from 'lucide-react';
import { escapeHtml } from '@/lib/sanitize';

interface ProductSelection {
  product_id: string;
  product_name: string;
  product_sku: string;
  available_quantity: number;
  selected_quantity: number;
  batches: Array<{ id: string; quantity: number }>;
}

interface ShipmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderNumber: string;
  receivedBatches: Array<{
    id: string;
    batch_code: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
  }>;
  onRefresh: () => void;
}

export function ShipmentDialog({
  open,
  onOpenChange,
  orderId,
  orderNumber,
  receivedBatches,
  onRefresh,
}: ShipmentDialogProps) {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductSelection[]>([]);
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      // Group batches by product
      const productMap = new Map<string, ProductSelection>();
      
      receivedBatches.forEach(batch => {
        if (!productMap.has(batch.product_id)) {
          productMap.set(batch.product_id, {
            product_id: batch.product_id,
            product_name: batch.product_name,
            product_sku: batch.product_sku,
            available_quantity: 0,
            selected_quantity: 0,
            batches: [],
          });
        }
        const item = productMap.get(batch.product_id)!;
        item.available_quantity += batch.quantity;
        item.batches.push({ id: batch.id, quantity: batch.quantity });
      });

      setProducts(Array.from(productMap.values()));
    }
  }, [open, receivedBatches]);

  const handleQuantityChange = (productId: string, qty: number) => {
    setProducts(prev => prev.map(p => {
      if (p.product_id === productId) {
        return {
          ...p,
          selected_quantity: Math.min(Math.max(0, qty), p.available_quantity)
        };
      }
      return p;
    }));
  };

  const handleSelectAll = (productId: string) => {
    setProducts(prev => prev.map(p => {
      if (p.product_id === productId) {
        return { ...p, selected_quantity: p.available_quantity };
      }
      return p;
    }));
  };

  const handleCreateShipment = async () => {
    const selectedProducts = products.filter(p => p.selected_quantity > 0);
    
    if (selectedProducts.length === 0) {
      toast.error('Please select at least one product');
      return;
    }

    setCreating(true);
    try {
      // Generate shipment code
      const { data: shipmentCode } = await supabase.rpc('generate_shipment_code');

      // Create shipment
      const { data: shipment, error: shipmentError } = await supabase
        .from('shipments')
        .insert({
          shipment_code: shipmentCode || `SHP-${Date.now()}`,
          order_id: orderId,
          status: 'sealed',
          created_by: user?.id,
          sealed_at: new Date().toISOString(),
          sealed_by: user?.id,
          notes: notes.trim() || null,
        })
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // Update batch states and link to shipment
      for (const product of selectedProducts) {
        let remaining = product.selected_quantity;
        
        for (const batch of product.batches) {
          if (remaining <= 0) break;
          
          const take = Math.min(remaining, batch.quantity);

          // Update batch - mark as shipped and link to shipment
          if (take === batch.quantity) {
            await supabase
              .from('order_batches')
              .update({ 
                current_state: 'shipped',
                shipment_id: shipment.id,
              })
              .eq('id', batch.id);
          } else {
            // Split batch - reduce original, create new shipped batch
            await supabase
              .from('order_batches')
              .update({ quantity: batch.quantity - take })
              .eq('id', batch.id);
            
            // Create new batch for shipped quantity
            const { data: qrCode } = await supabase.rpc('generate_extra_batch_code');
            await supabase.from('order_batches').insert({
              qr_code_data: qrCode,
              order_id: orderId,
              product_id: product.product_id,
              current_state: 'shipped',
              quantity: take,
              created_by: user?.id,
              shipment_id: shipment.id,
            });
          }

          remaining -= take;
        }
      }

      const totalQty = selectedProducts.reduce((sum, p) => sum + p.selected_quantity, 0);

      // Log activity
      if (user) {
        await supabase.from("order_activity_logs").insert({
          order_id: orderId,
          action: "shipment_created",
          performed_by: user.id,
          details: { shipment_code: shipmentCode, total_qty: totalQty },
        });
        logAudit({
          action: "shipment.created",
          entity_type: "shipment",
          entity_id: shipment.id,
          module: "shipments",
          order_id: orderId,
          metadata: {
            shipment_code: shipmentCode,
            total_qty: totalQty,
            item_count: selectedProducts.filter((p) => p.selected_quantity > 0).length,
          },
        });
      }

      toast.success(`Shipment ${shipmentCode} created with ${totalQty} items`);
      
      // Open print dialog
      printShipmentLabel(shipmentCode, orderNumber, selectedProducts, notes);
      
      onRefresh();
      onOpenChange(false);
    } catch (error) {
      console.error('Error creating shipment:', error);
      toast.error('Failed to create shipment');
    } finally {
      setCreating(false);
    }
  };

  const printShipmentLabel = (
    code: string,
    orderNum: string,
    items: ProductSelection[],
    shipmentNotes: string
  ) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shipment Label - ${code}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px;
              max-width: 600px;
              margin: 0 auto;
            }
            .header { 
              text-align: center; 
              border-bottom: 3px solid black; 
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .shipment-code { 
              font-size: 36px; 
              font-weight: bold; 
              font-family: monospace;
            }
            .order-info { 
              font-size: 18px; 
              margin-top: 10px;
            }
            .items { 
              margin: 20px 0; 
            }
            .item { 
              display: flex; 
              justify-content: space-between;
              padding: 8px 0;
              border-bottom: 1px solid #ccc;
            }
            .notes { 
              margin-top: 20px; 
              padding: 10px;
              background: #f5f5f5;
              border-radius: 4px;
            }
            .footer { 
              margin-top: 30px; 
              text-align: center;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="shipment-code">${escapeHtml(code)}</div>
            <div class="order-info">Order: ${escapeHtml(orderNum)}</div>
            <div style="margin-top: 5px; color: #666;">
              Created: ${new Date().toLocaleString()}
            </div>
          </div>
          
          <div class="items">
            <h3>Contents:</h3>
            ${items.map(item => `
              <div class="item">
                <span>${escapeHtml(item.product_name)} (${escapeHtml(item.product_sku)})</span>
                <strong>${item.selected_quantity} units</strong>
              </div>
            `).join('')}
            <div class="item" style="font-weight: bold; border-bottom: none;">
              <span>Total</span>
              <span>${items.reduce((sum, i) => sum + i.selected_quantity, 0)} units</span>
            </div>
          </div>

          ${shipmentNotes ? `
            <div class="notes">
              <strong>Notes:</strong> ${escapeHtml(shipmentNotes)}
            </div>
          ` : ''}

          <div class="footer">
            Miracle Medical Products Factory
          </div>
          
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

  const totalSelected = products.reduce((sum, p) => sum + p.selected_quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Create New Shipment (Cartona)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            Select products and quantities to include in this shipment box.
          </div>

          {/* Product selection */}
          <div className="space-y-3">
            {products.map((product) => (
              <div 
                key={product.product_id}
                className="flex items-center gap-4 p-4 border rounded-lg"
              >
                <div className="flex-1">
                  <p className="font-medium">{product.product_name}</p>
                  <p className="text-sm text-muted-foreground">{product.product_sku}</p>
                </div>
                <div className="flex items-center gap-2">
                  <NumericInput
                    min={0}
                    max={product.available_quantity}
                    value={product.selected_quantity || undefined}
                    onValueChange={(val) => handleQuantityChange(product.product_id, val ?? 0)}
                    className="w-24"
                    placeholder="0"
                  />
                  <span className="text-sm text-muted-foreground">
                    / {product.available_quantity}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSelectAll(product.product_id)}
                  >
                    All
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div>
            <Label>Shipment Notes (optional)</Label>
            <Textarea
              placeholder="Add any notes for this shipment..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Summary and actions */}
          <div className="flex items-center justify-between pt-4 border-t">
            <div className="text-sm">
              {totalSelected > 0 ? (
                <span className="font-medium">{totalSelected} items selected</span>
              ) : (
                <span className="text-muted-foreground">No items selected</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateShipment}
                disabled={creating || totalSelected === 0}
              >
                <Package className="h-4 w-4 mr-2" />
                {creating ? 'Creating...' : 'Create & Print Label'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
