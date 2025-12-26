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
  Box, 
  Loader2, 
  QrCode, 
  CheckSquare,
  Truck,
  Printer,
  Package
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
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';

interface Batch {
  id: string;
  batch_code: string;
  current_state: string;
  quantity: number;
  product_id: string;
  order_item_id: string | null;
  box_id: string | null;
  product: { id: string; name: string; sku: string; needs_packing: boolean };
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

// Group by order_item_id to preserve order item identity (same product with different needs_boxing stays separate)
interface OrderItemGroup {
  order_item_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_boxing: boolean;
  quantity: number;
  batches: Batch[];
}

export default function OrderBoxing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [readyForShipmentSelections, setReadyForShipmentSelections] = useState<Map<string, number>>(new Map());
  const [etaDays, setEtaDays] = useState('1');
  
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [moveToReadyDialogOpen, setMoveToReadyDialogOpen] = useState(false);
  const [kartonaDialogOpen, setKartonaDialogOpen] = useState(false);
  const [shipmentNotes, setShipmentNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canManage = hasRole('boxing_manager') || hasRole('boxer') || hasRole('admin');

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel(`order-boxing-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches', filter: `order_id=eq.${id}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const fetchData = async () => {
    try {
      const [orderRes, batchesRes] = await Promise.all([
        supabase.from('orders').select('id, order_number, priority, customer:customers(name)').eq('id', id).single(),
        supabase.from('batches')
          .select('id, batch_code, current_state, quantity, product_id, order_item_id, box_id, product:products(id, name, sku, needs_packing)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['ready_for_boxing', 'in_boxing', 'ready_for_receiving', 'received'])
      ]);
      
      if (orderRes.error) throw orderRes.error;
      if (batchesRes.error) throw batchesRes.error;
      
      // Fetch box info
      const boxIds = batchesRes.data?.filter((b: any) => b.box_id).map((b: any) => b.box_id) || [];
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase.from('boxes').select('id, box_code').in('id', boxIds);
        boxesData?.forEach(box => boxMap.set(box.id, box));
      }
      
      // Fetch order_item info for needs_boxing
      const orderItemIds = batchesRes.data?.filter((b: any) => b.order_item_id).map((b: any) => b.order_item_id) || [];
      let orderItemMap = new Map();
      if (orderItemIds.length > 0) {
        const { data: orderItemsData } = await supabase.from('order_items').select('id, needs_boxing').in('id', orderItemIds);
        orderItemsData?.forEach(oi => orderItemMap.set(oi.id, oi));
      }
      
      const batchesWithData = batchesRes.data?.map((batch: any) => ({
        ...batch,
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
        order_item: batch.order_item_id ? orderItemMap.get(batch.order_item_id) : null,
      })) || [];
      
      setOrder(orderRes.data as Order);
      setBatches(batchesWithData as Batch[]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Group ready_for_boxing by box
  const readyBoxGroups: BoxGroup[] = [];
  const boxGroupMap = new Map<string, BoxGroup>();
  batches.filter(b => b.current_state === 'ready_for_boxing' && b.box_id).forEach(batch => {
    if (!boxGroupMap.has(batch.box_id!)) {
      boxGroupMap.set(batch.box_id!, { box_id: batch.box_id!, box_code: batch.box?.box_code || 'Unknown', batches: [], totalQty: 0 });
    }
    const group = boxGroupMap.get(batch.box_id!)!;
    group.batches.push(batch);
    group.totalQty += batch.quantity;
  });
  boxGroupMap.forEach(g => readyBoxGroups.push(g));

  // Group in_boxing by order_item_id to preserve identity (same product with different needs_boxing stays separate)
  const inBoxingGroups: OrderItemGroup[] = [];
  const orderItemMap = new Map<string, OrderItemGroup>();
  batches.filter(b => b.current_state === 'in_boxing').forEach(batch => {
    // Use order_item_id as key, or fall back to product_id for legacy data
    const key = batch.order_item_id || batch.product_id;
    if (!orderItemMap.has(key)) {
      orderItemMap.set(key, { 
        order_item_id: batch.order_item_id || '',
        product_id: batch.product_id, 
        product_name: batch.product?.name || 'Unknown', 
        product_sku: batch.product?.sku || 'N/A', 
        needs_boxing: batch.order_item?.needs_boxing ?? true,
        quantity: 0, 
        batches: [] 
      });
    }
    const group = orderItemMap.get(key)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
  });
  orderItemMap.forEach(g => inBoxingGroups.push(g));

  // Group ready_for_receiving (ready for shipment) by order_item_id
  const readyForShipmentGroups: OrderItemGroup[] = [];
  const readyShipmentMap = new Map<string, OrderItemGroup>();
  batches.filter(b => b.current_state === 'ready_for_receiving').forEach(batch => {
    const key = batch.order_item_id || batch.product_id;
    if (!readyShipmentMap.has(key)) {
      readyShipmentMap.set(key, { 
        order_item_id: batch.order_item_id || '',
        product_id: batch.product_id, 
        product_name: batch.product?.name || 'Unknown', 
        product_sku: batch.product?.sku || 'N/A', 
        needs_boxing: batch.order_item?.needs_boxing ?? true,
        quantity: 0, 
        batches: [] 
      });
    }
    const group = readyShipmentMap.get(key)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
  });
  readyShipmentMap.forEach(g => readyForShipmentGroups.push(g));

  const totalReadyForBoxing = readyBoxGroups.reduce((sum, g) => sum + g.totalQty, 0);
  const totalInBoxing = inBoxingGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalReadyForShipment = readyForShipmentGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalReceived = batches.filter(b => b.current_state === 'received').reduce((sum, b) => sum + b.quantity, 0);
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);
  const totalSelectedForShipment = Array.from(readyForShipmentSelections.values()).reduce((a, b) => a + b, 0);

  const handleSelectAllBoxes = () => {
    if (selectedBoxes.size === readyBoxGroups.length) setSelectedBoxes(new Set());
    else setSelectedBoxes(new Set(readyBoxGroups.map(g => g.box_id)));
  };

  const handleAcceptBoxes = async () => {
    if (selectedBoxes.size === 0) return;
    setSubmitting(true);
    try {
      const etaDate = new Date();
      etaDate.setDate(etaDate.getDate() + parseInt(etaDays) || 1);
      
      // Get all batches in selected boxes
      const selectedBatches = batches.filter(b => b.current_state === 'ready_for_boxing' && b.box_id && selectedBoxes.has(b.box_id));
      
      // Route based on needs_boxing flag per batch:
      // needs_boxing = true -> in_boxing (Processing)
      // needs_boxing = false -> ready_for_receiving (Ready for Shipment)
      const batchesToBoxing = selectedBatches.filter(b => b.order_item?.needs_boxing !== false);
      const batchesToShipment = selectedBatches.filter(b => b.order_item?.needs_boxing === false);
      
      if (batchesToBoxing.length > 0) {
        await supabase.from('batches').update({ 
          current_state: 'in_boxing', 
          eta: etaDate.toISOString(), 
          lead_time_days: parseInt(etaDays) || 1 
        }).in('id', batchesToBoxing.map(b => b.id));
      }
      
      if (batchesToShipment.length > 0) {
        await supabase.from('batches').update({ 
          current_state: 'ready_for_receiving',
          box_id: null,
        }).in('id', batchesToShipment.map(b => b.id));
      }
      
      const boxingCount = batchesToBoxing.reduce((sum, b) => sum + b.quantity, 0);
      const shipmentCount = batchesToShipment.reduce((sum, b) => sum + b.quantity, 0);
      
      toast.success(`Routed ${boxingCount} to Processing, ${shipmentCount} directly to Ready for Shipment`);
      setSelectedBoxes(new Set());
      setAcceptDialogOpen(false);
      fetchData();
    } catch (error: any) { toast.error(error.message); } 
    finally { setSubmitting(false); }
  };

  const handleMoveToReadyForShipment = async () => {
    if (totalSelected === 0) return;
    setSubmitting(true);
    
    try {
      // Use order_item_id or product_id as key (matching how groups are created)
      for (const [key, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        const group = inBoxingGroups.find(g => (g.order_item_id || g.product_id) === key);
        if (!group) continue;
        
        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          
          if (useQty === batch.quantity) {
            await supabase.from('batches').update({ 
              current_state: 'ready_for_receiving',
              box_id: null,
            }).eq('id', batch.id);
          } else {
            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: 'ready_for_receiving',
              quantity: useQty,
              created_by: user?.id,
              parent_batch_id_split: batch.id,
            });
            await supabase.from('batches').update({ quantity: batch.quantity - useQty }).eq('id', batch.id);
          }
        }
      }
      
      toast.success(`Moved ${totalSelected} items to Ready for Shipment`);
      setMoveToReadyDialogOpen(false);
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKartona = async () => {
    if (totalSelectedForShipment === 0) return;
    setSubmitting(true);
    
    try {
      // Generate shipment code
      const { data: shipmentCode } = await supabase.rpc('generate_shipment_code');
      
      // Create shipment
      const { data: shipment, error: shipmentError } = await supabase
        .from('shipments')
        .insert({
          shipment_code: shipmentCode || `SHP-${Date.now()}`,
          order_id: id,
          notes: shipmentNotes.trim() || null,
          created_by: user?.id,
          status: 'sealed',
          sealed_at: new Date().toISOString(),
          sealed_by: user?.id,
        })
        .select()
        .single();
      
      if (shipmentError) throw shipmentError;
      
      // Process each product selection
      const shipmentItems = [];
      for (const [productId, quantity] of readyForShipmentSelections.entries()) {
        if (quantity <= 0) continue;
        const group = readyForShipmentGroups.find(g => g.product_id === productId);
        if (!group) continue;
        
        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          
          shipmentItems.push({
            shipment_id: shipment.id,
            batch_id: batch.id,
            quantity: useQty,
          });
          
          if (useQty === batch.quantity) {
            await supabase.from('batches').update({ current_state: 'received' }).eq('id', batch.id);
          } else {
            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            await supabase.from('batches').insert({
              batch_code: batchCode,
              order_id: id,
              product_id: batch.product_id,
              current_state: 'received',
              quantity: useQty,
              created_by: user?.id,
              parent_batch_id_split: batch.id,
            });
            await supabase.from('batches').update({ quantity: batch.quantity - useQty }).eq('id', batch.id);
          }
        }
      }
      
      if (shipmentItems.length > 0) {
        await supabase.from('shipment_items').insert(shipmentItems);
      }
      
      toast.success(`Created Kartona ${shipment.shipment_code}`);
      
      // Print label
      printKartonaLabel(shipment.shipment_code);
      
      setKartonaDialogOpen(false);
      setReadyForShipmentSelections(new Map());
      setShipmentNotes('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const printKartonaLabel = (shipmentCode: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const selectedItems = Array.from(readyForShipmentSelections.entries()).map(([pid, qty]) => {
      const group = readyForShipmentGroups.find(g => g.product_id === pid);
      return group ? { sku: group.product_sku, name: group.product_name, qty, needsBoxing: group.needs_boxing } : null;
    }).filter(Boolean);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Kartona ${shipmentCode}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 400px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
            .code { font-size: 32px; font-weight: bold; font-family: monospace; }
            .order { font-size: 18px; margin-top: 5px; }
            .customer { color: #666; }
            .section { margin: 15px 0; }
            .label { font-size: 12px; color: #666; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            td { padding: 5px 0; border-bottom: 1px solid #eee; }
            .total { font-weight: bold; border-top: 2px solid #333; }
            .date { text-align: center; color: #666; font-size: 12px; margin-top: 20px; }
            .boxing { font-size: 10px; color: #888; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="code">${shipmentCode}</div>
            <div class="order">${order?.order_number || 'N/A'}</div>
            <div class="customer">${order?.customer?.name || 'N/A'}</div>
          </div>
          <div class="section">
            <div class="label">CONTENTS:</div>
            <table>
              ${selectedItems.map((item: any) => `<tr><td>${item.sku}</td><td>${item.name}<br><span class="boxing">${item.needsBoxing ? 'Boxed' : 'Not Boxed'}</span></td><td style="text-align:right">${item.qty}</td></tr>`).join('')}
              <tr class="total"><td colspan="2">Total Items</td><td style="text-align:right">${totalSelectedForShipment}</td></tr>
            </table>
          </div>
          ${shipmentNotes ? `<div class="section"><div class="label">NOTES:</div><p>${shipmentNotes}</p></div>` : ''}
          <div class="date">Created: ${format(new Date(), 'PPP p')}</div>
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
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
          <Button variant="ghost" onClick={() => navigate('/queues/boxing')}><ArrowLeft className="h-4 w-4" /></Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Box className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Boxing</h1>
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
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ready for Boxing</p><p className="text-2xl font-bold text-warning">{totalReadyForBoxing}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">In Boxing</p><p className="text-2xl font-bold text-primary">{totalInBoxing}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ready for Shipment</p><p className="text-2xl font-bold text-green-600">{totalReadyForShipment}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Kartonas Created</p><p className="text-2xl font-bold text-purple-600">{totalReceived}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Boxes Waiting</p><p className="text-2xl font-bold">{readyBoxGroups.length}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="receive" className="space-y-4">
        <TabsList>
          <TabsTrigger value="receive">Receive Boxes ({readyBoxGroups.length})</TabsTrigger>
          <TabsTrigger value="process">Process Items ({totalInBoxing})</TabsTrigger>
          <TabsTrigger value="ready">Ready for Shipment ({totalReadyForShipment})</TabsTrigger>
        </TabsList>

        {/* Tab 1: Receive Boxes */}
        <TabsContent value="receive" className="space-y-4">
          {canManage && readyBoxGroups.length > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="outline" size="sm" onClick={handleSelectAllBoxes}>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    {selectedBoxes.size === readyBoxGroups.length ? 'Deselect All' : 'Select All'}
                  </Button>
                  <div>
                    <Label className="text-xs text-muted-foreground">ETA (days)</Label>
                    <Select value={etaDays} onValueChange={setEtaDays}>
                      <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 5, 7, 10, 14].map(d => <SelectItem key={d} value={d.toString()}>{d}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => setAcceptDialogOpen(true)} disabled={selectedBoxes.size === 0}>Accept {selectedBoxes.size} Box(es)</Button>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <Label>Search or Scan Box</Label>
              <div className="flex gap-2 mt-2">
                <div className="flex-1 relative">
                  <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Enter box code..." className="pl-10" onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const code = (e.target as HTMLInputElement).value.toUpperCase();
                      const found = readyBoxGroups.find(g => g.box_code === code);
                      if (found) { setSelectedBoxes(prev => new Set(prev).add(found.box_id)); (e.target as HTMLInputElement).value = ''; toast.success(`Added ${code}`); }
                      else toast.error(`Box ${code} not found`);
                    }
                  }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {readyBoxGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No boxes ready for boxing</CardContent></Card>
            ) : readyBoxGroups.map(group => (
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
                    <div className="flex-1 text-sm text-muted-foreground">
                      {group.batches.slice(0, 3).map((b, i) => (
                        <span key={b.id}>
                          {i > 0 && ', '}
                          {b.product?.sku} × {b.quantity}
                          {b.product?.needs_packing ? ' (Boxed)' : ' (Not Boxed)'}
                        </span>
                      ))}
                      {group.batches.length > 3 && <span> +{group.batches.length - 3} more</span>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Process Items (In Boxing -> Ready for Shipment) */}
        <TabsContent value="process" className="space-y-4">
          {canManage && totalSelected > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{totalSelected} items selected</span>
                <Button onClick={() => setMoveToReadyDialogOpen(true)}>
                  <Truck className="h-4 w-4 mr-2" />
                  Move to Ready for Shipment
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {inBoxingGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No items in boxing</CardContent></Card>
            ) : inBoxingGroups.map(group => (
              <Card key={group.order_item_id || group.product_id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{group.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {group.product_sku}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {group.needs_boxing ? 'Needs Boxing' : 'No Boxing'}
                        </Badge>
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Available</p>
                        <p className="text-lg font-semibold">{group.quantity}</p>
                      </div>
                      {canManage && (
                        <div className="w-24">
                          <Label className="text-xs">Select</Label>
                          <Input
                            type="number"
                            min={0}
                            max={group.quantity}
                            value={productSelections.get(group.order_item_id || group.product_id) || ''}
                            onChange={(e) => {
                              const key = group.order_item_id || group.product_id;
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
            ))}
          </div>
        </TabsContent>

        {/* Tab 3: Ready for Shipment -> Create Kartona */}
        <TabsContent value="ready" className="space-y-4">
          {canManage && totalSelectedForShipment > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{totalSelectedForShipment} items selected</span>
                <Button onClick={() => setKartonaDialogOpen(true)}>
                  <Package className="h-4 w-4 mr-2" />
                  Create Kartona
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {readyForShipmentGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No items ready for shipment</CardContent></Card>
            ) : readyForShipmentGroups.map(group => (
              <Card key={group.order_item_id || group.product_id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{group.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {group.product_sku}
                        <Badge variant="outline" className="ml-2 text-xs">
                          {group.needs_boxing ? 'Boxed' : 'Not Boxed'}
                        </Badge>
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-muted-foreground">Available</p>
                        <p className="text-lg font-semibold text-green-600">{group.quantity}</p>
                      </div>
                      {canManage && (
                        <div className="w-24">
                          <Label className="text-xs">Select</Label>
                          <Input
                            type="number"
                            min={0}
                            max={group.quantity}
                            value={readyForShipmentSelections.get(group.order_item_id || group.product_id) || ''}
                            onChange={(e) => {
                              const key = group.order_item_id || group.product_id;
                              const qty = Math.max(0, Math.min(parseInt(e.target.value) || 0, group.quantity));
                              setReadyForShipmentSelections(prev => {
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
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Accept Boxes Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Boxes into Boxing</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Accept {selectedBoxes.size} box(es) with {batches.filter(b => b.current_state === 'ready_for_boxing' && b.box_id && selectedBoxes.has(b.box_id)).reduce((sum, b) => sum + b.quantity, 0)} items into boxing.
            </p>
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

      {/* Move to Ready for Shipment Dialog */}
      <Dialog open={moveToReadyDialogOpen} onOpenChange={setMoveToReadyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Ready for Shipment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Move {totalSelected} items to Ready for Shipment status. They will be available to include in a Kartona.
            </p>
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              {Array.from(productSelections.entries()).map(([productId, qty]) => {
                const group = inBoxingGroups.find(g => g.product_id === productId);
                return (
                  <div key={productId} className="flex justify-between text-sm">
                    <span>{group?.product_sku} - {group?.product_name}</span>
                    <span className="font-medium">× {qty}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveToReadyDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleMoveToReadyForShipment} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Move to Ready
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Kartona Dialog */}
      <Dialog open={kartonaDialogOpen} onOpenChange={setKartonaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Create Kartona
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Create a Kartona with {totalSelectedForShipment} items. This will mark them as fulfilled.
            </p>
            <div className="p-3 bg-muted/50 rounded-lg space-y-1">
              {Array.from(readyForShipmentSelections.entries()).map(([productId, qty]) => {
                const group = readyForShipmentGroups.find(g => g.product_id === productId);
                return (
                  <div key={productId} className="flex justify-between text-sm">
                    <span>
                      {group?.product_sku} - {group?.product_name}
                      <Badge variant="outline" className="ml-2 text-xs">
                        {group?.needs_boxing ? 'Boxed' : 'Not Boxed'}
                      </Badge>
                    </span>
                    <span className="font-medium">× {qty}</span>
                  </div>
                );
              })}
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={shipmentNotes}
                onChange={(e) => setShipmentNotes(e.target.value)}
                placeholder="Add any notes for this Kartona..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKartonaDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateKartona} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
              Create & Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
