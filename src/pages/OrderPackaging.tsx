import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  ArrowLeft, 
  Package, 
  Box, 
  Loader2, 
  QrCode, 
  Search,
  CheckSquare,
  Zap,
  CheckCircle
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ExtraItemsTab } from '@/components/ExtraItemsTab';
import { MoveToExtraDialog } from '@/components/MoveToExtraDialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProductionRateSection } from '@/components/ProductionRateSection';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface Batch {
  id: string;
  qr_code_data: string;
  current_state: string;
  quantity: number;
  product_id: string;
  order_item_id: string | null;
  box_id: string | null;
  packaging_machine_id: string | null;
  finishing_machine_id: string | null;
  manufacturing_machine_id: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    needs_packing?: boolean;
  };
  box?: { id: string; box_code: string } | null;
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

// Group by product + needs_boxing to combine same product items
interface OrderItemGroup {
  groupKey: string; // product_id + needs_boxing
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_boxing: boolean;
  quantity: number;
  batches: Batch[];
  order_item_ids: string[]; // Track all order_item_ids in this group
}

export default function OrderPackaging() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [completedBatches, setCompletedBatches] = useState<Batch[]>([]);
  const [addedToExtraItems, setAddedToExtraItems] = useState<Array<{ product_id: string; product_name: string; product_sku: string; quantity: number }>>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [etaDays, setEtaDays] = useState('1');
  const [receiveSearchQuery, setReceiveSearchQuery] = useState('');
  
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [boxAssignDialogOpen, setBoxAssignDialogOpen] = useState(false);
  const [boxDirectlyDialogOpen, setBoxDirectlyDialogOpen] = useState(false);
  const [moveToExtraDialogOpen, setMoveToExtraDialogOpen] = useState(false);
  const [boxSearchCode, setBoxSearchCode] = useState('');
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  // Machine selection state
  const [machines, setMachines] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [loadingMachines, setLoadingMachines] = useState(false);

  const canManage = hasRole('packaging_manager') || hasRole('packer') || hasRole('admin');

  useEffect(() => {
    fetchData();
    fetchAddedToExtra();
    const channel = supabase
      .channel(`order-packaging-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches', filter: `order_id=eq.${id}` }, () => {
        fetchData();
        fetchAddedToExtra();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const fetchData = async () => {
    try {
      const [orderRes, batchesRes, completedRes] = await Promise.all([
        supabase.from('orders').select('id, order_number, priority, customer:customers(name)').eq('id', id).single(),
        supabase.from('order_batches')
          .select('id, qr_code_data, current_state, quantity, product_id, order_item_id, box_id, manufacturing_machine_id, finishing_machine_id, packaging_machine_id, product:products(id, name, sku, needs_packing)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['ready_for_packaging', 'in_packaging']),
        // Fetch completed items for this phase (moved to next phases)
        supabase.from('order_batches')
          .select('id, qr_code_data, current_state, quantity, product_id, order_item_id, box_id, manufacturing_machine_id, finishing_machine_id, packaging_machine_id, product:products(id, name, sku, needs_packing)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['ready_for_boxing', 'in_boxing', 'ready_for_shipment', 'shipped'])
      ]);
      
      if (orderRes.error) throw orderRes.error;
      if (batchesRes.error) throw batchesRes.error;
      
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
      
      // Filter completed batches to only include items that actually went through packaging
      // Items with needs_packing = false skip packaging entirely (go from Finishing -> Boxing)
      // and should NOT appear in the Packaging completed list
      const completedWithData = completedRes.data
        ?.filter((batch: any) => batch.product?.needs_packing !== false)
        .map((batch: any) => ({
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

  const fetchAddedToExtra = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('extra_batch_history')
        .select('quantity, product_id, products(name, sku)')
        .eq('event_type', 'CREATED')
        .eq('source_order_id', id)
        .eq('from_state', 'in_packaging');

      if (error) throw error;

      const productMap = new Map<string, { product_id: string; product_name: string; product_sku: string; quantity: number }>();
      (data || []).forEach((record: any) => {
        const existing = productMap.get(record.product_id);
        if (existing) {
          existing.quantity += record.quantity;
        } else {
          productMap.set(record.product_id, {
            product_id: record.product_id,
            product_name: record.products?.name || 'Unknown',
            product_sku: record.products?.sku || 'N/A',
            quantity: record.quantity,
          });
        }
      });
      setAddedToExtraItems(Array.from(productMap.values()));
    } catch (error) {
      console.error('Error fetching added to extra:', error);
    }
  };

  const fetchEmptyBoxes = async () => {
    setLoadingBoxes(true);
    try {
      const { data: allBoxes } = await supabase.from('boxes').select('id, box_code').eq('is_active', true).order('box_code');
      const { data: occupiedBatches } = await supabase.from('order_batches').select('box_id').not('box_id', 'is', null).eq('is_terminated', false);
      const occupiedIds = new Set(occupiedBatches?.map(b => b.box_id) || []);
      setAvailableBoxes(allBoxes?.filter(box => !occupiedIds.has(box.id)) || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingBoxes(false);
    }
  };

  const fetchMachines = async () => {
    setLoadingMachines(true);
    try {
      const { data } = await supabase
        .from('machines')
        .select('id, name')
        .eq('type', 'packaging')
        .eq('is_active', true)
        .order('name');
      setMachines(data || []);
    } catch (error) {
      console.error('Error fetching machines:', error);
    } finally {
      setLoadingMachines(false);
    }
  };

  const searchBox = async () => {
    if (!boxSearchCode.trim()) return;
    try {
      const { data: box } = await supabase.from('boxes').select('id, box_code').eq('box_code', boxSearchCode.trim().toUpperCase()).eq('is_active', true).single();
      if (!box) { toast.error(`Box ${boxSearchCode} not found`); return; }
      const { data: existingBatch } = await supabase.from('order_batches').select('id').eq('box_id', box.id).eq('is_terminated', false).maybeSingle();
      if (existingBatch) { toast.error(`Box ${box.box_code} is already occupied`); return; }
      setSelectedBox(box);
      setBoxSearchCode('');
    } catch (error: any) { toast.error(error.message); }
  };

  // Group ready_for_packaging by box
  const readyBoxGroups: BoxGroup[] = [];
  const boxGroupMap = new Map<string, BoxGroup>();
  batches.filter(b => b.current_state === 'ready_for_packaging' && b.box_id).forEach(batch => {
    if (!boxGroupMap.has(batch.box_id!)) {
      boxGroupMap.set(batch.box_id!, { box_id: batch.box_id!, box_code: batch.box?.box_code || 'Unknown', batches: [], totalQty: 0 });
    }
    const group = boxGroupMap.get(batch.box_id!)!;
    group.batches.push(batch);
    group.totalQty += batch.quantity;
  });
  boxGroupMap.forEach(g => readyBoxGroups.push(g));

  // Group in_packaging by product + needs_boxing to combine same product items
  const inPackagingGroups: OrderItemGroup[] = [];
  const orderItemGroupMap = new Map<string, OrderItemGroup>();
  batches.filter(b => b.current_state === 'in_packaging').forEach(batch => {
    const needsBoxing = batch.order_item?.needs_boxing ?? true;
    const groupKey = `${batch.product_id}-${needsBoxing ? 'boxing' : 'no-boxing'}`;
    
    if (!orderItemGroupMap.has(groupKey)) {
      orderItemGroupMap.set(groupKey, { 
        groupKey,
        product_id: batch.product_id, 
        product_name: batch.product?.name || 'Unknown', 
        product_sku: batch.product?.sku || 'N/A', 
        needs_boxing: needsBoxing,
        quantity: 0, 
        batches: [],
        order_item_ids: [],
      });
    }
    const group = orderItemGroupMap.get(groupKey)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
    if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
      group.order_item_ids.push(batch.order_item_id);
    }
  });
  orderItemGroupMap.forEach(g => inPackagingGroups.push(g));
  inPackagingGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));

  const totalReadyForPackaging = readyBoxGroups.reduce((sum, g) => sum + g.totalQty, 0);
  const totalInPackaging = inPackagingGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);

  // Prepare selections for MoveToExtraDialog
  const extraSelections = inPackagingGroups
    .filter(g => productSelections.get(g.groupKey) && productSelections.get(g.groupKey)! > 0)
    .map(g => ({
      groupKey: g.groupKey,
      product_id: g.product_id,
      product_name: g.product_name,
      product_sku: g.product_sku,
      quantity: productSelections.get(g.groupKey) || 0,
      order_item_ids: g.order_item_ids,
      batches: g.batches.map(b => ({
        id: b.id,
        quantity: b.quantity,
        current_state: b.current_state,
        order_item_id: b.order_item_id,
      })),
    }))
    .filter(s => s.quantity > 0);

  // Group completed items by product + needs_boxing
  const completedGroups: OrderItemGroup[] = [];
  const completedGroupMap = new Map<string, OrderItemGroup>();
  completedBatches.forEach(batch => {
    const needsBoxing = batch.order_item?.needs_boxing ?? true;
    const groupKey = `${batch.product_id}-${needsBoxing ? 'boxing' : 'no-boxing'}`;
    
    if (!completedGroupMap.has(groupKey)) {
      completedGroupMap.set(groupKey, {
        groupKey,
        product_id: batch.product_id,
        product_name: batch.product?.name || 'Unknown',
        product_sku: batch.product?.sku || 'N/A',
        needs_boxing: needsBoxing,
        quantity: 0,
        batches: [],
        order_item_ids: [],
      });
    }
    const group = completedGroupMap.get(groupKey)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
    if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
      group.order_item_ids.push(batch.order_item_id);
    }
  });
  completedGroupMap.forEach(g => completedGroups.push(g));
  completedGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));
  const totalCompleted = completedGroups.reduce((sum, g) => sum + g.quantity, 0);

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
    if (selectedBoxes.size === filteredReadyBoxGroups.length) setSelectedBoxes(new Set());
    else setSelectedBoxes(new Set(filteredReadyBoxGroups.map(g => g.box_id)));
  };

  const handleAcceptBoxes = async () => {
    if (selectedBoxes.size === 0) return;
    setSubmitting(true);
    try {
      const etaDate = new Date();
      etaDate.setDate(etaDate.getDate() + parseInt(etaDays) || 1);
      const batchIds = batches.filter(b => b.current_state === 'ready_for_packaging' && b.box_id && selectedBoxes.has(b.box_id)).map(b => b.id);
      // Clear box_id when receiving - boxes become available again
      await supabase.from('order_batches').update({ current_state: 'in_packaging', eta: etaDate.toISOString(), lead_time_days: parseInt(etaDays) || 1, box_id: null }).in('id', batchIds);
      
      // Reset boxes to empty state
      const boxIds = Array.from(selectedBoxes);
      await supabase.from('boxes').update({
        items_list: [],
        content_type: 'EMPTY',
      }).in('id', boxIds);
      
      toast.success(`Accepted ${selectedBoxes.size} box(es) into packaging`);
      setSelectedBoxes(new Set());
      setAcceptDialogOpen(false);
      fetchData();
    } catch (error: any) { toast.error(error.message); } 
    finally { setSubmitting(false); }
  };

  const handleOpenAssignDialog = () => {
    if (totalSelected === 0) { toast.error('Please select items first'); return; }
    setSelectedBox(null);
    setBoxSearchCode('');
    setSelectedMachine(null);
    fetchEmptyBoxes();
    fetchMachines();
    setBoxAssignDialogOpen(true);
  };

  const handleAssignToBox = async () => {
    if (!selectedBox || totalSelected === 0) return;
    setSubmitting(true);
    const machineId = selectedMachine;
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
        const group = inPackagingGroups.find(g => g.groupKey === key);
        if (!group) continue;
        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
        if (useQty === batch.quantity) {
            await supabase.from('order_batches').update({ 
              current_state: 'ready_for_boxing', 
              box_id: selectedBox.id,
              packaging_machine_id: machineId || batch.packaging_machine_id,
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
            const { data: qrCode } = await supabase.rpc('generate_extra_batch_code');
            // Inherit machine IDs from parent batch or use selected
            const { data: newBatch } = await supabase.from('order_batches').insert({
              qr_code_data: qrCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: 'ready_for_boxing',
              quantity: useQty,
              box_id: selectedBox.id,
              created_by: user?.id,
              manufacturing_machine_id: batch.manufacturing_machine_id,
              finishing_machine_id: batch.finishing_machine_id,
              packaging_machine_id: machineId || batch.packaging_machine_id,
            }).select('id').single();
            await supabase.from('order_batches').update({ quantity: batch.quantity - useQty }).eq('id', batch.id);
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
    } catch (error: any) { toast.error(error.message); } 
    finally { setSubmitting(false); }
  };

  const handleBoxDirectly = async () => {
    if (totalSelected === 0) return;
    setSubmitting(true);
    try {
      const etaDate = new Date();
      etaDate.setDate(etaDate.getDate() + parseInt(etaDays) || 1);
      
      for (const [key, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        const group = inPackagingGroups.find(g => g.groupKey === key);
        if (!group) continue;
        
        // Route based on needs_boxing: true -> in_boxing, false -> ready_for_shipment
        const nextState = group.needs_boxing ? 'in_boxing' : 'ready_for_shipment';
        
        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          if (useQty === batch.quantity) {
            await supabase.from('order_batches').update({ 
              current_state: nextState, 
              eta: group.needs_boxing ? etaDate.toISOString() : null, 
              lead_time_days: group.needs_boxing ? parseInt(etaDays) || 1 : null 
            }).eq('id', batch.id);
          } else {
            const { data: qrCode } = await supabase.rpc('generate_extra_batch_code');
            await supabase.from('order_batches').insert({ 
              qr_code_data: qrCode, 
              order_id: id, 
              product_id: batch.product_id, 
              order_item_id: batch.order_item_id,
              current_state: nextState, 
              quantity: useQty, 
              eta: group.needs_boxing ? etaDate.toISOString() : null, 
              lead_time_days: group.needs_boxing ? parseInt(etaDays) || 1 : null, 
              created_by: user?.id, 
            });
            await supabase.from('order_batches').update({ quantity: batch.quantity - useQty }).eq('id', batch.id);
          }
        }
      }
      toast.success(`Routed ${totalSelected} items based on boxing requirements`);
      setBoxDirectlyDialogOpen(false);
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) { toast.error(error.message); } 
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!order) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate('/orders')}><ArrowLeft className="h-4 w-4 mr-2" />Back</Button>
        <p className="text-center text-muted-foreground mt-8">Order not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/queues/packaging')}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Package className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Packaging</h1>
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
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ready for Packaging</p><p className="text-2xl font-bold text-warning">{totalReadyForPackaging}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">In Packaging</p><p className="text-2xl font-bold text-primary">{totalInPackaging}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Boxes Waiting</p><p className="text-2xl font-bold">{readyBoxGroups.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Products</p><p className="text-2xl font-bold">{inPackagingGroups.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Completed</p><p className="text-2xl font-bold text-green-600">{totalCompleted}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="receive" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="receive">Receive Boxes ({readyBoxGroups.length})</TabsTrigger>
          <TabsTrigger value="process">Process Items ({totalInPackaging})</TabsTrigger>
          <TabsTrigger value="extra">Extra</TabsTrigger>
          <TabsTrigger value="completed">Completed ({totalCompleted})</TabsTrigger>
        </TabsList>

        <TabsContent value="receive" className="space-y-4">
          {canManage && readyBoxGroups.length > 0 && (
            <Card>
                <CardContent className="p-4 flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={handleSelectAllBoxes}>
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {selectedBoxes.size === filteredReadyBoxGroups.length ? 'Deselect All' : 'Select All'}
                </Button>
                <Button onClick={() => setAcceptDialogOpen(true)} disabled={selectedBoxes.size === 0}>Accept {selectedBoxes.size} Box(es)</Button>
              </CardContent>
            </Card>
          )}

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

          <div className="space-y-3">
            {filteredReadyBoxGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {receiveSearchQuery.trim() 
                    ? `No boxes matching "${receiveSearchQuery}"` 
                    : 'No boxes ready for packaging'}
                </CardContent>
              </Card>
            ) : filteredReadyBoxGroups.map(group => (
              <Card key={group.box_id} className={selectedBoxes.has(group.box_id) ? 'border-primary' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    {canManage && (
                      <Checkbox checked={selectedBoxes.has(group.box_id)} onCheckedChange={(checked) => {
                        setSelectedBoxes(prev => { const next = new Set(prev); if (checked) next.add(group.box_id); else next.delete(group.box_id); return next; });
                      }} />
                    )}
                    <Box className="h-5 w-5 text-muted-foreground" />
                    <span className="font-mono font-bold">{group.box_code}</span>
                    <Badge variant="secondary">{group.totalQty} items</Badge>
                    <div className="flex-1 text-sm text-muted-foreground">{group.batches.map(b => `${b.product?.sku} - ${b.product?.name} (${b.quantity})`).join(', ')}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="process" className="space-y-4">
          {canManage && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <Badge variant="secondary" className="text-lg px-3 py-1">{totalSelected} selected</Badge>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setMoveToExtraDialogOpen(true)} disabled={totalSelected === 0}><Package className="h-4 w-4 mr-2" />Assign to Extra</Button>
                  <Button variant="outline" onClick={handleOpenAssignDialog} disabled={totalSelected === 0}><Box className="h-4 w-4 mr-2" />Assign to Box</Button>
                  <Button onClick={() => setBoxDirectlyDialogOpen(true)} disabled={totalSelected === 0}><Zap className="h-4 w-4 mr-2" />Box Directly</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {inPackagingGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No items in packaging</CardContent></Card>
            ) : inPackagingGroups.map(group => (
                <Card key={group.groupKey}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{group.product_name}</p>
                          {group.needs_boxing ? (
                            <Badge variant="outline" className="text-xs bg-primary/10">Boxing</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">No Boxing</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="secondary">{group.quantity} available</Badge>
                        {canManage && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Select</Label>
                            <Input
                              type="number"
                              min={0}
                              max={group.quantity}
                              value={productSelections.get(group.groupKey) || 0}
                              onChange={(e) => {
                                const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), group.quantity);
                                setProductSelections(prev => new Map(prev).set(group.groupKey, val));
                              }}
                              className="w-20 h-8"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </TabsContent>

        <TabsContent value="extra">
          <ExtraItemsTab 
            orderId={id!} 
            phase="packaging" 
            onRefresh={() => fetchData()} 
          />
        </TabsContent>

        <TabsContent value="completed" className="space-y-6">
          {/* Added to Extra Inventory Section */}
          {addedToExtraItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-orange-200 dark:border-orange-900">
                <Package className="h-4 w-4 text-orange-600" />
                <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                  Added to Extra Inventory
                </h3>
              </div>
              {addedToExtraItems.map(item => (
                <Card key={item.product_id} className="border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">{item.product_sku}</p>
                      </div>
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white">
                        {item.quantity} to extra
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Moved to Next Phase Section */}
          {completedGroups.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-green-200 dark:border-green-900">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <h3 className="text-sm font-semibold text-green-700 dark:text-green-400">
                  Moved to Next Phase
                </h3>
              </div>
              {completedGroups.map(group => (
                <Card key={group.groupKey} className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{group.product_name}</p>
                        <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                      </div>
                      <Badge className="bg-green-600 hover:bg-green-700 text-white">{group.quantity} completed</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Production Rate Section */}
          <ProductionRateSection
            batches={completedBatches.map(b => ({
              id: b.id,
              product_id: b.product_id,
              product_name: b.product?.name || 'Unknown',
              product_sku: b.product?.sku || 'N/A',
              quantity: b.quantity,
              machine_id: b.packaging_machine_id,
              needs_boxing: b.order_item?.needs_boxing ?? true,
            }))}
            machineType="packaging"
            machineColumnName="packaging_machine_id"
            onAssigned={fetchData}
          />

          {completedGroups.length === 0 && addedToExtraItems.length === 0 && completedBatches.length === 0 && (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No completed items yet</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Accept Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accept Boxes into Packaging</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              You are about to accept {selectedBoxes.size} box(es) into the packaging phase.
            </p>
            <div>
              <Label>Lead Time (days) *</Label>
              <Select value={etaDays} onValueChange={setEtaDays}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 7, 10, 14, 21, 30].map(d => (
                    <SelectItem key={d} value={d.toString()}>{d} day{d !== 1 ? 's' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                Items will be expected to complete by <strong>{new Date(Date.now() + parseInt(etaDays) * 24 * 60 * 60 * 1000).toLocaleDateString()}</strong>
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAcceptBoxes} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Box Assignment Dialog */}
      <Dialog open={boxAssignDialogOpen} onOpenChange={setBoxAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign to Box</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            {/* Machine Selection */}
            <div>
              <Label>Packaging Machine (Optional)</Label>
              <div className="mt-2">
                <SearchableSelect
                  options={machines.map(m => ({ value: m.id, label: m.name }))}
                  value={selectedMachine}
                  onValueChange={setSelectedMachine}
                  placeholder="Select a machine..."
                  searchPlaceholder="Search machines..."
                  emptyText="No packaging machines found"
                  loading={loadingMachines}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">Box Selection</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div>
              <Label>Search Box by Code</Label>
              <div className="flex gap-2 mt-2">
                <Input value={boxSearchCode} onChange={(e) => setBoxSearchCode(e.target.value)} placeholder="BOX-0001" onKeyDown={(e) => e.key === 'Enter' && searchBox()} />
                <Button variant="outline" onClick={searchBox}><Search className="h-4 w-4" /></Button>
              </div>
            </div>
            {selectedBox && (
              <div className="p-3 border rounded-lg bg-primary/5">
                <p className="font-medium">{selectedBox.box_code}</p>
                <p className="text-sm text-muted-foreground">Selected</p>
              </div>
            )}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            <div>
              <Label>Select Available Box</Label>
              <div className="mt-2">
                <SearchableSelect
                  options={availableBoxes.map(b => ({ value: b.id, label: b.box_code }))}
                  value={selectedBox?.id || null}
                  onValueChange={(val) => setSelectedBox(availableBoxes.find(b => b.id === val) || null)}
                  placeholder={loadingBoxes ? 'Loading...' : 'Select a box...'}
                  searchPlaceholder="Search boxes..."
                  emptyText="No boxes available"
                  loading={loadingBoxes}
                  allowClear={false}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxAssignDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAssignToBox} disabled={!selectedBox || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign {totalSelected} Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Box Directly Dialog */}
      <Dialog open={boxDirectlyDialogOpen} onOpenChange={setBoxDirectlyDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Box Directly</DialogTitle></DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Route {totalSelected} item(s) based on their "needs boxing" setting:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground">
              <li>Needs Boxing = Yes → In Boxing (with {etaDays} day ETA)</li>
              <li>Needs Boxing = No → Ready for Shipment</li>
            </ul>
            <div>
              <Label className="text-xs text-muted-foreground">ETA for Boxing (days)</Label>
              <Select value={etaDays} onValueChange={setEtaDays}>
                <SelectTrigger className="w-20 h-8 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 7, 10, 14].map(d => <SelectItem key={d} value={d.toString()}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxDirectlyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleBoxDirectly} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Route Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Extra Dialog */}
      <MoveToExtraDialog
        open={moveToExtraDialogOpen}
        onOpenChange={setMoveToExtraDialogOpen}
        orderId={id!}
        phase="in_packaging"
        selections={extraSelections}
        totalQuantity={totalSelected}
        onSuccess={() => {
          setProductSelections(new Map());
          fetchData();
        }}
        userId={user?.id}
      />
    </div>
  );
}
