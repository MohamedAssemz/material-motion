import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Box, Loader2, Plus, Search, Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ExtraBatch {
  id: string;
  batch_code: string;
  product_id: string;
  quantity: number;
  current_state: string;
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
  source_box_code: string;
  quantity: number;
  batches: ExtraBatch[];
}

interface ExtraItemsTabProps {
  orderId: string;
  phase: 'manufacturing' | 'finishing' | 'packaging' | 'boxing';
  onRefresh?: () => void;
}

// Map phase to the in_progress state for items being worked on
const PHASE_STATE_MAP: Record<string, string> = {
  manufacturing: 'in_manufacturing',
  finishing: 'in_finishing',
  packaging: 'in_packaging',
  boxing: 'in_boxing',
};

const PHASE_NEXT_STATE_MAP: Record<string, string> = {
  manufacturing: 'ready_for_finishing',
  finishing: 'ready_for_packaging',
  packaging: 'ready_for_boxing',
  boxing: 'ready_for_receiving',
};

// Map phase to the origin_state for filtering extra inventory
const PHASE_ORIGIN_STATE_MAP: Record<string, string> = {
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

export function ExtraItemsTab({ orderId, phase, onRefresh }: ExtraItemsTabProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [extraBatches, setExtraBatches] = useState<ExtraBatch[]>([]);
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  
  // Box assignment dialog
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [boxSearchCode, setBoxSearchCode] = useState('');
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [creatingBox, setCreatingBox] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchExtraBatches();
    
    const channel = supabase
      .channel(`extra-batches-${orderId}-${phase}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'batches', 
        filter: `order_id=eq.${orderId}` 
      }, () => {
        fetchExtraBatches();
      })
      .subscribe();
    
    return () => { supabase.removeChannel(channel); };
  }, [orderId, phase]);

  const fetchExtraBatches = async () => {
    setLoading(true);
    try {
      const targetState = PHASE_STATE_MAP[phase];
      
      const { data, error } = await supabase
        .from('batches')
        .select(`
          id, batch_code, product_id, quantity, current_state, box_id,
          product:products(id, name, sku)
        `)
        .eq('order_id', orderId)
        .eq('batch_type', 'EXTRA')
        .eq('current_state', targetState)
        .eq('is_terminated', false);
      
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
      
      const batchesWithBox = data?.map(batch => ({
        ...batch,
        product: batch.product as ExtraBatch['product'],
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
      })) || [];
      
      setExtraBatches(batchesWithBox);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmptyBoxes = async () => {
    setLoadingBoxes(true);
    try {
      const { data: allBoxes } = await supabase
        .from('boxes')
        .select('id, box_code')
        .eq('is_active', true)
        .order('box_code');
      const { data: occupiedBatches } = await supabase
        .from('batches')
        .select('box_id')
        .not('box_id', 'is', null)
        .eq('is_terminated', false);
      const occupiedIds = new Set(occupiedBatches?.map(b => b.box_id) || []);
      setAvailableBoxes(allBoxes?.filter(box => !occupiedIds.has(box.id)) || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingBoxes(false);
    }
  };

  const searchBox = async () => {
    if (!boxSearchCode.trim()) return;
    try {
      const { data: box } = await supabase
        .from('boxes')
        .select('id, box_code')
        .eq('box_code', boxSearchCode.trim().toUpperCase())
        .eq('is_active', true)
        .single();
      
      if (!box) {
        toast.error(`Box ${boxSearchCode} not found`);
        return;
      }
      
      const { data: existingBatch } = await supabase
        .from('batches')
        .select('id')
        .eq('box_id', box.id)
        .eq('is_terminated', false)
        .maybeSingle();
      
      if (existingBatch) {
        toast.error(`Box ${box.box_code} is already occupied`);
        return;
      }
      
      setSelectedBox(box);
      setBoxSearchCode('');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const createNewBox = async () => {
    setCreatingBox(true);
    try {
      const { data: code } = await supabase.rpc('generate_box_code');
      const { data: newBox, error } = await supabase
        .from('boxes')
        .insert({ box_code: code || `BOX-${Date.now()}` })
        .select()
        .single();
      if (error) throw error;
      setSelectedBox(newBox);
      await fetchEmptyBoxes();
      toast.success(`Created box ${newBox.box_code}`);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setCreatingBox(false);
    }
  };

  // Group batches by product
  const productGroups: ProductGroup[] = [];
  const groupMap = new Map<string, ProductGroup>();
  
  extraBatches.forEach(batch => {
    const key = batch.product_id;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        source_box_code: batch.box?.box_code || 'No Box',
        quantity: 0,
        batches: [],
      });
    }
    const group = groupMap.get(key)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
  });
  groupMap.forEach(g => productGroups.push(g));

  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);
  const totalItems = extraBatches.reduce((sum, b) => sum + b.quantity, 0);

  const handleOpenBoxDialog = () => {
    if (totalSelected === 0) {
      toast.error('Please select items first');
      return;
    }
    setSelectedBox(null);
    setBoxSearchCode('');
    fetchEmptyBoxes();
    setBoxDialogOpen(true);
  };

  const handleAssignToBox = async () => {
    if (!selectedBox || totalSelected === 0) return;
    setSubmitting(true);
    
    try {
      const nextState = PHASE_NEXT_STATE_MAP[phase];
      
      const { data: boxData } = await supabase
        .from('boxes')
        .select('items_list')
        .eq('id', selectedBox.id)
        .single();
      
      const currentItems = Array.isArray(boxData?.items_list) ? boxData.items_list : [];
      const newItems: Array<{
        product_id: string;
        product_name: string;
        product_sku: string;
        quantity: number;
        batch_id: string;
        batch_type: string;
      }> = [];
      
      for (const [productId, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        
        const group = productGroups.find(g => g.product_id === productId);
        if (!group) continue;
        
        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          
          if (useQty === batch.quantity) {
            await supabase.from('batches').update({
              current_state: nextState,
              box_id: selectedBox.id,
            }).eq('id', batch.id);
            
            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              quantity: useQty,
              batch_id: batch.id,
              batch_type: 'EXTRA',
            });
          } else {
            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            const { data: newBatch } = await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: orderId,
              product_id: batch.product_id,
              current_state: nextState,
              quantity: useQty,
              box_id: selectedBox.id,
              batch_type: 'EXTRA',
              created_by: user?.id,
              parent_batch_id_split: batch.id,
            }).select('id').single();
            
            await supabase.from('batches').update({
              quantity: batch.quantity - useQty,
            }).eq('id', batch.id);
            
            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              quantity: useQty,
              batch_id: newBatch?.id || batch.id,
              batch_type: 'EXTRA',
            });
          }
        }
      }
      
      const updatedItems = [...currentItems, ...newItems];
      await supabase.from('boxes').update({
        items_list: updatedItems,
        content_type: 'EXTRA',
      }).eq('id', selectedBox.id);
      
      toast.success(`Assigned ${totalSelected} extra items to ${selectedBox.box_code}`);
      setBoxDialogOpen(false);
      setProductSelections(new Map());
      fetchExtraBatches();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintGuide = () => {
    if (extraBatches.length === 0) {
      toast.error('No extra items to print');
      return;
    }

    // Group items by box for the guide
    const boxGroups = new Map<string, { box_code: string; items: Array<{ sku: string; name: string; qty: number }> }>();
    
    extraBatches.forEach(batch => {
      const boxCode = batch.box?.box_code || 'No Box';
      if (!boxGroups.has(boxCode)) {
        boxGroups.set(boxCode, { box_code: boxCode, items: [] });
      }
      const group = boxGroups.get(boxCode)!;
      const existing = group.items.find(i => i.sku === batch.product?.sku);
      if (existing) {
        existing.qty += batch.quantity;
      } else {
        group.items.push({
          sku: batch.product?.sku || 'N/A',
          name: batch.product?.name || 'Unknown',
          qty: batch.quantity,
        });
      }
    });

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Could not open print window');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${PHASE_LABELS[phase]} Guide</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 24px; margin-bottom: 20px; }
          .box-section { margin-bottom: 24px; page-break-inside: avoid; }
          .box-header { background: #f3f4f6; padding: 10px; font-weight: bold; font-size: 18px; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f9fafb; }
          .total { font-weight: bold; margin-top: 20px; padding: 10px; background: #f3f4f6; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>${PHASE_LABELS[phase]} - Picking Guide</h1>
        ${Array.from(boxGroups.values()).map(group => `
          <div class="box-section">
            <div class="box-header">📦 ${group.box_code}</div>
            <table>
              <thead>
                <tr><th>SKU</th><th>Product</th><th>Quantity</th></tr>
              </thead>
              <tbody>
                ${group.items.map(item => `
                  <tr><td>${item.sku}</td><td>${item.name}</td><td>${item.qty}</td></tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `).join('')}
        <div class="total">Total Items: ${totalItems}</div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {totalItems} extra items
            </Badge>
            {totalSelected > 0 && (
              <Badge variant="default" className="px-3 py-1">
                {totalSelected} selected
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrintGuide} disabled={extraBatches.length === 0}>
              <Printer className="h-4 w-4 mr-2" />
              Print Guide
            </Button>
            <Button onClick={handleOpenBoxDialog} disabled={totalSelected === 0}>
              <Box className="h-4 w-4 mr-2" />
              Assign to Box
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Extra Items List */}
      <div className="space-y-3">
        {productGroups.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No extra items in this phase
            </CardContent>
          </Card>
        ) : (
          productGroups.map(group => (
            <Card key={group.product_id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{group.product_name}</p>
                      <Badge variant="outline" className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                        Extra
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {group.product_sku}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Source: {group.batches.map(b => b.box?.box_code || 'No Box').filter((v, i, a) => a.indexOf(v) === i).join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-lg font-semibold">{group.quantity}</p>
                      <p className="text-xs text-muted-foreground">Available</p>
                    </div>
                    <div className="w-24">
                      <Label className="text-xs">Select Qty</Label>
                      <Input
                        type="number"
                        min={0}
                        max={group.quantity}
                        value={productSelections.get(group.product_id) || ''}
                        onChange={(e) => {
                          const qty = Math.max(0, Math.min(parseInt(e.target.value) || 0, group.quantity));
                          setProductSelections(prev => {
                            const next = new Map(prev);
                            if (qty > 0) next.set(group.product_id, qty);
                            else next.delete(group.product_id);
                            return next;
                          });
                        }}
                        placeholder="0"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Box Assignment Dialog */}
      <Dialog open={boxDialogOpen} onOpenChange={setBoxDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Extra Items to Box</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Search Box</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={boxSearchCode}
                  onChange={(e) => setBoxSearchCode(e.target.value)}
                  placeholder="Enter box code..."
                  onKeyDown={(e) => e.key === 'Enter' && searchBox()}
                />
                <Button variant="outline" onClick={searchBox}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div>
              <Label>Or Select Available Box</Label>
              {loadingBoxes ? (
                <div className="flex items-center gap-2 mt-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading boxes...</span>
                </div>
              ) : (
                <Select
                  value={selectedBox?.id || ''}
                  onValueChange={(value) => {
                    const box = availableBoxes.find(b => b.id === value);
                    setSelectedBox(box || null);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a box" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBoxes.map(box => (
                      <SelectItem key={box.id} value={box.id}>
                        {box.box_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <Button variant="outline" onClick={createNewBox} disabled={creatingBox} className="w-full">
              {creatingBox ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Create New Box
            </Button>

            {selectedBox && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Selected: {selectedBox.box_code}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignToBox} disabled={!selectedBox || submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Assign {totalSelected} Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
