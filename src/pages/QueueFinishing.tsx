import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { BoxAssignmentDialog } from '@/components/BoxAssignmentDialog';
import { BoxReceiveDialog } from '@/components/BoxReceiveDialog';
import { LeadTimeDialog } from '@/components/LeadTimeDialog';
import { toast } from 'sonner';
import { Sparkles, Search, Package, Box, ArrowRight } from 'lucide-react';
import { getStateLabel } from '@/lib/stateMachine';

interface Batch {
  id: string;
  batch_code: string;
  current_state: string;
  quantity: number;
  order_id: string | null;
  product_id: string;
  box_id: string | null;
  eta: string | null;
  lead_time_days: number | null;
  product: {
    id: string;
    name: string;
    sku: string;
    needs_packing: boolean;
  };
  order?: {
    order_number: string;
    priority: string;
  };
  box?: {
    id: string;
    box_code: string;
  };
}

interface BoxGroup {
  box_id: string;
  box_code: string;
  batches: Batch[];
  total_quantity: number;
}

interface ProductGroup {
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_packing: boolean;
  quantity: number;
  batches: Batch[];
}

export default function QueueFinishing() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Data states
  const [readyForFinishingBoxes, setReadyForFinishingBoxes] = useState<BoxGroup[]>([]);
  const [inFinishingProducts, setInFinishingProducts] = useState<ProductGroup[]>([]);
  
  // Selection states
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  
  // Dialog states
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [leadTimeDialogOpen, setLeadTimeDialogOpen] = useState(false);
  
  // Pending operation
  const [pendingBoxes, setPendingBoxes] = useState<BoxGroup[]>([]);

  const filteredOrderId = searchParams.get('order');

  useEffect(() => {
    fetchData();

    const channel = supabase
      .channel('finishing-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filteredOrderId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch ready_for_finishing batches (in boxes)
      let readyQuery = supabase
        .from('batches')
        .select(`
          *,
          product:products(id, name, sku, needs_packing),
          order:orders(order_number, priority)
        `)
        .eq('current_state', 'ready_for_finishing')
        .eq('is_terminated', false)
        .not('box_id', 'is', null);

      if (filteredOrderId) {
        readyQuery = readyQuery.eq('order_id', filteredOrderId);
      }

      const { data: readyData, error: readyError } = await readyQuery;
      if (readyError) throw readyError;

      // Fetch box info
      const boxIds = [...new Set(readyData?.map(b => b.box_id).filter(Boolean))];
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxes } = await supabase
          .from('boxes')
          .select('id, box_code')
          .in('id', boxIds);
        boxes?.forEach(box => boxMap.set(box.id, box));
      }

      // Group by box
      const boxGroups = new Map<string, BoxGroup>();
      readyData?.forEach(batch => {
        if (!batch.box_id) return;
        if (!boxGroups.has(batch.box_id)) {
          boxGroups.set(batch.box_id, {
            box_id: batch.box_id,
            box_code: boxMap.get(batch.box_id)?.box_code || 'Unknown',
            batches: [],
            total_quantity: 0,
          });
        }
        const group = boxGroups.get(batch.box_id)!;
        group.batches.push({ ...batch, box: boxMap.get(batch.box_id) });
        group.total_quantity += batch.quantity;
      });
      setReadyForFinishingBoxes(Array.from(boxGroups.values()));

      // Fetch in_finishing batches (by product)
      let inQuery = supabase
        .from('batches')
        .select(`
          *,
          product:products(id, name, sku, needs_packing),
          order:orders(order_number, priority)
        `)
        .eq('current_state', 'in_finishing')
        .eq('is_terminated', false);

      if (filteredOrderId) {
        inQuery = inQuery.eq('order_id', filteredOrderId);
      }

      const { data: inData, error: inError } = await inQuery;
      if (inError) throw inError;

      // Group by product
      const productGroups = new Map<string, ProductGroup>();
      inData?.forEach(batch => {
        if (!productGroups.has(batch.product_id)) {
          productGroups.set(batch.product_id, {
            product_id: batch.product_id,
            product_name: batch.product?.name || 'Unknown',
            product_sku: batch.product?.sku || 'N/A',
            needs_packing: batch.product?.needs_packing ?? true,
            quantity: 0,
            batches: [],
          });
        }
        const group = productGroups.get(batch.product_id)!;
        group.batches.push(batch);
        group.quantity += batch.quantity;
      });
      setInFinishingProducts(Array.from(productGroups.values()));

    } catch (error) {
      console.error('Error fetching finishing queue:', error);
      toast.error('Failed to load finishing queue');
    } finally {
      setLoading(false);
    }
  };

  const handleBoxToggle = (boxId: string) => {
    setSelectedBoxes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(boxId)) {
        newSet.delete(boxId);
      } else {
        newSet.add(boxId);
      }
      return newSet;
    });
  };

  const handleProductQtyChange = (productId: string, qty: number, max: number) => {
    setProductSelections(prev => {
      const newMap = new Map(prev);
      if (qty > 0 && qty <= max) {
        newMap.set(productId, qty);
      } else if (qty <= 0) {
        newMap.delete(productId);
      }
      return newMap;
    });
  };

  const handleReceiveBoxes = () => {
    if (selectedBoxes.size === 0) {
      toast.error('Please select at least one box');
      return;
    }
    const selected = readyForFinishingBoxes.filter(b => selectedBoxes.has(b.box_id));
    setPendingBoxes(selected);
    setLeadTimeDialogOpen(true);
  };

  const handleLeadTimeConfirm = async (leadTimeDays: number, eta: Date) => {
    try {
      for (const box of pendingBoxes) {
        for (const batch of box.batches) {
          await supabase
            .from('batches')
            .update({
              current_state: 'in_finishing',
              box_id: null,
              lead_time_days: leadTimeDays,
              eta: eta.toISOString(),
            })
            .eq('id', batch.id);
        }
      }

      const totalItems = pendingBoxes.reduce((sum, b) => sum + b.total_quantity, 0);
      toast.success(`${totalItems} items received into finishing`);
      
      setSelectedBoxes(new Set());
      setPendingBoxes([]);
      setLeadTimeDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error receiving boxes:', error);
      toast.error('Failed to receive boxes');
    }
  };

  const handleAssignToBox = () => {
    if (productSelections.size === 0) {
      toast.error('Please select quantities');
      return;
    }
    setAssignDialogOpen(true);
  };

  const handleBoxAssignment = async (boxId: string, boxCode: string) => {
    try {
      for (const [productId, qty] of productSelections) {
        const product = inFinishingProducts.find(p => p.product_id === productId);
        if (!product) continue;

        let remaining = qty;
        for (const batch of product.batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.quantity);

          // Determine next state based on needs_packing
          const nextState = product.needs_packing ? 'ready_for_packaging' : 'ready_for_boxing';

          if (take === batch.quantity) {
            await supabase
              .from('batches')
              .update({
                current_state: nextState,
                box_id: boxId,
              })
              .eq('id', batch.id);
          } else {
            // Split batch
            await supabase
              .from('batches')
              .update({ quantity: batch.quantity - take })
              .eq('id', batch.id);

            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: batch.order_id,
              product_id: productId,
              current_state: nextState,
              quantity: take,
              box_id: boxId,
              created_by: user?.id,
            });
          }

          remaining -= take;
        }
      }

      const totalQty = Array.from(productSelections.values()).reduce((sum, q) => sum + q, 0);
      toast.success(`${totalQty} items assigned to box ${boxCode}`);
      
      setProductSelections(new Map());
      setAssignDialogOpen(false);
      fetchData();
    } catch (error) {
      console.error('Error assigning to box:', error);
      toast.error('Failed to assign to box');
    }
  };

  const handleCreateNewBox = async () => {
    try {
      const { data: boxCode } = await supabase.rpc('generate_box_code');
      const { data: newBox, error } = await supabase
        .from('boxes')
        .insert({ box_code: boxCode || `BOX-${Date.now()}` })
        .select('id, box_code')
        .single();
      if (error) throw error;
      return newBox;
    } catch (error) {
      console.error('Error creating box:', error);
      return null;
    }
  };

  const canManage = hasRole('manufacture_lead') || hasRole('manufacturer') || hasRole('admin');

  const totalSelectedBoxItems = readyForFinishingBoxes
    .filter(b => selectedBoxes.has(b.box_id))
    .reduce((sum, b) => sum + b.total_quantity, 0);

  const totalSelectedProducts = Array.from(productSelections.values()).reduce((sum, q) => sum + q, 0);

  // Get products for box assignment dialog
  const selectedProductsForDialog = Array.from(productSelections.entries()).map(([productId, qty]) => {
    const product = inFinishingProducts.find(p => p.product_id === productId);
    return {
      product_id: productId,
      product_name: product?.product_name || 'Unknown',
      product_sku: product?.product_sku || 'N/A',
      quantity: qty,
      needs_packing: product?.needs_packing ?? true,
      batches: product?.batches.map(b => ({ id: b.id, quantity: b.quantity })) || [],
    };
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="h-6 w-6 text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold">Finishing Queue</h1>
            <p className="text-muted-foreground">
              {filteredOrderId ? 'Filtered by order' : 'All finishing items'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>
        </div>
      </div>

      {/* Ready for Finishing - Boxes to receive */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Box className="h-5 w-5 text-blue-300" />
            Ready for Finishing
            <Badge variant="secondary">{readyForFinishingBoxes.length} boxes</Badge>
          </CardTitle>
          {canManage && selectedBoxes.size > 0 && (
            <Button onClick={handleReceiveBoxes}>
              Receive {selectedBoxes.size} Box{selectedBoxes.size !== 1 ? 'es' : ''} ({totalSelectedBoxItems} items)
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {readyForFinishingBoxes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No boxes waiting for finishing</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {readyForFinishingBoxes.map((box) => (
                <div
                  key={box.box_id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedBoxes.has(box.box_id) 
                      ? 'border-primary bg-primary/5' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => canManage && handleBoxToggle(box.box_id)}
                >
                  <div className="flex items-center gap-3">
                    {canManage && (
                      <Checkbox
                        checked={selectedBoxes.has(box.box_id)}
                        onCheckedChange={() => handleBoxToggle(box.box_id)}
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-mono font-bold">{box.box_code}</p>
                      <div className="text-sm text-muted-foreground">
                        {box.batches.slice(0, 3).map((b, i) => (
                          <span key={b.id}>
                            {i > 0 && ', '}
                            {b.product?.sku} × {b.quantity}
                          </span>
                        ))}
                        {box.batches.length > 3 && <span> +{box.batches.length - 3} more</span>}
                      </div>
                    </div>
                    <Badge>{box.total_quantity}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* In Finishing - Products to process */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            In Finishing
            <Badge variant="secondary">
              {inFinishingProducts.reduce((sum, p) => sum + p.quantity, 0)} items
            </Badge>
          </CardTitle>
          {canManage && totalSelectedProducts > 0 && (
            <Button onClick={handleAssignToBox}>
              <Package className="h-4 w-4 mr-2" />
              Assign {totalSelectedProducts} to Box
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {inFinishingProducts.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No items in finishing</p>
          ) : (
            <div className="space-y-3">
              {inFinishingProducts.map((product) => (
                <div
                  key={product.product_id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium">{product.product_name}</p>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>SKU: {product.product_sku}</span>
                      {product.needs_packing ? (
                        <Badge variant="outline" className="text-xs">
                          <Package className="h-3 w-3 mr-1" />
                          Needs Packing
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          <ArrowRight className="h-3 w-3 mr-1" />
                          Direct to Boxing
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium mt-1">Available: {product.quantity}</p>
                  </div>
                  {canManage && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={product.quantity}
                        value={productSelections.get(product.product_id) || ''}
                        onChange={(e) => handleProductQtyChange(
                          product.product_id,
                          parseInt(e.target.value) || 0,
                          product.quantity
                        )}
                        placeholder="0"
                        className="w-20"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleProductQtyChange(
                          product.product_id,
                          product.quantity,
                          product.quantity
                        )}
                      >
                        All
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <LeadTimeDialog
        open={leadTimeDialogOpen}
        onOpenChange={setLeadTimeDialogOpen}
        onConfirm={handleLeadTimeConfirm}
        unitCount={totalSelectedBoxItems}
        nextState="in_finishing"
      />

      <BoxAssignmentDialog
        open={assignDialogOpen}
        onOpenChange={setAssignDialogOpen}
        onConfirm={handleBoxAssignment}
        onCreateNewBox={handleCreateNewBox}
        products={selectedProductsForDialog}
        currentState="in_finishing"
        title={`Assign ${totalSelectedProducts} item(s) to Box`}
      />
    </div>
  );
}
