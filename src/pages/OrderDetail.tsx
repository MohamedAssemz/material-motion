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
import { BatchCard, type BatchInfo } from '@/components/BatchCard';
import { LeadTimeDialog } from '@/components/LeadTimeDialog';
import { ProductProgress } from '@/components/ProductProgress';
import { MachineSelectionDialog } from '@/components/MachineSelectionDialog';
import { BatchQRCode } from '@/components/BatchQRCode';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getNextState, requiresLeadTimeInput, getStateLabel, type UnitState } from '@/lib/stateMachine';

interface Batch {
  id: string;
  batch_code: string;
  current_state: string;
  quantity: number;
  product_id: string;
  eta: string | null;
  lead_time_days: number | null;
  product: {
    name: string;
    sku: string;
  };
}

interface ProductGroup {
  product_id: string;
  product_name: string;
  product_sku: string;
  batches: BatchInfo[];
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

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [batchSelections, setBatchSelections] = useState<Map<string, number>>(new Map());
  const [leadTimeDialogOpen, setLeadTimeDialogOpen] = useState(false);
  const [pendingStateChange, setPendingStateChange] = useState<UnitState | null>(null);
  const [machineDialogOpen, setMachineDialogOpen] = useState(false);
  const [pendingMachineType, setPendingMachineType] = useState<'manufacturing' | 'packaging' | null>(null);
  const [pendingUpdateData, setPendingUpdateData] = useState<{ newState: UnitState; leadTimeDays?: number; eta?: Date } | null>(null);

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
            product:products(name, sku)
          )
        `)
        .eq('id', id)
        .single();

      if (orderError) throw orderError;

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', orderData.created_by)
        .single();

      if (profileError) throw profileError;

      const combinedOrder = {
        ...orderData,
        profile: profileData
      } as Order;
      
      setOrder(combinedOrder);
      
      // Group batches by product
      const productMap = new Map<string, ProductGroup>();
      
      (combinedOrder.batches || []).forEach((batch: Batch) => {
        if (!productMap.has(batch.product_id)) {
          productMap.set(batch.product_id, {
            product_id: batch.product_id,
            product_name: batch.product?.name || 'Unknown Product',
            product_sku: batch.product?.sku || 'N/A',
            batches: [],
          });
        }
        
        const productGroup = productMap.get(batch.product_id)!;
        const isLate = batch.eta ? new Date(batch.eta) < new Date() : false;
        
        productGroup.batches.push({
          id: batch.id,
          batch_code: batch.batch_code,
          product_id: batch.product_id,
          product_name: batch.product?.name || 'Unknown Product',
          product_sku: batch.product?.sku || 'N/A',
          state: batch.current_state as UnitState,
          total_quantity: batch.quantity,
          earliest_eta: batch.eta || undefined,
          has_late_units: isLate,
          lead_time_days: batch.lead_time_days || undefined,
        });
      });
      
      setProductGroups(Array.from(productMap.values()));
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handleBatchQuantityChange = (batch: BatchInfo, quantity: number) => {
    setBatchSelections(prev => {
      const newMap = new Map(prev);
      if (quantity > 0) {
        newMap.set(batch.id, quantity);
      } else {
        newMap.delete(batch.id);
      }
      return newMap;
    });
  };

  const getSelectedBatches = (): Array<{ batch: BatchInfo; quantity: number }> => {
    const selected: Array<{ batch: BatchInfo; quantity: number }> = [];
    
    batchSelections.forEach((quantity, batchId) => {
      const batch = productGroups
        .flatMap(pg => pg.batches)
        .find(b => b.id === batchId);
      if (batch) {
        selected.push({ batch, quantity });
      }
    });
    
    return selected;
  };

  const getTotalSelectedCount = (): number => {
    return Array.from(batchSelections.values()).reduce((sum, qty) => sum + qty, 0);
  };

  const getSelectedBatchState = (): UnitState | null => {
    const selectedBatches = getSelectedBatches();
    if (selectedBatches.length === 0) return null;
    
    const states = new Set(selectedBatches.map(s => s.batch.state));
    if (states.size !== 1) return null;
    
    return Array.from(states)[0];
  };

  const handleBulkUpdate = async () => {
    const totalSelected = getTotalSelectedCount();
    if (totalSelected === 0) {
      toast.error('Please select at least one batch');
      return;
    }

    const selectedBatches = getSelectedBatches();
    const nextStates = new Set(selectedBatches.map(s => getNextState(s.batch.state)).filter(Boolean));
    
    if (nextStates.size > 1) {
      toast.error('Selected batches must have the same next state');
      return;
    }
    
    const nextState = Array.from(nextStates)[0];
    if (!nextState) {
      toast.error('Selected batches are already in final state');
      return;
    }
    
    if (requiresLeadTimeInput(nextState)) {
      setPendingStateChange(nextState);
      setLeadTimeDialogOpen(true);
    } else {
      await updateBatchesState(nextState);
    }
  };

  const updateBatchesState = async (newState: UnitState, leadTimeDays?: number, eta?: Date) => {
    try {
      const currentState = getSelectedBatchState();
      
      // Check if machine tracking is needed (transitioning from manufacturing or packaging states)
      if (currentState === 'in_manufacturing' || currentState === 'in_packaging') {
        setPendingUpdateData({ newState, leadTimeDays, eta });
        setPendingMachineType(currentState === 'in_manufacturing' ? 'manufacturing' : 'packaging');
        setMachineDialogOpen(true);
        return;
      }
      
      await performUpdate(newState, leadTimeDays, eta);
    } catch (error) {
      console.error('Error updating batches:', error);
      toast.error('Failed to update batches');
    }
  };

  const performUpdate = async (
    newState: UnitState, 
    leadTimeDays?: number, 
    eta?: Date,
    machineSelections?: Array<{ machineId: string; quantity: number }>
  ) => {
    try {
      const selectedBatches = getSelectedBatches();
      let totalUpdated = 0;
      
      for (const { batch, quantity } of selectedBatches) {
        if (quantity === batch.total_quantity) {
          // Update entire batch
          const { error } = await supabase
            .from('batches')
            .update({ 
              current_state: newState,
              eta: eta?.toISOString() || null,
              lead_time_days: leadTimeDays || null,
            })
            .eq('id', batch.id);

          if (error) throw error;
          totalUpdated += quantity;
        } else {
          // Split batch: reduce original, create new batch with selected quantity
          const { error: updateError } = await supabase
            .from('batches')
            .update({ quantity: batch.total_quantity - quantity })
            .eq('id', batch.id);

          if (updateError) throw updateError;

          // Create new batch with the selected quantity in new state
          const { data: batchCode } = await supabase.rpc('generate_batch_code');
          
          const { error: insertError } = await supabase
            .from('batches')
            .insert({
              batch_code: batchCode || `B-${Date.now()}`,
              order_id: order!.id,
              product_id: batch.product_id,
              current_state: newState,
              quantity: quantity,
              eta: eta?.toISOString() || null,
              lead_time_days: leadTimeDays || null,
              created_by: user?.id,
            });

          if (insertError) throw insertError;
          totalUpdated += quantity;
        }
      }

      // Record machine production if provided
      if (machineSelections && machineSelections.length > 0) {
        for (const selection of machineSelections) {
          // Record at batch level - simplified machine tracking
          const { batch } = selectedBatches[0];
          await supabase
            .from('machine_production')
            .insert({
              machine_id: selection.machineId,
              unit_id: batch.id, // Using batch id as reference
              batch_id: batch.id,
              state_transition: newState,
              recorded_by: user?.id,
            });
        }
      }

      toast.success(`Updated ${totalUpdated} item(s)`);
      setBatchSelections(new Map());
      fetchOrder();
    } catch (error) {
      console.error('Error updating batches:', error);
      toast.error('Failed to update batches');
    }
  };

  const handleMachineConfirm = async (selections: Array<{ machineId: string; quantity: number }>) => {
    if (pendingUpdateData) {
      await performUpdate(
        pendingUpdateData.newState, 
        pendingUpdateData.leadTimeDays, 
        pendingUpdateData.eta,
        selections
      );
      setPendingUpdateData(null);
      setPendingMachineType(null);
    }
  };

  const handleLeadTimeConfirm = async (leadTimeDays: number, eta: Date) => {
    if (pendingStateChange) {
      await updateBatchesState(pendingStateChange, leadTimeDays, eta);
      setPendingStateChange(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'waiting_for_rm': 'bg-yellow-500',
      'in_manufacturing': 'bg-blue-500',
      'manufactured': 'bg-blue-300',
      'waiting_for_pm': 'bg-orange-500',
      'in_packaging': 'bg-indigo-500',
      'packaged': 'bg-indigo-300',
      'waiting_for_bm': 'bg-orange-500',
      'in_boxing': 'bg-cyan-500',
      'boxed': 'bg-cyan-300',
      'qced': 'bg-teal-500',
      'finished': 'bg-green-500',
    };
    return colors[status] || 'bg-gray-500';
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
  
  const getNextStateLabel = (): string | null => {
    const selectedBatches = getSelectedBatches();
    if (selectedBatches.length === 0) return null;
    
    const nextStates = new Set(selectedBatches.map(s => getNextState(s.batch.state)).filter(Boolean));
    if (nextStates.size !== 1) return null;
    
    const nextState = Array.from(nextStates)[0];
    return nextState ? getStateLabel(nextState) : null;
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

  const allBatches = productGroups.flatMap(pg => pg.batches);
  const lateBatches = allBatches.filter(b => b.has_late_units);
  const lateItemsCount = lateBatches.reduce((sum, b) => sum + b.total_quantity, 0);
  const totalItems = allBatches.reduce((sum, b) => sum + b.total_quantity, 0);
  const totalSelected = getTotalSelectedCount();
  const nextStateLabel = getNextStateLabel();
  const canUpdate = canUpdateBatches();

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
            {order.status.replace(/_/g, ' ').toUpperCase()}
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

      <OrderTimeline batches={allBatches} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Order Batches ({totalItems} total items in {allBatches.length} batches)</CardTitle>
            {totalSelected > 0 && canUpdate && (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground">
                  {totalSelected} item(s) selected
                </span>
                {nextStateLabel && (
                  <Button
                    size="sm"
                    onClick={handleBulkUpdate}
                  >
                    Move to {nextStateLabel}
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {productGroups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No batches in this order</p>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {productGroups.map(productGroup => {
                const totalUnits = productGroup.batches.reduce((sum, b) => sum + b.total_quantity, 0);
                const stateCounts = productGroup.batches.map(b => ({
                  state: b.state,
                  count: b.total_quantity,
                }));
                
                return (
                  <div key={productGroup.product_id} className="space-y-3 border rounded-lg p-4">
                    <div className="space-y-2 pb-3 border-b">
                      <div className="flex items-center justify-between">
                        <h3 className="font-semibold">{productGroup.product_name}</h3>
                        <span className="text-sm font-medium text-muted-foreground">{totalUnits} items</span>
                      </div>
                      <p className="text-sm text-muted-foreground">SKU: {productGroup.product_sku}</p>
                      <ProductProgress totalUnits={totalUnits} stateCounts={stateCounts} />
                    </div>
                    <div className="space-y-2">
                      {productGroup.batches.map(batch => (
                        <div key={batch.id} className="relative">
                          <BatchCard
                            batch={batch}
                            selectedQuantity={batchSelections.get(batch.id) || 0}
                            onQuantityChange={(qty) => handleBatchQuantityChange(batch, qty)}
                            canUpdate={canUpdate}
                          />
                          <div className="absolute top-2 right-2">
                            <BatchQRCode
                              batchCode={batch.batch_code}
                              orderNumber={order.order_number}
                              productName={batch.product_name}
                              state={batch.state}
                              quantity={batch.total_quantity}
                              eta={batch.earliest_eta}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
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

      <LeadTimeDialog
        open={leadTimeDialogOpen}
        onOpenChange={setLeadTimeDialogOpen}
        onConfirm={handleLeadTimeConfirm}
        unitCount={getTotalSelectedCount()}
        nextState={pendingStateChange || ''}
      />

      {pendingMachineType && (
        <MachineSelectionDialog
          open={machineDialogOpen}
          onOpenChange={setMachineDialogOpen}
          onConfirm={handleMachineConfirm}
          totalUnits={getTotalSelectedCount()}
          machineType={pendingMachineType}
        />
      )}
    </div>
  );
}