import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  Factory, 
  Box, 
  Loader2, 
  QrCode, 
  AlertTriangle,
  RotateCcw,
  XCircle,
  Plus,
  Search,
  CheckCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Batch {
  id: string;
  batch_code: string;
  current_state: string;
  quantity: number;
  product_id: string;
  order_item_id: string | null;
  eta: string | null;
  lead_time_days: number | null;
  box_id: string | null;
  is_flagged?: boolean;
  is_redo?: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    needs_packing: boolean;
  };
  order_item?: {
    needs_boxing: boolean;
  };
}

interface Order {
  id: string;
  order_number: string;
  priority: string;
  customer?: { name: string };
}

interface ProductGroup {
  order_item_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_packing: boolean;
  needs_boxing: boolean;
  pendingRm: number;
  inManufacturing: number;
  batches: Batch[];
}

export default function OrderManufacturing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [completedBatches, setCompletedBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Selection & action states
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  
  // Dialog states
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [redoDialogOpen, setRedoDialogOpen] = useState(false);
  const [terminateReason, setTerminateReason] = useState('');
  const [redoReason, setRedoReason] = useState('');
  
  // Box selection
  const [boxSearchCode, setBoxSearchCode] = useState('');
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [creatingBox, setCreatingBox] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canManage = hasRole('manufacture_lead') || hasRole('manufacturer') || hasRole('admin');

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel(`order-manufacturing-${id}`)
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
          .select('id, batch_code, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, is_flagged, is_redo, product:products(id, name, sku, needs_packing), order_item:order_items(needs_boxing)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['pending_rm', 'in_manufacturing']),
        // Fetch completed items for this phase (moved to next phases)
        supabase.from('batches')
          .select('id, batch_code, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, is_flagged, is_redo, product:products(id, name, sku, needs_packing), order_item:order_items(needs_boxing)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['ready_for_finishing', 'in_finishing', 'ready_for_packaging', 'in_packaging', 'ready_for_boxing', 'in_boxing', 'ready_for_receiving', 'received'])
      ]);
      
      if (orderRes.error) throw orderRes.error;
      if (batchesRes.error) throw batchesRes.error;
      
      setOrder(orderRes.data as Order);
      setBatches(batchesRes.data as Batch[] || []);
      setCompletedBatches(completedRes.data as Batch[] || []);
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

  // Group batches by order_item_id (not just product_id) to keep items with different needs_boxing separate
  const productGroups: ProductGroup[] = [];
  const groupMap = new Map<string, ProductGroup>();
  
  batches.forEach(batch => {
    // Use order_item_id as the key to keep order items separate
    const groupKey = batch.order_item_id || batch.product_id;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        order_item_id: batch.order_item_id || '',
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        needs_packing: batch.product?.needs_packing ?? true,
        needs_boxing: batch.order_item?.needs_boxing ?? true,
        pendingRm: 0,
        inManufacturing: 0,
        batches: [],
      });
    }
    const group = groupMap.get(groupKey)!;
    group.batches.push(batch);
    if (batch.current_state === 'pending_rm') {
      group.pendingRm += batch.quantity;
    } else {
      group.inManufacturing += batch.quantity;
    }
  });
  
  groupMap.forEach(g => productGroups.push(g));

  // Group completed items by order_item_id
  const completedGroups: ProductGroup[] = [];
  const completedGroupMap = new Map<string, ProductGroup>();
  completedBatches.forEach(batch => {
    const groupKey = batch.order_item_id || batch.product_id;
    if (!completedGroupMap.has(groupKey)) {
      completedGroupMap.set(groupKey, {
        order_item_id: batch.order_item_id || '',
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        needs_packing: batch.product?.needs_packing ?? true,
        needs_boxing: batch.order_item?.needs_boxing ?? true,
        pendingRm: 0,
        inManufacturing: 0,
        batches: [],
      });
    }
    const group = completedGroupMap.get(groupKey)!;
    group.batches.push(batch);
    group.inManufacturing += batch.quantity; // reusing field for total
  });
  completedGroupMap.forEach(g => completedGroups.push(g));

  const totalCompleted = completedGroups.reduce((sum, g) => g.batches.reduce((s, b) => s + b.quantity, 0) + sum, 0);
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);

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
        order_item_id: string;
        needs_boxing: boolean;
        quantity: number;
        batch_id: string;
        batch_type: string;
      }> = [];
      
      // Process each order item selection (using order_item_id as key)
      for (const [groupKey, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        
        const group = productGroups.find(g => (g.order_item_id || g.product_id) === groupKey);
        if (!group) continue;
        
        let remainingQty = quantity;
        
        // First use pending_rm batches, then in_manufacturing
        const sortedBatches = [...group.batches].sort((a, b) => 
          a.current_state === 'pending_rm' ? -1 : 1
        );
        
        for (const batch of sortedBatches) {
          if (remainingQty <= 0) break;
          
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          
          if (useQty === batch.quantity) {
            // Update entire batch - no ETA here, set when receiving
            await supabase.from('batches').update({
              current_state: 'ready_for_finishing',
              box_id: selectedBox.id,
            }).eq('id', batch.id);
            
            // Add to items list
            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              order_item_id: group.order_item_id,
              needs_boxing: group.needs_boxing,
              quantity: useQty,
              batch_id: batch.id,
              batch_type: 'ORDER',
            });
          } else {
            // Split batch
            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            
            // Create new batch with selected quantity - no ETA here
            const { data: newBatch } = await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: 'ready_for_finishing',
              quantity: useQty,
              box_id: selectedBox.id,
              created_by: user?.id,
              parent_batch_id_split: batch.id,
            }).select('id').single();
            
            // Reduce original batch
            await supabase.from('batches').update({
              quantity: batch.quantity - useQty,
            }).eq('id', batch.id);
            
            // Add to items list
            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              order_item_id: group.order_item_id,
              needs_boxing: group.needs_boxing,
              quantity: useQty,
              batch_id: newBatch?.id || batch.id,
              batch_type: 'ORDER',
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
      setBoxDialogOpen(false);
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTerminate = async () => {
    if (totalSelected === 0 || !terminateReason.trim()) return;
    setSubmitting(true);
    
    try {
      for (const [groupKey, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        
        const group = productGroups.find(g => (g.order_item_id || g.product_id) === groupKey);
        if (!group) continue;
        
        let remainingQty = quantity;
        const pendingBatches = group.batches.filter(b => b.current_state === 'pending_rm');
        
        for (const batch of pendingBatches) {
          if (remainingQty <= 0) break;
          
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          
          if (useQty === batch.quantity) {
            await supabase.from('batches').update({
              is_terminated: true,
              terminated_by: user?.id,
              terminated_reason: terminateReason.trim(),
            }).eq('id', batch.id);
          } else {
            // Create terminated batch
            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: batch.current_state,
              quantity: useQty,
              is_terminated: true,
              terminated_by: user?.id,
              terminated_reason: terminateReason.trim(),
              created_by: user?.id,
              parent_batch_id_split: batch.id,
            });
            
            await supabase.from('batches').update({
              quantity: batch.quantity - useQty,
            }).eq('id', batch.id);
          }
        }
      }
      
      // Update order termination counter
      await supabase.from('orders').update({
        termination_counter: (await supabase.from('orders').select('termination_counter').eq('id', id).single()).data?.termination_counter + totalSelected
      }).eq('id', id);
      
      toast.success(`Terminated ${totalSelected} items`);
      setTerminateDialogOpen(false);
      setTerminateReason('');
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkRedo = async () => {
    if (totalSelected === 0 || !redoReason.trim()) return;
    setSubmitting(true);
    
    try {
      for (const [groupKey, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        
        const group = productGroups.find(g => (g.order_item_id || g.product_id) === groupKey);
        if (!group) continue;
        
        let remainingQty = quantity;
        const pendingBatches = group.batches.filter(b => b.current_state === 'pending_rm');
        
        for (const batch of pendingBatches) {
          if (remainingQty <= 0) break;
          
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          
          if (useQty === batch.quantity) {
            await supabase.from('batches').update({
              is_redo: true,
              is_flagged: true,
              redo_by: user?.id,
              redo_reason: redoReason.trim(),
              flagged_by: user?.id,
              flagged_at: new Date().toISOString(),
              flagged_reason: redoReason.trim(),
            }).eq('id', batch.id);
          } else {
            // Create redo batch
            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: 'pending_rm',
              quantity: useQty,
              is_redo: true,
              is_flagged: true,
              redo_by: user?.id,
              redo_reason: redoReason.trim(),
              flagged_by: user?.id,
              flagged_at: new Date().toISOString(),
              flagged_reason: redoReason.trim(),
              created_by: user?.id,
              parent_batch_id_split: batch.id,
            });
            
            await supabase.from('batches').update({
              quantity: batch.quantity - useQty,
            }).eq('id', batch.id);
          }
        }
      }
      
      // Update order redo counter
      await supabase.from('orders').update({
        redo_counter: (await supabase.from('orders').select('redo_counter').eq('id', id).single()).data?.redo_counter + totalSelected
      }).eq('id', id);
      
      toast.success(`Marked ${totalSelected} items for redo`);
      setRedoDialogOpen(false);
      setRedoReason('');
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

  const totalPendingRm = productGroups.reduce((sum, g) => sum + g.pendingRm, 0);
  const totalInManufacturing = productGroups.reduce((sum, g) => sum + g.inManufacturing, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/queues/manufacturing')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Factory className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Manufacturing</h1>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Pending RM</p>
            <p className="text-2xl font-bold text-warning">{totalPendingRm}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">In Manufacturing</p>
            <p className="text-2xl font-bold text-primary">{totalInManufacturing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Products</p>
            <p className="text-2xl font-bold">{productGroups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold">{totalPendingRm + totalInManufacturing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-600">{totalCompleted}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid grid-cols-2 w-full max-w-md">
          <TabsTrigger value="active">Active ({totalPendingRm + totalInManufacturing})</TabsTrigger>
          <TabsTrigger value="completed">Completed ({totalCompleted})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {/* Action Buttons */}
          {canManage && (
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 text-sm text-muted-foreground">
                  {totalSelected > 0 ? `${totalSelected} selected` : 'Select quantities below, then choose an action'}
                </div>
                <Button onClick={handleOpenBoxDialog} disabled={totalSelected === 0}>
                  <Box className="h-4 w-4 mr-2" />
                  Assign to Box
                </Button>
                <Button variant="outline" onClick={() => setRedoDialogOpen(true)} disabled={totalSelected === 0}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Mark Redo
                </Button>
                <Button variant="destructive" onClick={() => setTerminateDialogOpen(true)} disabled={totalSelected === 0}>
                  <XCircle className="h-4 w-4 mr-2" />
                  Terminate
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Products List */}
          <div className="space-y-4">
            {productGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No items in manufacturing phase for this order
                </CardContent>
              </Card>
            ) : (
              productGroups.map(group => {
                const groupKey = group.order_item_id || group.product_id;
                return (
                  <Card key={groupKey}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{group.product_name}</p>
                            {group.needs_boxing ? (
                              <Badge variant="outline" className="text-xs bg-primary/10">Boxing</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">No Boxing</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {group.product_sku} · {group.needs_packing ? 'Needs Packing' : 'No Packing'}
                          </p>
                        </div>
                        <div className="flex items-center gap-6">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">Pending RM</p>
                            <p className="text-lg font-semibold text-warning">{group.pendingRm}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground">In Manufacturing</p>
                            <p className="text-lg font-semibold text-primary">{group.inManufacturing}</p>
                          </div>
                          {canManage && (
                            <div className="w-24">
                              <Label className="text-xs">Select Qty</Label>
                              <Input
                                type="number"
                                min={0}
                                max={group.pendingRm + group.inManufacturing}
                                value={productSelections.get(groupKey) || ''}
                                onChange={(e) => {
                                  const qty = Math.max(0, Math.min(parseInt(e.target.value) || 0, group.pendingRm + group.inManufacturing));
                                  setProductSelections(prev => {
                                    const next = new Map(prev);
                                    if (qty > 0) next.set(groupKey, qty);
                                    else next.delete(groupKey);
                                    return next;
                                  });
                                }}
                                placeholder="0"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Show redo/flagged batches */}
                      {group.batches.filter(b => b.is_flagged || b.is_redo).length > 0 && (
                        <Alert variant="destructive" className="mt-3">
                          <AlertTriangle className="h-4 w-4" />
                          <AlertDescription>
                            {group.batches.filter(b => b.is_redo).reduce((sum, b) => sum + b.quantity, 0)} items need redo
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="completed" className="space-y-4">
          <div className="space-y-3">
            {completedGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No items completed in manufacturing yet</CardContent></Card>
            ) : (
              completedGroups.map(group => {
                const key = group.order_item_id || group.product_id;
                const totalQty = group.batches.reduce((sum, b) => sum + b.quantity, 0);
                return (
                <Card key={key}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{group.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {group.product_sku}
                          <Badge variant="outline" className="ml-2 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Completed
                          </Badge>
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-lg font-semibold text-green-600">{totalQty}</p>
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

      {/* Box Assignment Dialog */}
      <Dialog open={boxDialogOpen} onOpenChange={setBoxDialogOpen}>
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
            <Button variant="outline" onClick={() => setBoxDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignToBox} disabled={!selectedBox || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign to {selectedBox?.box_code || 'Box'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate Dialog */}
      <Dialog open={terminateDialogOpen} onOpenChange={setTerminateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-5 w-5" />
              Terminate Items
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will terminate {totalSelected} items. They will be removed from the order.
            </p>
            <div>
              <Label>Reason *</Label>
              <Textarea
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                placeholder="Reason for termination..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminateDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleTerminate} disabled={!terminateReason.trim() || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Terminate {totalSelected} Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redo Dialog */}
      <Dialog open={redoDialogOpen} onOpenChange={setRedoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-warning">
              <RotateCcw className="h-5 w-5" />
              Mark for Redo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This will flag {totalSelected} items as needing redo. They will remain in Pending RM with a redo flag.
            </p>
            <div>
              <Label>Reason *</Label>
              <Textarea
                value={redoReason}
                onChange={(e) => setRedoReason(e.target.value)}
                placeholder="Reason for redo..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedoDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMarkRedo} disabled={!redoReason.trim() || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mark {totalSelected} for Redo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
