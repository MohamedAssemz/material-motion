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
  Box, 
  Loader2, 
  QrCode, 
  CheckSquare,
  Truck,
  Printer
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
  box_id: string | null;
  product: { id: string; name: string; sku: string };
  box?: { id: string; box_code: string } | null;
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

interface ProductGroup {
  product_id: string;
  product_name: string;
  product_sku: string;
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
  const [etaDays, setEtaDays] = useState('1');
  
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
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
          .select('id, batch_code, current_state, quantity, product_id, box_id, product:products(id, name, sku)')
          .eq('order_id', id)
          .eq('is_terminated', false)
          .in('current_state', ['ready_for_boxing', 'in_boxing'])
      ]);
      
      if (orderRes.error) throw orderRes.error;
      if (batchesRes.error) throw batchesRes.error;
      
      const boxIds = batchesRes.data?.filter((b: any) => b.box_id).map((b: any) => b.box_id) || [];
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase.from('boxes').select('id, box_code').in('id', boxIds);
        boxesData?.forEach(box => boxMap.set(box.id, box));
      }
      
      const batchesWithBoxes = batchesRes.data?.map((batch: any) => ({
        ...batch,
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
      })) || [];
      
      setOrder(orderRes.data as Order);
      setBatches(batchesWithBoxes as Batch[]);
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

  // Group in_boxing by product
  const inBoxingGroups: ProductGroup[] = [];
  const productMap = new Map<string, ProductGroup>();
  batches.filter(b => b.current_state === 'in_boxing').forEach(batch => {
    if (!productMap.has(batch.product_id)) {
      productMap.set(batch.product_id, { product_id: batch.product_id, product_name: batch.product?.name || 'Unknown', product_sku: batch.product?.sku || 'N/A', quantity: 0, batches: [] });
    }
    const group = productMap.get(batch.product_id)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
  });
  productMap.forEach(g => inBoxingGroups.push(g));

  const totalReadyForBoxing = readyBoxGroups.reduce((sum, g) => sum + g.totalQty, 0);
  const totalInBoxing = inBoxingGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);

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
      const batchIds = batches.filter(b => b.current_state === 'ready_for_boxing' && b.box_id && selectedBoxes.has(b.box_id)).map(b => b.id);
      await supabase.from('batches').update({ current_state: 'in_boxing', eta: etaDate.toISOString(), lead_time_days: parseInt(etaDays) || 1 }).in('id', batchIds);
      toast.success(`Accepted ${selectedBoxes.size} box(es) into boxing`);
      setSelectedBoxes(new Set());
      setAcceptDialogOpen(false);
      fetchData();
    } catch (error: any) { toast.error(error.message); } 
    finally { setSubmitting(false); }
  };

  const handleCreateShipment = async () => {
    if (totalSelected === 0) return;
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
      for (const [productId, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        const group = inBoxingGroups.find(g => g.product_id === productId);
        if (!group) continue;
        
        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          
          // Add to shipment items
          shipmentItems.push({
            shipment_id: shipment.id,
            batch_id: batch.id,
            quantity: useQty,
          });
          
          if (useQty === batch.quantity) {
            // Update entire batch to received
            await supabase.from('batches').update({ current_state: 'received' }).eq('id', batch.id);
          } else {
            // Split batch
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
      
      // Insert shipment items
      if (shipmentItems.length > 0) {
        await supabase.from('shipment_items').insert(shipmentItems);
      }
      
      toast.success(`Created shipment ${shipment.shipment_code}`);
      
      // Print label
      printShipmentLabel(shipment.shipment_code, order!, totalSelected);
      
      setShipmentDialogOpen(false);
      setProductSelections(new Map());
      setShipmentNotes('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const printShipmentLabel = (shipmentCode: string, order: Order, quantity: number) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const selectedItems = Array.from(productSelections.entries()).map(([pid, qty]) => {
      const group = inBoxingGroups.find(g => g.product_id === pid);
      return group ? { sku: group.product_sku, name: group.product_name, qty } : null;
    }).filter(Boolean);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shipment ${shipmentCode}</title>
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
          </style>
        </head>
        <body>
          <div class="header">
            <div class="code">${shipmentCode}</div>
            <div class="order">${order.order_number}</div>
            <div class="customer">${order.customer?.name || 'N/A'}</div>
          </div>
          <div class="section">
            <div class="label">CONTENTS:</div>
            <table>
              ${selectedItems.map((item: any) => `<tr><td>${item.sku}</td><td>${item.name}</td><td style="text-align:right">${item.qty}</td></tr>`).join('')}
              <tr class="total"><td colspan="2">Total Items</td><td style="text-align:right">${quantity}</td></tr>
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
          <Button variant="ghost" onClick={() => navigate(`/orders/${id}`)}><ArrowLeft className="h-4 w-4" /></Button>
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
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Ready for Boxing</p><p className="text-2xl font-bold text-warning">{totalReadyForBoxing}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">In Boxing</p><p className="text-2xl font-bold text-primary">{totalInBoxing}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Boxes Waiting</p><p className="text-2xl font-bold">{readyBoxGroups.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Products</p><p className="text-2xl font-bold">{inBoxingGroups.length}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="receive" className="space-y-4">
        <TabsList>
          <TabsTrigger value="receive">Receive Boxes ({readyBoxGroups.length})</TabsTrigger>
          <TabsTrigger value="process">Create Shipment ({totalInBoxing})</TabsTrigger>
        </TabsList>

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
                    <div className="flex-1 text-sm text-muted-foreground">{group.batches.map(b => `${b.product?.sku} (${b.quantity})`).join(', ')}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="process" className="space-y-4">
          {canManage && totalSelected > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <Badge variant="secondary" className="text-lg px-3 py-1">{totalSelected} selected</Badge>
                <Button onClick={() => setShipmentDialogOpen(true)}>
                  <Truck className="h-4 w-4 mr-2" />
                  Create Kartona
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {inBoxingGroups.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No items in boxing</CardContent></Card>
            ) : inBoxingGroups.map(group => (
              <Card key={group.product_id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{group.product_name}</p>
                      <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center"><p className="text-lg font-semibold">{group.quantity}</p><p className="text-xs text-muted-foreground">In Boxing</p></div>
                      {canManage && (
                        <div className="w-24">
                          <Label className="text-xs">Select Qty</Label>
                          <Input type="number" min={0} max={group.quantity} value={productSelections.get(group.product_id) || ''} onChange={(e) => {
                            const qty = Math.max(0, Math.min(parseInt(e.target.value) || 0, group.quantity));
                            setProductSelections(prev => { const next = new Map(prev); if (qty > 0) next.set(group.product_id, qty); else next.delete(group.product_id); return next; });
                          }} placeholder="0" />
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

      {/* Accept Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Accept Boxes into Boxing</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p>Accept {selectedBoxes.size} box(es) into boxing with ETA of {etaDays} day(s)?</p>
            <div className="max-h-[200px] overflow-y-auto space-y-2">
              {Array.from(selectedBoxes).map(boxId => {
                const group = readyBoxGroups.find(g => g.box_id === boxId);
                return group ? <div key={boxId} className="flex items-center justify-between p-2 bg-muted rounded"><span className="font-mono">{group.box_code}</span><span className="text-sm text-muted-foreground">{group.totalQty} items</span></div> : null;
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAcceptBoxes} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Accept</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Shipment Dialog */}
      <Dialog open={shipmentDialogOpen} onOpenChange={setShipmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Create Kartona (Shipment)
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">Items to ship: {totalSelected}</p>
              <div className="text-xs text-muted-foreground mt-1">
                {Array.from(productSelections.entries()).map(([pid, qty]) => {
                  const group = inBoxingGroups.find(g => g.product_id === pid);
                  return group ? <div key={pid}>{group.product_sku}: {qty}</div> : null;
                })}
              </div>
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={shipmentNotes}
                onChange={(e) => setShipmentNotes(e.target.value)}
                placeholder="Shipment notes..."
                rows={2}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Creating a shipment will mark these items as "Received" and generate a printable label.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShipmentDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateShipment} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Printer className="h-4 w-4 mr-2" />}
              Create & Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
