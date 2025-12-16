import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OrderTimeline } from '@/components/OrderTimeline';
import { LeadTimeDialog } from '@/components/LeadTimeDialog';
import { MachineSelectionDialog } from '@/components/MachineSelectionDialog';
import { BoxAssignmentDialog } from '@/components/BoxAssignmentDialog';
import { BoxReceiveDialog } from '@/components/BoxReceiveDialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getNextState, getStateLabel, getAllStates, isInState, isReadyForState, type UnitState } from '@/lib/stateMachine';

interface Batch {
  id: string;
  batch_code: string;
  current_state: string;
  quantity: number;
  product_id: string;
  eta: string | null;
  lead_time_days: number | null;
  box_id: string | null;
  is_terminated?: boolean;
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
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  customer_id: string | null;
  profile: {
    full_name: string;
    email: string;
  };
  customer?: {
    name: string;
    code: string | null;
  };
  batches: Batch[];
}

interface ProductItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_packing: boolean;
  quantity: number;
  batches: Array<{ id: string; batch_code: string; quantity: number }>;
}

interface BoxItem {
  box_id: string;
  box_code: string;
  batches: Array<{
    id: string;
    batch_code: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
  }>;
  total_quantity: number;
}

interface StateGroup {
  state: UnitState;
  products: ProductItem[];
  boxes: BoxItem[];
}

