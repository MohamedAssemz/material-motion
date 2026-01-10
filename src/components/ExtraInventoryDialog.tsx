import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Search, Box, Package, Loader2, Printer } from 'lucide-react';

interface ExtraBatch {
  id: string;
  batch_code: string;
  product_id: string;
  quantity: number;
  current_state: string;
  inventory_state: string;
  box_id: string | null;
  product: {
    id: string;
    name: string;
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
  boxes: Array<{
    box_id: string | null;
    box_code: string;
    batches: ExtraBatch[];
    totalQty: number;
  }>;
  totalQty: number;
}

interface OrderItem {
  product_id: string;
  quantity: number;
}

interface ExtraInventoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: 'manufacturing' | 'finishing' | 'packaging' | 'boxing';
  orderId: string;
  orderItems: OrderItem[];
  onItemsSelected: (selections: Array<{ batch_id: string; quantity: number; product_id: string }>) => void;
}

// Map phase to the origin_state used in extra inventory
const PHASE_ORIGIN_STATE_MAP: Record<string, string> = {
  manufacturing: 'extra_manufacturing',
  finishing: 'extra_finishing',
  packaging: 'extra_packaging',
  boxing: 'extra_boxing',
};

// Map phase to the current_state that extra batches are at
const PHASE_CURRENT_STATE_MAP: Record<string, string> = {
  manufacturing: 'ready_for_finishing',
  finishing: 'ready_for_packaging',
  packaging: 'ready_for_boxing',
  boxing: 'ready_for_receiving',
};

const PHASE_LABELS: Record<string, string> = {
  manufacturing: 'Extra Manufacturing',
  finishing: 'Extra Finishing',
  packaging: 'Extra Packaging',
  boxing: 'Extra Boxing',
};

export function ExtraInventoryDialog({
  open,
  onOpenChange,
  phase,
  orderId,
  orderItems,
  onItemsSelected,
}: ExtraInventoryDialogProps) {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<ExtraBatch[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
  const [submitting, setSubmitting] = useState(false);

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
      const targetOriginState = PHASE_ORIGIN_STATE_MAP[phase];
      const targetCurrentState = PHASE_CURRENT_STATE_MAP[phase];
      
      // Get product IDs from order items
      const orderProductIds = orderItems.map(oi => oi.product_id);
      
      if (orderProductIds.length === 0) {
        setBatches([]);
        setLoading(false);
        return;
      }
      
      const { data, error } = await supabase
        .from('batches')
        .select(`
          id,
          batch_code,
          product_id,
          quantity,
          current_state,
          inventory_state,
          box_id,
          product:products(id, name, sku)
        `)
        .eq('batch_type', 'EXTRA')
        .eq('inventory_state', 'AVAILABLE')
        .eq('is_terminated', false)
        .eq('origin_state', targetOriginState)
        .eq('current_state', targetCurrentState)
        .in('product_id', orderProductIds);

      if (error) throw error;

      // Fetch box info
      const boxIds = data?.filter(b => b.box_id).map(b => b.box_id) || [];
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase
          .from('boxes')
          .select('id, box_code')
          .in('id', [...new Set(boxIds)]);
        boxesData?.forEach(box => boxMap.set(box.id, box));
      }

      const batchesWithBoxes = data?.map(batch => ({
        ...batch,
        product: batch.product as unknown as { id: string; name: string; sku: string },
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
      })) || [];

      setBatches(batchesWithBoxes);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Group batches by product, then by box
  const productGroups: ProductGroup[] = [];
  const productMap = new Map<string, ProductGroup>();

  batches.forEach(batch => {
    if (!productMap.has(batch.product_id)) {
      productMap.set(batch.product_id, {
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        boxes: [],
        totalQty: 0,
      });
    }
    const group = productMap.get(batch.product_id)!;
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

  // Get max quantity for a product based on order items
  const getMaxForProduct = (productId: string): number => {
    const orderItem = orderItems.find(oi => oi.product_id === productId);
    return orderItem?.quantity || 0;
  };

  const handleQuantityChange = (batchId: string, value: number, maxAvailable: number, productId: string) => {
    const maxOrder = getMaxForProduct(productId);
    // Get current total selected for this product (excluding current batch)
    let currentProductTotal = 0;
    batches.forEach(b => {
      if (b.product_id === productId && b.id !== batchId) {
        currentProductTotal += selections.get(b.id) || 0;
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

  const handleConfirm = async () => {
    if (totalSelected === 0) return;
    setSubmitting(true);

    try {
      const selectedItems: Array<{ batch_id: string; quantity: number; product_id: string }> = [];
      
      for (const [batchId, quantity] of selections.entries()) {
        if (quantity > 0) {
          const batch = batches.find(b => b.id === batchId);
          if (batch) {
            selectedItems.push({
              batch_id: batchId,
              quantity,
              product_id: batch.product_id,
            });
          }
        }
      }

      onItemsSelected(selectedItems);
      onOpenChange(false);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
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
        product_name: batch.product.name,
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
          
          <script>window.print();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>{PHASE_LABELS[phase]}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
                  const maxOrder = getMaxForProduct(group.product_id);
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
                                <span className="text-sm text-muted-foreground">
                                  Available: {batch.quantity}
                                </span>
                                <div className="ml-auto flex items-center gap-2">
                                  <Label className="text-xs">Qty:</Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    max={batch.quantity}
                                    value={selections.get(batch.id) || ''}
                                    onChange={e => handleQuantityChange(
                                      batch.id, 
                                      parseInt(e.target.value) || 0, 
                                      batch.quantity,
                                      batch.product_id
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
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Add to Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
