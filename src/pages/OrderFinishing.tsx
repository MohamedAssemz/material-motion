import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Sparkles, 
  Box, 
  Loader2, 
  QrCode, 
  Plus,
  Search,
  CheckSquare
} from 'lucide-react';
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

interface Batch {
  id: string;
  batch_code: string;
  current_state: string;
  quantity: number;
  product_id: string;
  order_item_id: string | null;
  box_id: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    needs_packing: boolean;
  };
  box?: {
    id: string;
    box_code: string;
  } | null;
  order_item?: { id: string; needs_boxing: boolean } | null;
}

interface Order {
  id: string;
  order_number: string;
  priority: string;
  customer?: { name: string };
}

interface BoxGroup {
  box_id: string;
  box_code: string;
  batches: Batch[];
  totalQty: number;
}

// Group by order_item_id to preserve order item identity
interface OrderItemGroup {
  order_item_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_packing: boolean;
  needs_boxing: boolean;
  quantity: number;
  batches: Batch[];
}

export default function OrderFinishing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [completedBatches, setCompletedBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection states
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [etaDays, setEtaDays] = useState('1');
  const [receiveSearchQuery, setReceiveSearchQuery] = useState('');
  
  // Dialog states
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [boxAssignDialogOpen, setBoxAssignDialogOpen] = useState(false);
  const [boxSearchCode, setBoxSearchCode] = useState('');
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [creatingBox, setCreatingBox] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canManage = hasRole('manufacture_lead') || hasRole('packaging_manager') || hasRole('packer') || hasRole('admin');

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel(`order-finishing-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches', filter: `order_id=eq.${id}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const fetchData = async () => {
    try {
      const [orderRes, batchesRes, completedRes] = await Promise.all([
        supabase.from('orders').select('id, order_number, priority, customer:customers(name)').eq('id', id).single(),
        supabase.from('batches')
          .select('id, batch_code, current_state, quantity, product_id, order_item_id, box_id, product:products(id, name, sku, needs_packing)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['ready_for_finishing', 'in_finishing']),
        // Fetch completed items for this phase (moved to next phases)
        supabase.from('batches')
          .select('id, batch_code, current_state, quantity, product_id, order_item_id, box_id, product:products(id, name, sku, needs_packing)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['ready_for_packaging', 'in_packaging', 'ready_for_boxing', 'in_boxing', 'ready_for_receiving', 'received'])
      ]);
      
      if (orderRes.error) throw orderRes.error;
      if (batchesRes.error) throw batchesRes.error;
      
      // Fetch box info for all batches
      const allBatchData = [...(batchesRes.data || []), ...(completedRes.data || [])];
      const boxIds = allBatchData.filter((b: any) => b.box_id).map((b: any) => b.box_id);
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase.from('boxes').select('id, box_code').in('id', [...new Set(boxIds)]);
        boxesData?.forEach(box => boxMap.set(box.id, box));
      }
      
      // Fetch order_item info for needs_boxing
      const orderItemIds = allBatchData.filter((b: any) => b.order_item_id).map((b: any) => b.order_item_id);
      let orderItemMap = new Map();
      if (orderItemIds.length > 0) {
        const { data: orderItemsData } = await supabase.from('order_items').select('id, needs_boxing').in('id', [...new Set(orderItemIds)]);
        orderItemsData?.forEach(oi => orderItemMap.set(oi.id, oi));
      }
      
      const batchesWithData = batchesRes.data?.map((batch: any) => ({
        ...batch,
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
        order_item: batch.order_item_id ? orderItemMap.get(batch.order_item_id) : null,
      })) || [];
      
      const completedWithData = completedRes.data?.map((batch: any) => ({
        ...batch,
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
        order_item: batch.order_item_id ? orderItemMap.get(batch.order_item_id) : null,
      })) || [];
      
      setOrder(orderRes.data as Order);
      setBatches(batchesWithData as Batch[]);
      setCompletedBatches(completedWithData as Batch[]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmptyBoxes = async () => {
    setLoadingBoxes(true);
    try {
      const { data: allBoxes } = await supabase.from('boxes').select('id, box_code').eq('is_active', true).order('box_code');
      const { data: occupiedBatches } = await supabase.from('batches').select('box_id').not('box_id', 'is', null).eq('is_terminated', false);
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
      const { data: newBox, error } = await supabase.from('boxes').insert({ box_code: code || `BOX-${Date.now()}` }).select().single();
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

  // Group ready_for_finishing by box
  const readyBoxGroups: BoxGroup[] = [];
  const boxMap = new Map<string, BoxGroup>();
  batches.filter(b => b.current_state === 'ready_for_finishing' && b.box_id).forEach(batch => {
    if (!boxMap.has(batch.box_id!)) {
      boxMap.set(batch.box_id!, {
        box_id: batch.box_id!,
        box_code: batch.box?.box_code || 'Unknown',
        batches: [],
        totalQty: 0,
      });
    }
    const group = boxMap.get(batch.box_id!)!;
    group.batches.push(batch);
    group.totalQty += batch.quantity;
  });
  boxMap.forEach(g => readyBoxGroups.push(g));

  // Group in_finishing by order_item_id to preserve identity
  const inFinishingGroups: OrderItemGroup[] = [];
  const orderItemGroupMap = new Map<string, OrderItemGroup>();
  batches.filter(b => b.current_state === 'in_finishing').forEach(batch => {
    const key = batch.order_item_id || batch.product_id;
    if (!orderItemGroupMap.has(key)) {
      orderItemGroupMap.set(key, {
        order_item_id: batch.order_item_id || '',
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        needs_packing: batch.product?.needs_packing ?? true,
        needs_boxing: batch.order_item?.needs_boxing ?? true,
        quantity: 0,
        batches: [],
      });
    }
    const group = orderItemGroupMap.get(key)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
  });
  orderItemGroupMap.forEach(g => inFinishingGroups.push(g));

  // Group completed items by order_item_id
  const completedGroups: OrderItemGroup[] = [];
  const completedGroupMap = new Map<string, OrderItemGroup>();
  completedBatches.forEach(batch => {
    const key = batch.order_item_id || batch.product_id;
    if (!completedGroupMap.has(key)) {
      completedGroupMap.set(key, {
        order_item_id: batch.order_item_id || '',
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        needs_packing: batch.product?.needs_packing ?? true,
        needs_boxing: batch.order_item?.needs_boxing ?? true,
        quantity: 0,
        batches: [],
      });
    }
    const group = completedGroupMap.get(key)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
  });
  completedGroupMap.forEach(g => completedGroups.push(g));

  const totalReadyForFinishing = readyBoxGroups.reduce((sum, g) => sum + g.totalQty, 0);
  const totalInFinishing = inFinishingGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalCompleted = completedGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);

  // Filter boxes based on search query (box code, product SKU, or product name)
  const filteredReadyBoxGroups = receiveSearchQuery.trim()
    ? readyBoxGroups.filter(group => {
        const query = receiveSearchQuery.trim().toUpperCase();
        if (group.box_code.toUpperCase().includes(query)) return true;
        return group.batches.some(b => 
          b.product?.sku?.toUpperCase().includes(query) ||
          b.product?.name?.toUpperCase().includes(query)
        );
      })
    : readyBoxGroups;

  const handleSelectAllBoxes = () => {
    if (selectedBoxes.size === filteredReadyBoxGroups.length) {
      setSelectedBoxes(new Set());
    } else {
      setSelectedBoxes(new Set(filteredReadyBoxGroups.map(g => g.box_id)));
    }
  };

  const handleAcceptBoxes = async () => {
    if (selectedBoxes.size === 0) return;
    setSubmitting(true);
    
    try {
      const etaDate = new Date();
      etaDate.setDate(etaDate.getDate() + parseInt(etaDays) || 1);
      
      const batchIds = batches
        .filter(b => b.current_state === 'ready_for_finishing' && b.box_id && selectedBoxes.has(b.box_id))
        .map(b => b.id);
      
      // Clear box_id when receiving - boxes become available again
      await supabase.from('batches').update({
        current_state: 'in_finishing',
        eta: etaDate.toISOString(),
        lead_time_days: parseInt(etaDays) || 1,
        box_id: null, // Free up the box
      }).in('id', batchIds);
      
      toast.success(`Accepted ${selectedBoxes.size} box(es) into finishing`);
      setSelectedBoxes(new Set());
      setAcceptDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAssignDialog = () => {
    if (totalSelected === 0) {
      toast.error('Please select items first');
      return;
    }
    setSelectedBox(null);
    setBoxSearchCode('');
    fetchEmptyBoxes();
    setBoxAssignDialogOpen(true);
  };

  const handleAssignToBox = async () => {
    if (!selectedBox || totalSelected === 0) return;
    setSubmitting(true);
    
    try {
      // Get current box data for items_list
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
        needs_boxing: boolean;
      }> = [];

      for (const [key, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        
        const group = inFinishingGroups.find(g => (g.order_item_id || g.product_id) === key);
        if (!group) continue;
        
        // Determine next state based on needs_packing
        const nextState = group.needs_packing ? 'ready_for_packaging' : 'ready_for_boxing';
        
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
              batch_type: 'ORDER',
              needs_boxing: group.needs_boxing,
            });
          } else {
            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            const { data: newBatch } = await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: nextState,
              quantity: useQty,
              box_id: selectedBox.id,
              created_by: user?.id,
              parent_batch_id_split: batch.id,
            }).select('id').single();
            
            await supabase.from('batches').update({ quantity: batch.quantity - useQty }).eq('id', batch.id);
            
            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              quantity: useQty,
              batch_id: newBatch?.id || batch.id,
              batch_type: 'ORDER',
              needs_boxing: group.needs_boxing,
            });
          }
        }
      }
      
      // Update box with new items_list and content_type
      const updatedItems = [...currentItems, ...newItems];
      await supabase.from('boxes').update({
        items_list: updatedItems,
        content_type: 'ORDER',
      }).eq('id', selectedBox.id);
      
      toast.success(`Assigned ${totalSelected} items to ${selectedBox.box_code}`);
      setBoxAssignDialogOpen(false);
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate('/orders')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-center text-muted-foreground mt-8">Order not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/queues/finishing')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Finishing</h1>
              <p className="text-muted-foreground">
                {order.order_number} {order.customer?.name && `· ${order.customer.name}`}
                {order.priority === 'high' && <Badge variant="destructive" className="ml-2">High Priority</Badge>}
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/orders/${id}`)}>
          View Order Details
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Ready for Finishing</p>
            <p className="text-2xl font-bold text-warning">{totalReadyForFinishing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">In Finishing</p>
            <p className="text-2xl font-bold text-primary">{totalInFinishing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Boxes Waiting</p>
            <p className="text-2xl font-bold">{readyBoxGroups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Products in Finishing</p>
            <p className="text-2xl font-bold">{inFinishingGroups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-600">{totalCompleted}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="receive" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="receive">Receive ({readyBoxGroups.length})</TabsTrigger>
          <TabsTrigger value="process">Process ({totalInFinishing})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({totalCompleted})</TabsTrigger>
        </TabsList>

        <TabsContent value="receive" className="space-y-4">
          {canManage && readyBoxGroups.length > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="outline" size="sm" onClick={handleSelectAllBoxes}>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    {selectedBoxes.size === filteredReadyBoxGroups.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <div>
                    <Label className="text-xs text-muted-foreground">ETA (days)</Label>
                    <Select value={etaDays} onValueChange={setEtaDays}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 5, 7, 10, 14].map(d => (
                          <SelectItem key={d} value={d.toString()}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => setAcceptDialogOpen(true)} disabled={selectedBoxes.size === 0}>
                  Accept {selectedBoxes.size} Box(es)
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Search Box */}
          <Card>
            <CardContent className="p-4">
              <Label>Search by Box Code, Product SKU, or Name</Label>
              <div className="flex gap-2 mt-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={receiveSearchQuery}
                    onChange={(e) => setReceiveSearchQuery(e.target.value)}
                    placeholder="Type to filter boxes..."
                    className="pl-10"
                    onBlur={() => {
                      if (!receiveSearchQuery.trim()) {
                        setReceiveSearchQuery('');
                      }
                    }}
                  />
                </div>
                {receiveSearchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setReceiveSearchQuery('')}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Boxes List */}
          <div className="space-y-3">
            {filteredReadyBoxGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {receiveSearchQuery.trim() 
                    ? `No boxes matching "${receiveSearchQuery}"` 
                    : 'No boxes ready for finishing'}
                </CardContent>
              </Card>
            ) : (
              filteredReadyBoxGroups.map(group => (
                <Card key={group.box_id} className={selectedBoxes.has(group.box_id) ? 'border-primary' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {canManage && (
                        <Checkbox
                          checked={selectedBoxes.has(group.box_id)}
                          onCheckedChange={(checked) => {
                            setSelectedBoxes(prev => {
                              const next = new Set(prev);
                              if (checked) next.add(group.box_id);
                              else next.delete(group.box_id);
                              return next;
                            });
                          }}
                        />
                      )}
                      <div className="flex items-center gap-3">
                        <Box className="h-5 w-5 text-muted-foreground" />
                        <span className="font-mono font-bold">{group.box_code}</span>
                      </div>
                      <Badge variant="secondary">{group.totalQty} items</Badge>
                      <div className="flex-1 text-sm text-muted-foreground">
                        {group.batches.map(b => `${b.product?.sku} - ${b.product?.name} (${b.quantity})`).join(', ')}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="process" className="space-y-4">
          {canManage && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <Badge variant="secondary" className="text-lg px-3 py-1">{totalSelected} selected</Badge>
                <Button onClick={handleOpenAssignDialog} disabled={totalSelected === 0}>
                  <Box className="h-4 w-4 mr-2" />
                  Assign to Box
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {inFinishingGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No items in finishing</CardContent></Card>
            ) : (
              inFinishingGroups.map(group => {
                const key = group.order_item_id || group.product_id;
                return (
                <Card key={key}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{group.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {group.product_sku}
                          <Badge variant="outline" className="ml-2 text-xs">
                            {group.needs_packing ? '→ Packaging' : '→ Boxing'}
                          </Badge>
                          <Badge variant={group.needs_boxing ? 'default' : 'secondary'} className="ml-1 text-xs">
                            {group.needs_boxing ? 'Boxing' : 'No Boxing'}
                          </Badge>
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-lg font-semibold">{group.quantity}</p>
                          <p className="text-xs text-muted-foreground">In Finishing</p>
                        </div>
                        {canManage && (
                          <div className="w-24">
                            <Label className="text-xs">Select Qty</Label>
                            <Input
                              type="number"
                              min={0}
                              max={group.quantity}
                              value={productSelections.get(key) || ''}
                              onChange={(e) => {
                                const qty = Math.max(0, Math.min(parseInt(e.target.value) || 0, group.quantity));
                                setProductSelections(prev => {
                                  const next = new Map(prev);
                                  if (qty > 0) next.set(key, qty);
                                  else next.delete(key);
                                  return next;
                                });
                              }}
                              placeholder="0"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )})
            )}
          </div>
        </TabsContent>

        {/* Completed Tab */}
        <TabsContent value="completed" className="space-y-4">
          <div className="space-y-3">
            {completedGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No items completed in finishing yet</CardContent></Card>
            ) : (
              completedGroups.map(group => {
                const key = group.order_item_id || group.product_id;
                return (
                <Card key={key}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{group.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {group.product_sku}
                          <Badge variant="outline" className="ml-2 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            Completed
                          </Badge>
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-lg font-semibold text-green-600">{group.quantity}</p>
                          <p className="text-xs text-muted-foreground">Completed</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )})
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Accept Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Boxes into Finishing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Accept {selectedBoxes.size} box(es) into finishing with ETA of {etaDays} day(s)?</p>
            <div className="max-h-[200px] overflow-y-auto space-y-2">
              {Array.from(selectedBoxes).map(boxId => {
                const group = readyBoxGroups.find(g => g.box_id === boxId);
                return group ? (
                  <div key={boxId} className="flex items-center justify-between p-2 bg-muted rounded">
                    <span className="font-mono">{group.box_code}</span>
                    <span className="text-sm text-muted-foreground">{group.totalQty} items</span>
                  </div>
                ) : null;
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAcceptBoxes} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Box Assignment Dialog */}
      <Dialog open={boxAssignDialogOpen} onOpenChange={setBoxAssignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Assign to Box
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">Items to assign: {totalSelected}</p>
              <div className="text-xs text-muted-foreground mt-1">
                {Array.from(productSelections.entries()).map(([key, qty]) => {
                  const group = inFinishingGroups.find(g => (g.order_item_id || g.product_id) === key);
                  return group ? (
                    <div key={key}>
                      {group.product_sku}: {qty} → {group.needs_packing ? 'Packaging' : 'Boxing'} ({group.needs_boxing ? 'Boxing' : 'No Boxing'})
                    </div>
                  ) : null;
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Scan or Enter Box Code</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={boxSearchCode}
                    onChange={(e) => setBoxSearchCode(e.target.value.toUpperCase())}
                    placeholder="e.g., BOX-0001"
                    className="pl-10"
                    onKeyDown={(e) => e.key === 'Enter' && searchBox()}
                  />
                </div>
                <Button onClick={searchBox} disabled={!boxSearchCode.trim()}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button variant="outline" onClick={createNewBox} disabled={creatingBox} className="w-full">
              {creatingBox ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Create New Box
            </Button>

            {selectedBox && (
              <Card className="border-primary bg-primary/5">
                <CardContent className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Box className="h-5 w-5 text-primary" />
                    <span className="font-mono font-bold text-lg">{selectedBox.box_code}</span>
                  </div>
                  <Badge className="bg-primary">Selected</Badge>
                </CardContent>
              </Card>
            )}

            {!selectedBox && !loadingBoxes && availableBoxes.length > 0 && (
              <div className="space-y-2">
                <Label>Available Boxes ({availableBoxes.length})</Label>
                <div className="grid grid-cols-3 gap-2 max-h-[120px] overflow-y-auto">
                  {availableBoxes.slice(0, 9).map(box => (
                    <Button key={box.id} variant="outline" size="sm" className="font-mono" onClick={() => setSelectedBox(box)}>
                      {box.box_code}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {loadingBoxes && (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignToBox} disabled={!selectedBox || submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Assign to {selectedBox?.box_code || 'Box'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