interface ProductSelection {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  needs_packing: boolean;
  batches: Array<{ id: string; quantity: number }>;
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateGroups, setStateGroups] = useState<StateGroup[]>([]);
  
  // Dialog states
  const [boxAssignDialogOpen, setBoxAssignDialogOpen] = useState(false);
  const [boxReceiveDialogOpen, setBoxReceiveDialogOpen] = useState(false);
  const [leadTimeDialogOpen, setLeadTimeDialogOpen] = useState(false);
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  
  // Pending operation states
  const [pendingProductSelections, setPendingProductSelections] = useState<ProductSelection[]>([]);
  const [pendingSourceState, setPendingSourceState] = useState<UnitState | null>(null);
  const [pendingBoxes, setPendingBoxes] = useState<Array<{ id: string; box_code: string; batches: Array<{ id: string; quantity: number }> }>>([]);
  const [pendingLeadTimeDays, setPendingLeadTimeDays] = useState<number | undefined>();
  const [pendingEta, setPendingEta] = useState<Date | undefined>();
  const [pendingMachineType, setPendingMachineType] = useState<'manufacturing' | 'packaging' | null>(null);
  const [pendingBoxingOption, setPendingBoxingOption] = useState<'needs_boxing' | 'skip_boxing' | undefined>();

  useEffect(() => {
    fetchOrder();
    
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'batches',
          filter: `order_id=eq.${id}`
        },
        () => {
          fetchOrder();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchOrder = async () => {
    try {
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          customer:customers(name, code),
          batches(
            id,
            batch_code,
            current_state,
            quantity,
            product_id,
            eta,
            lead_time_days,
            box_id,
            product:products(id, name, sku, needs_packing)
          )
        `)
        .eq('id', id)
        .single();

      if (orderError) throw orderError;

      // Fetch box info for batches with box_id
      const boxIds = orderData.batches?.filter((b: any) => b.box_id).map((b: any) => b.box_id) || [];
      let boxMap = new Map();
      
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase
          .from('boxes')
          .select('id, box_code')
          .in('id', boxIds);
        
        boxesData?.forEach(box => boxMap.set(box.id, box));
      }

      const batchesWithBoxes = orderData.batches?.map((batch: any) => ({
        ...batch,
        product: batch.product as any,
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
      })) || [];

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', orderData.created_by)
        .single();

      if (profileError) throw profileError;

      const combinedOrder = {
        ...orderData,
        batches: batchesWithBoxes,
        profile: profileData
      } as Order;
      
      setOrder(combinedOrder);
      
      // Group batches by state
      const groups = groupBatchesByState(batchesWithBoxes);
      setStateGroups(groups);
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const groupBatchesByState = (batches: Batch[]): StateGroup[] => {
    const allStates = getAllStates();
    const groups: StateGroup[] = [];

    for (const state of allStates) {
      const stateBatches = batches.filter(b => b.current_state === state && !b.is_terminated);
      
      if (stateBatches.length === 0) continue;

      const isIn = isInState(state as UnitState);
      const isReady = isReadyForState(state as UnitState);
      const isPendingOrReceived = state === 'pending_rm' || state === 'received';

      // For "In" states and special states: group by product
      const products: ProductItem[] = [];
      const productMap = new Map<string, ProductItem>();
      
      if (isIn || isPendingOrReceived) {
        stateBatches.forEach(batch => {
          if (!productMap.has(batch.product_id)) {
            productMap.set(batch.product_id, {
              product_id: batch.product_id,
              product_name: batch.product?.name || 'Unknown',
              product_sku: batch.product?.sku || 'N/A',
              needs_packing: batch.product?.needs_packing ?? true,
              quantity: 0,
              batches: [],
            });
          }
          const item = productMap.get(batch.product_id)!;
          item.quantity += batch.quantity;
          item.batches.push({
            id: batch.id,
            batch_code: batch.batch_code,
            quantity: batch.quantity,
          });
        });
        products.push(...productMap.values());
      }

      // For "Ready" states: group by box
      const boxes: BoxItem[] = [];
      const boxMap = new Map<string, BoxItem>();
      
      if (isReady) {
        stateBatches.forEach(batch => {
          if (!batch.box_id || !batch.box) return;
          
          if (!boxMap.has(batch.box_id)) {
            boxMap.set(batch.box_id, {
              box_id: batch.box_id,
              box_code: batch.box.box_code,
              batches: [],
              total_quantity: 0,
            });
          }
          const item = boxMap.get(batch.box_id)!;
          item.batches.push({
            id: batch.id,
            batch_code: batch.batch_code,
            product_id: batch.product_id,
            product_name: batch.product?.name || 'Unknown',
            product_sku: batch.product?.sku || 'N/A',
            quantity: batch.quantity,
          });
          item.total_quantity += batch.quantity;
        });
        boxes.push(...boxMap.values());
        
        // Also include products without boxes (shouldn't happen normally but for safety)
        const unboxedBatches = stateBatches.filter(b => !b.box_id);
        if (unboxedBatches.length > 0) {
          unboxedBatches.forEach(batch => {
            if (!productMap.has(batch.product_id)) {
              productMap.set(batch.product_id, {
                product_id: batch.product_id,
                product_name: batch.product?.name || 'Unknown',
                product_sku: batch.product?.sku || 'N/A',
                needs_packing: batch.product?.needs_packing ?? true,
                quantity: 0,
                batches: [],
              });
            }
            const item = productMap.get(batch.product_id)!;
            item.quantity += batch.quantity;
            item.batches.push({
              id: batch.id,
              batch_code: batch.batch_code,
              quantity: batch.quantity,
            });
          });
          products.push(...productMap.values());
        }
      }

      groups.push({ state: state as UnitState, products, boxes });
    }

    return groups;
  };

  const handleSelectProducts = (
    selections: Array<{ product_id: string; quantity: number; needs_packing: boolean; batches: Array<{ id: string; quantity: number }> }>,
    sourceState: UnitState
  ) => {
    // Find full product info
    const productSelections: ProductSelection[] = selections.map(sel => {
      const stateGroup = stateGroups.find(g => g.state === sourceState);
      const product = stateGroup?.products.find(p => p.product_id === sel.product_id);
      return {
        product_id: sel.product_id,
        product_name: product?.product_name || 'Unknown',
        product_sku: product?.product_sku || 'N/A',
        quantity: sel.quantity,
        needs_packing: sel.needs_packing,
        batches: sel.batches,
      };
    });
    
    setPendingProductSelections(productSelections);
    setPendingSourceState(sourceState);
    
    // Determine next action
    const nextState = getNextState(sourceState);
    
    if (!nextState) {
      toast.error('Cannot transition from this state');
      return;
    }

    // If transitioning FROM "In" state TO "Ready" state, need box assignment
    if (isInState(sourceState) && isReadyForState(nextState)) {
      setBoxAssignDialogOpen(true);
    } else if (sourceState === 'pending_rm') {
      // Starting manufacturing - need lead time
      setLeadTimeDialogOpen(true);
    }
  };

  const handleSelectBoxes = (boxIds: string[], sourceState: UnitState) => {
    const stateGroup = stateGroups.find(g => g.state === sourceState);
    if (!stateGroup) return;

    const selectedBoxes = stateGroup.boxes.filter(b => boxIds.includes(b.box_id));
    const pending = selectedBoxes.map(box => ({
      id: box.box_id,
      box_code: box.box_code,
      batches: box.batches.map(b => ({ id: b.id, quantity: b.quantity })),
    }));
    
    setPendingBoxes(pending);
    setPendingSourceState(sourceState);
    setBoxReceiveDialogOpen(true);
  };

  const handleBoxAssignment = async (boxId: string, boxCode: string, boxingOption?: 'needs_boxing' | 'skip_boxing') => {
    if (!pendingSourceState || pendingProductSelections.length === 0) return;
    
    let targetState = getNextState(pendingSourceState);
    if (!targetState) return;
    
    // Handle packaging special case
    if (pendingSourceState === 'in_packaging' && boxingOption === 'skip_boxing') {
      targetState = 'ready_for_receiving';
    }
    
    setPendingBoxingOption(boxingOption);

    // Check if machine tracking needed (coming from manufacturing or packaging)
    if (pendingSourceState === 'in_manufacturing' || pendingSourceState === 'in_packaging') {
      setPendingMachineType(pendingSourceState === 'in_manufacturing' ? 'manufacturing' : 'packaging');
      setMachineDialogOpen(true);
      // Store box info for later
      setPendingBoxes([{ id: boxId, box_code: boxCode, batches: [] }]);
      return;
    }

    await performBoxAssignment(boxId, targetState);
  };

  const performBoxAssignment = async (boxId: string, targetState: UnitState, machineSelections?: Array<{ machineId: string; quantity: number }>) => {
    try {
      for (const selection of pendingProductSelections) {
        for (const batchAlloc of selection.batches) {
          const batch = order?.batches.find(b => b.id === batchAlloc.id);
          if (!batch) continue;

          if (batchAlloc.quantity === batch.quantity) {
            // Update entire batch
            await supabase
              .from('batches')
              .update({
                current_state: targetState,
                box_id: boxId,
              })
              .eq('id', batch.id);
          } else {
            // Split batch
            await supabase
              .from('batches')
              .update({ quantity: batch.quantity - batchAlloc.quantity })
              .eq('id', batch.id);

            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            
            await supabase.from('batches').insert({
              batch_code: batchCode || `B-${Date.now()}`,
              order_id: order!.id,
              product_id: selection.product_id,
              current_state: targetState,
              quantity: batchAlloc.quantity,
              box_id: boxId,
              created_by: user?.id,
            });
          }
        }
      }

      // Record machine production if provided
      if (machineSelections?.length) {
        for (const ms of machineSelections) {
          await supabase.from('machine_production').insert({
            machine_id: ms.machineId,
            unit_id: pendingProductSelections[0].batches[0].id,
            batch_id: pendingProductSelections[0].batches[0].id,
            state_transition: targetState,
            recorded_by: user?.id,
          });
        }
      }

      const totalQty = pendingProductSelections.reduce((sum, p) => sum + p.quantity, 0);
      toast.success(`${totalQty} item(s) assigned to box and moved to ${getStateLabel(targetState)}`);
      
      resetPendingState();
      fetchOrder();
    } catch (error) {
      console.error('Error assigning to box:', error);
      toast.error('Failed to assign to box');
    }
  };

  const handleBoxReceive = async (boxes: Array<{ id: string; box_code: string; batches: Array<{ id: string; quantity: number }> }>) => {
    if (!pendingSourceState) return;
    
    const nextState = getNextState(pendingSourceState);
    if (!nextState) return;

    // Check if lead time needed
    if (['in_manufacturing', 'in_finishing', 'in_packaging', 'in_boxing'].includes(nextState)) {
      setPendingBoxes(boxes);
      setLeadTimeDialogOpen(true);
      return;
    }

    await performReceive(boxes, nextState);
  };

  const performReceive = async (
    boxes: Array<{ id: string; box_code: string; batches: Array<{ id: string; quantity: number }> }>,
    targetState: UnitState,
    leadTimeDays?: number,
    eta?: Date
  ) => {
    try {
      let totalItems = 0;
      
      for (const box of boxes) {
        for (const batchRef of box.batches) {
          await supabase
            .from('batches')
            .update({
              current_state: targetState,
              box_id: null, // Remove from box when entering "In" state
              lead_time_days: leadTimeDays || null,
              eta: eta?.toISOString() || null,
            })
            .eq('id', batchRef.id);
          
          totalItems += batchRef.quantity;
        }
      }

      toast.success(`${totalItems} item(s) received and moved to ${getStateLabel(targetState)}`);
      
      resetPendingState();
      fetchOrder();
    } catch (error) {
      console.error('Error receiving boxes:', error);
      toast.error('Failed to receive boxes');
    }
  };

  const handleLeadTimeConfirm = async (leadTimeDays: number, eta: Date) => {
    setPendingLeadTimeDays(leadTimeDays);
    setPendingEta(eta);

    // If receiving boxes
    if (pendingBoxes.length > 0 && pendingSourceState) {
      const nextState = getNextState(pendingSourceState);
      if (nextState) {
        await performReceive(pendingBoxes, nextState, leadTimeDays, eta);
      }
      return;
    }

    // If starting from pending_rm
    if (pendingSourceState === 'pending_rm' && pendingProductSelections.length > 0) {
      await performStartManufacturing(leadTimeDays, eta);
    }
  };

  const performStartManufacturing = async (leadTimeDays: number, eta: Date) => {
    try {
      for (const selection of pendingProductSelections) {
        for (const batchAlloc of selection.batches) {
          const batch = order?.batches.find(b => b.id === batchAlloc.id);
          if (!batch) continue;

          if (batchAlloc.quantity === batch.quantity) {
            await supabase
              .from('batches')
              .update({
                current_state: 'in_manufacturing',
                lead_time_days: leadTimeDays,
                eta: eta.toISOString(),
              })
              .eq('id', batch.id);
          } else {
            await supabase
              .from('batches')
              .update({ quantity: batch.quantity - batchAlloc.quantity })
              .eq('id', batch.id);

            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            
            await supabase.from('batches').insert({
              batch_code: batchCode || `B-${Date.now()}`,
              order_id: order!.id,
              product_id: selection.product_id,
              current_state: 'in_manufacturing',
              quantity: batchAlloc.quantity,
              lead_time_days: leadTimeDays,
              eta: eta.toISOString(),
              created_by: user?.id,
            });
          }
        }
      }

      const totalQty = pendingProductSelections.reduce((sum, p) => sum + p.quantity, 0);
      toast.success(`${totalQty} item(s) started manufacturing`);
      
      resetPendingState();
      fetchOrder();
    } catch (error) {
      console.error('Error starting manufacturing:', error);
      toast.error('Failed to start manufacturing');
    }
  };

  const handleMachineConfirm = async (selections: Array<{ machineId: string; quantity: number }>) => {
    if (!pendingSourceState) return;
    
    let targetState = getNextState(pendingSourceState);
    if (!targetState) return;

    // Handle packaging skip boxing
    if (pendingSourceState === 'in_packaging' && pendingBoxingOption === 'skip_boxing') {
      targetState = 'ready_for_receiving';
    }

    const boxId = pendingBoxes[0]?.id;
    if (boxId) {
      await performBoxAssignment(boxId, targetState, selections);
    }
  };

  const handleCreateNewBox = async (): Promise<{ id: string; box_code: string } | null> => {
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

  const resetPendingState = () => {
    setPendingProductSelections([]);
    setPendingSourceState(null);
    setPendingBoxes([]);
    setPendingLeadTimeDays(undefined);
    setPendingEta(undefined);
    setPendingMachineType(null);
    setPendingBoxingOption(undefined);
  };

  const canUpdateBatches = () => {
    return hasRole('manufacture_lead') || 
           hasRole('manufacturer') || 
           hasRole('packer') || 
           hasRole('boxer') ||
           hasRole('packaging_manager') ||
           hasRole('boxing_manager') ||
           hasRole('admin');
  };

  const canDeleteOrder = () => {
    return hasRole('manufacture_lead') || hasRole('admin');
  };

  const handleDeleteOrder = async () => {
    try {
      await supabase.from('batches').delete().eq('order_id', id);
      await supabase.from('order_items').delete().eq('order_id', id);
      await supabase.from('notifications').delete().eq('order_id', id);
      
      const { error } = await supabase.from('orders').delete().eq('id', id);
      if (error) throw error;
      
      toast.success('Order deleted successfully');
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Failed to delete order');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'pending_rm': 'bg-yellow-500',
      'in_manufacturing': 'bg-blue-500',
      'ready_for_finishing': 'bg-blue-300',
      'in_finishing': 'bg-purple-500',
      'ready_for_packaging': 'bg-orange-500',
      'in_packaging': 'bg-indigo-500',
      'ready_for_boxing': 'bg-cyan-300',
      'in_boxing': 'bg-cyan-500',
      'ready_for_receiving': 'bg-teal-300',
      'received': 'bg-green-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="container mx-auto p-6">
        <p>Order not found</p>
      </div>
    );
  }

  const allBatches = order.batches || [];
  const lateBatches = allBatches.filter(b => b.eta && new Date(b.eta) < new Date());
  const lateItemsCount = lateBatches.reduce((sum, b) => sum + b.quantity, 0);
  const totalItems = allBatches.reduce((sum, b) => sum + b.quantity, 0);
  const canUpdate = canUpdateBatches();
  const totalSelectedQty = pendingProductSelections.reduce((sum, p) => sum + p.quantity, 0);

  // Build timeline batches
  const timelineBatches = allBatches.map(b => ({
    id: b.id,
    batch_code: b.batch_code,
    product_id: b.product_id,
    product_name: b.product?.name || 'Unknown',
    product_sku: b.product?.sku || 'N/A',
    state: b.current_state as UnitState,
    total_quantity: b.quantity,
    earliest_eta: b.eta || undefined,
    has_late_units: b.eta ? new Date(b.eta) < new Date() : false,
    lead_time_days: b.lead_time_days || undefined,
  }));

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">{order.order_number}</h1>
              {order.priority === 'high' && (
                <Badge variant="destructive" className="text-sm">
                  High Priority
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Created by {order.profile.full_name} on {format(new Date(order.created_at), 'PPP')}
            </p>
            {order.customer && (
              <p className="text-sm text-muted-foreground">
                Customer: {order.customer.name} {order.customer.code && `(${order.customer.code})`}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={getStatusColor(order.status)}>
            {getStateLabel(order.status as UnitState)}
          </Badge>
          {canDeleteOrder() && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Order</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete order {order.order_number}? This action cannot be undone and will remove all batches and related data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Delete Order
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {lateItemsCount > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-medium">
              {lateItemsCount} item(s) in {lateBatches.length} batch(es) are behind schedule
            </span>
          </CardContent>
        </Card>
      )}

      <OrderTimeline batches={timelineBatches} />

      <Card>
        <CardHeader>
          <CardTitle>Order Progress ({totalItems} total items)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {stateGroups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No items in this order</p>
          ) : (
            stateGroups.map((group) => (
              <StateGroupCard
                key={group.state}
                group={group}
                canUpdate={canUpdate}
                onSelectProducts={(selections) => handleSelectProducts(selections, group.state)}
                onSelectBoxes={(boxIds) => handleSelectBoxes(boxIds, group.state)}
              />
            ))
          )}
        </CardContent>
      </Card>

      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{order.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <BoxAssignmentDialog
        open={boxAssignDialogOpen}
        onOpenChange={(open) => {
          setBoxAssignDialogOpen(open);
          if (!open) resetPendingState();
        }}
        onConfirm={handleBoxAssignment}
        onCreateNewBox={handleCreateNewBox}
        products={pendingProductSelections}
        currentState={pendingSourceState || 'pending_rm'}
        title={`Assign ${totalSelectedQty} item(s) to Box`}
      />

      <BoxReceiveDialog
        open={boxReceiveDialogOpen}
        onOpenChange={(open) => {
          setBoxReceiveDialogOpen(open);
          if (!open) resetPendingState();
        }}
        onConfirm={handleBoxReceive}
        orderId={order.id}
        filterState={pendingSourceState || 'ready_for_finishing'}
        title={pendingSourceState ? `Receive from ${getStateLabel(pendingSourceState)}` : 'Receive'}
      />

      <LeadTimeDialog
        open={leadTimeDialogOpen}
        onOpenChange={(open) => {
          setLeadTimeDialogOpen(open);
          if (!open) resetPendingState();
        }}
        onConfirm={handleLeadTimeConfirm}
        unitCount={totalSelectedQty || pendingBoxes.reduce((sum, b) => sum + b.batches.reduce((s, bb) => s + bb.quantity, 0), 0)}
        nextState={pendingSourceState ? getNextState(pendingSourceState) || '' : ''}
      />

      {pendingMachineType && (
        <MachineSelectionDialog
          open={machineDialogOpen}
          onOpenChange={(open) => {
            setMachineDialogOpen(open);
            if (!open) resetPendingState();
          }}
          onConfirm={handleMachineConfirm}
          totalUnits={totalSelectedQty}
          machineType={pendingMachineType}
        />
      )}
    </div>
  );
}

// State Group Card Component
interface StateGroupCardProps {
  group: StateGroup;
  canUpdate: boolean;
  onSelectProducts: (selections: Array<{ product_id: string; quantity: number; needs_packing: boolean; batches: Array<{ id: string; quantity: number }> }>) => void;
  onSelectBoxes: (boxIds: string[]) => void;
}

function StateGroupCard({ group, canUpdate, onSelectProducts, onSelectBoxes }: StateGroupCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());

  const isIn = isInState(group.state) || group.state === 'pending_rm';
  const isReady = isReadyForState(group.state);
  const isReceived = group.state === 'received';
  
  const totalItems = isIn || isReceived
    ? group.products.reduce((sum, p) => sum + p.quantity, 0)
    : group.boxes.reduce((sum, b) => sum + b.total_quantity, 0);

  if (totalItems === 0) return null;

  const handleProductQuantityChange = (productId: string, qty: number, maxQty: number) => {
    setProductSelections(prev => {
      const newMap = new Map(prev);
      if (qty > 0 && qty <= maxQty) {
        newMap.set(productId, qty);
      } else if (qty <= 0) {
        newMap.delete(productId);
      }
      return newMap;
    });
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

  const handleConfirmProductSelection = () => {
    const selections: Array<{ product_id: string; quantity: number; needs_packing: boolean; batches: Array<{ id: string; quantity: number }> }> = [];
    
    productSelections.forEach((qty, productId) => {
      const product = group.products.find(p => p.product_id === productId);
      if (product && qty > 0) {
        let remaining = qty;
        const batchAllocs: Array<{ id: string; quantity: number }> = [];
        
        for (const batch of product.batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, batch.quantity);
          batchAllocs.push({ id: batch.id, quantity: take });
          remaining -= take;
        }
        
        selections.push({
          product_id: productId,
          quantity: qty,
          needs_packing: product.needs_packing,
          batches: batchAllocs,
        });
      }
    });
    
    if (selections.length > 0) {
      onSelectProducts(selections);
      setProductSelections(new Map());
    }
  };

  const handleConfirmBoxSelection = () => {
    if (selectedBoxes.size > 0) {
      onSelectBoxes(Array.from(selectedBoxes));
      setSelectedBoxes(new Set());
    }
  };

  const handlePrintBoxIds = () => {
    const selectedBoxCodes = group.boxes
      .filter(b => selectedBoxes.has(b.box_id))
      .map(b => b.box_code);
    
    if (selectedBoxCodes.length === 0) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Box IDs</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            .box-id { 
              font-size: 32px; 
              font-weight: bold; 
              padding: 15px 30px;
              margin: 15px 0;
              border: 3px solid black;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          ${selectedBoxCodes.map(code => `<div class="box-id">${code}</div>`).join('')}
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const totalSelectedProducts = Array.from(productSelections.values()).reduce((sum, qty) => sum + qty, 0);
  const totalSelectedBoxItems = group.boxes
    .filter(b => selectedBoxes.has(b.box_id))
    .reduce((sum, b) => sum + b.total_quantity, 0);

  const stateColors: Record<string, string> = {
    'pending_rm': 'bg-yellow-500',
    'in_manufacturing': 'bg-blue-500',
    'ready_for_finishing': 'bg-blue-300',
    'in_finishing': 'bg-purple-500',
    'ready_for_packaging': 'bg-orange-500',
    'in_packaging': 'bg-indigo-500',
    'ready_for_boxing': 'bg-cyan-300',
    'in_boxing': 'bg-cyan-500',
    'ready_for_receiving': 'bg-teal-300',
    'received': 'bg-green-500',
  };

  return (
    <div className="border rounded-lg">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <Badge className={stateColors[group.state] || 'bg-gray-500'}>
            {getStateLabel(group.state)}
          </Badge>
          <span className="text-muted-foreground">
            {totalItems} item{totalItems !== 1 ? 's' : ''}
            {isReady && group.boxes.length > 0 && ` in ${group.boxes.length} box${group.boxes.length !== 1 ? 'es' : ''}`}
          </span>
        </div>
        <span className="text-muted-foreground">{expanded ? '▼' : '▶'}</span>
      </div>
      
      {expanded && (
        <div className="p-4 pt-0 space-y-3">
          {/* "In" states and pending_rm - show products by quantity */}
          {(isIn || group.state === 'pending_rm') && group.products.length > 0 && (
            <>
              <div className="space-y-2">
                {group.products.map((product) => (
                  <div 
                    key={product.product_id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{product.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        SKU: {product.product_sku}
                        {!product.needs_packing && (
                          <Badge variant="outline" className="ml-2 text-xs">No Packing</Badge>
                        )}
                      </p>
                      <p className="text-sm font-medium mt-1">Available: {product.quantity}</p>
                    </div>
                    {canUpdate && group.state !== 'received' && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="0"
                          max={product.quantity}
                          value={productSelections.get(product.product_id) || ''}
                          onChange={(e) => handleProductQuantityChange(
                            product.product_id, 
                            parseInt(e.target.value) || 0,
                            product.quantity
                          )}
                          placeholder="0"
                          className="w-20 text-center px-2 py-1 border rounded"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleProductQuantityChange(
                              product.product_id,
                              product.quantity,
                              product.quantity
                            );
                          }}
                        >
                          All
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              
              {canUpdate && totalSelectedProducts > 0 && group.state !== 'received' && (
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {totalSelectedProducts} item{totalSelectedProducts !== 1 ? 's' : ''} selected
                  </span>
                  <Button onClick={handleConfirmProductSelection}>
                    {group.state === 'pending_rm' ? 'Start Manufacturing' : 'Assign to Box'}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* "Ready" states - show boxes */}
          {isReady && group.boxes.length > 0 && (
            <>
              <div className="space-y-2">
                {group.boxes.map((box) => (
                  <div 
                    key={box.box_id}
                    className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                      selectedBoxes.has(box.box_id) 
                        ? 'border-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => canUpdate && handleBoxToggle(box.box_id)}
                  >
                    {canUpdate && (
                      <input
                        type="checkbox"
                        checked={selectedBoxes.has(box.box_id)}
                        onChange={() => handleBoxToggle(box.box_id)}
                        className="h-4 w-4"
                      />
                    )}
                    <div className="flex-1">
                      <p className="font-mono font-bold">{box.box_code}</p>
                      <div className="text-sm text-muted-foreground">
                        {box.batches.map((b, i) => (
                          <span key={b.id}>
                            {i > 0 && ', '}
                            {b.product_sku} × {b.quantity}
                          </span>
                        ))}
                      </div>
                    </div>
                    <Badge variant="secondary">{box.total_quantity} items</Badge>
                  </div>
                ))}
              </div>
              
              {canUpdate && selectedBoxes.size > 0 && (
                <div className="flex items-center justify-between pt-3 border-t">
                  <span className="text-sm text-muted-foreground">
                    {selectedBoxes.size} box{selectedBoxes.size !== 1 ? 'es' : ''} selected ({totalSelectedBoxItems} items)
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={handlePrintBoxIds}>
                      Print IDs
                    </Button>
                    <Button onClick={handleConfirmBoxSelection}>
                      Receive Selected
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Received state */}
          {isReceived && group.products.length > 0 && (
            <div className="space-y-2">
              {group.products.map((product) => (
                <div 
                  key={product.product_id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-green-50 dark:bg-green-950/20"
                >
                  <div>
                    <p className="font-medium">{product.product_name}</p>
                    <p className="text-sm text-muted-foreground">SKU: {product.product_sku}</p>
                  </div>
                  <Badge className="bg-green-500">{product.quantity} received</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
