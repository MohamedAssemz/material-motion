import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OrderTimeline } from '@/components/OrderTimeline';
import { BatchCard } from '@/components/BatchCard';
import { LeadTimeDialog } from '@/components/LeadTimeDialog';
import { ProductProgress } from '@/components/ProductProgress';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { getNextState, requiresLeadTimeInput, getStateLabel, type UnitState } from '@/lib/stateMachine';

interface Unit {
  id: string;
  serial_no: string | null;
  state: UnitState;
  created_at: string;
  product_id: string;
  product: {
    name: string;
    sku: string;
  };
  stage_eta: Array<{
    stage: string;
    eta: string;
    notified: boolean;
    lead_time_days: number | null;
  }>;
}

interface BatchInfo {
  product_id: string;
  product_name: string;
  product_sku: string;
  state: UnitState;
  total_quantity: number;
  unit_ids: string[];
  earliest_eta?: string;
  latest_eta?: string;
  has_late_units: boolean;
  lead_time_days?: number;
}

interface ProductGroup {
  product_id: string;
  product_name: string;
  product_sku: string;
  batches: BatchInfo[];
}

interface BatchSelection {
  product_id: string;
  state: string;
  quantity: number;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
  created_by: string;
  profile: {
    full_name: string;
    email: string;
  };
  units: Unit[];
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [productGroups, setProductGroups] = useState<ProductGroup[]>([]);
  const [batchSelections, setBatchSelections] = useState<Map<string, number>>(new Map());
  const [leadTimeDialogOpen, setLeadTimeDialogOpen] = useState(false);
  const [pendingStateChange, setPendingStateChange] = useState<UnitState | null>(null);

  useEffect(() => {
    fetchOrder();
    
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'units',
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
      // Fetch order with units
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select(`
          *,
          units(
            id,
            serial_no,
            state,
            created_at,
            product:products(name, sku),
            stage_eta:unit_stage_eta(stage, eta, notified, lead_time_days)
          )
        `)
        .eq('id', id)
        .single();

      if (orderError) throw orderError;

      // Fetch profile separately
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', orderData.created_by)
        .single();

      if (profileError) throw profileError;

      // Combine the data
      const combinedOrder = {
        ...orderData,
        profile: profileData
      } as any;
      
      setOrder(combinedOrder);
      
      // Group units by product first, then by state (batches)
      const productMap = new Map<string, ProductGroup>();
      
      (combinedOrder.units || []).forEach((unit: Unit) => {
        if (!productMap.has(unit.product_id)) {
          productMap.set(unit.product_id, {
            product_id: unit.product_id,
            product_name: unit.product?.name || 'Unknown Product',
            product_sku: unit.product?.sku || 'N/A',
            batches: [],
          });
        }
        
        const productGroup = productMap.get(unit.product_id)!;
        let batch = productGroup.batches.find(b => b.state === unit.state);
        
        if (!batch) {
          const currentEta = unit.stage_eta?.find(eta => eta.stage === unit.state);
          const isLate = currentEta ? new Date(currentEta.eta) < new Date() : false;
          
          batch = {
            product_id: unit.product_id,
            product_name: unit.product?.name || 'Unknown Product',
            product_sku: unit.product?.sku || 'N/A',
            state: unit.state,
            total_quantity: 0,
            unit_ids: [],
            earliest_eta: currentEta?.eta,
            has_late_units: isLate,
            lead_time_days: currentEta?.lead_time_days || undefined,
          };
          productGroup.batches.push(batch);
        }
        
        batch.total_quantity++;
        batch.unit_ids.push(unit.id);
        
        // Update earliest ETA and late status
        const currentEta = unit.stage_eta?.find(eta => eta.stage === unit.state);
        if (currentEta) {
          const isLate = new Date(currentEta.eta) < new Date();
          if (isLate) batch.has_late_units = true;
          
          if (!batch.earliest_eta || new Date(currentEta.eta) < new Date(batch.earliest_eta)) {
            batch.earliest_eta = currentEta.eta;
          }
        }
      });
      
      setProductGroups(Array.from(productMap.values()));
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const getBatchKey = (productId: string, state: string) => `${productId}-${state}`;

  const handleBatchQuantityChange = (batch: BatchInfo, quantity: number) => {
    const key = getBatchKey(batch.product_id, batch.state);
    setBatchSelections(prev => {
      const newMap = new Map(prev);
      if (quantity > 0) {
        newMap.set(key, quantity);
      } else {
        newMap.delete(key);
      }
      return newMap;
    });
  };

  const getSelectedUnitIds = (): string[] => {
    const selectedIds: string[] = [];
    
    batchSelections.forEach((quantity, key) => {
      const batch = productGroups
        .flatMap(pg => pg.batches)
        .find(b => getBatchKey(b.product_id, b.state) === key);
      if (batch) {
        selectedIds.push(...batch.unit_ids.slice(0, quantity));
      }
    });
    
    return selectedIds;
  };

  const getTotalSelectedCount = (): number => {
    return Array.from(batchSelections.values()).reduce((sum, qty) => sum + qty, 0);
  };

  const handleBulkUpdate = async () => {
    const totalSelected = getTotalSelectedCount();
    if (totalSelected === 0) {
      toast.error('Please select at least one unit');
      return;
    }

    // Get selected batches and their next states
    const selectedBatches = productGroups
      .flatMap(pg => pg.batches)
      .filter(b => batchSelections.has(getBatchKey(b.product_id, b.state)));
    
    // Validate all selected batches have the same next state
    const nextStates = new Set(selectedBatches.map(b => getNextState(b.state)).filter(Boolean));
    if (nextStates.size > 1) {
      toast.error('Selected units must have the same next state');
      return;
    }
    
    const nextState = Array.from(nextStates)[0];
    if (!nextState) {
      toast.error('Selected units are already in final state');
      return;
    }
    
    if (requiresLeadTimeInput(nextState)) {
      setPendingStateChange(nextState);
      setLeadTimeDialogOpen(true);
    } else {
      await updateUnitsState(nextState);
    }
  };

  const updateUnitsState = async (newState: UnitState, leadTimeDays?: number, eta?: Date) => {
    try {
      const selectedUnitIds = getSelectedUnitIds();
      
      const { error } = await supabase
        .from('units')
        .update({ state: newState as any })
        .in('id', selectedUnitIds);

      if (error) throw error;

      // If lead time is provided, create stage ETA records
      if (leadTimeDays && eta) {
        const { data: { user } } = await supabase.auth.getUser();
        
        const etaRecords = selectedUnitIds.map(unitId => ({
          unit_id: unitId,
          stage: newState,
          eta: eta.toISOString(),
          lead_time_days: leadTimeDays,
          started_by: user?.id,
        }));

        const { error: etaError } = await supabase
          .from('unit_stage_eta')
          .insert(etaRecords);

        if (etaError) throw etaError;
      }

      toast.success(`Updated ${selectedUnitIds.length} unit(s)`);
      setBatchSelections(new Map());
      fetchOrder();
    } catch (error) {
      console.error('Error updating units:', error);
      toast.error('Failed to update units');
    }
  };

  const handleLeadTimeConfirm = async (leadTimeDays: number, eta: Date) => {
    if (pendingStateChange) {
      await updateUnitsState(pendingStateChange, leadTimeDays, eta);
      setPendingStateChange(null);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'waiting_for_rm': 'bg-yellow-500',
      'manufacturing': 'bg-blue-500',
      'waiting_for_packaging_material': 'bg-orange-500',
      'packaging': 'bg-indigo-500',
      'waiting_for_boxing_material': 'bg-orange-500',
      'boxing': 'bg-cyan-500',
      'waiting_for_receiving': 'bg-amber-500',
      'received': 'bg-teal-500',
      'finished': 'bg-green-500',
    };
    return colors[status] || 'bg-gray-500';
  };


  const canUpdateUnits = () => {
    // Check if user has any role that can update units
    return hasRole('manufacture_lead') || 
           hasRole('manufacturer') || 
           hasRole('packer') || 
           hasRole('boxer') ||
           hasRole('packaging_manager') ||
           hasRole('boxing_manager') ||
           hasRole('admin');
  };
  
  const getNextStateLabel = (): string | null => {
    const selectedBatches = productGroups
      .flatMap(pg => pg.batches)
      .filter(b => batchSelections.has(getBatchKey(b.product_id, b.state)));
    
    if (selectedBatches.length === 0) return null;
    
    const nextStates = new Set(selectedBatches.map(b => getNextState(b.state)).filter(Boolean));
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
  const lateBatches = allBatches.filter(b => b.has_late_units).length;
  const lateUnitsCount = allBatches.reduce((sum, b) => sum + (b.has_late_units ? b.total_quantity : 0), 0);
  const totalSelected = getTotalSelectedCount();
  const nextStateLabel = getNextStateLabel();
  const canUpdate = canUpdateUnits();

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
          </div>
        </div>
        <Badge className={getStatusColor(order.status)}>
          {order.status.replace(/_/g, ' ').toUpperCase()}
        </Badge>
      </div>

      {lateUnitsCount > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-medium">
              {lateUnitsCount} unit(s) in {lateBatches} batch(es) are behind schedule
            </span>
          </CardContent>
        </Card>
      )}

      <OrderTimeline order={order} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Order Units ({order.units.length} total units)</CardTitle>
            {totalSelected > 0 && nextStateLabel && canUpdate && (
              <div className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground">
                  {totalSelected} unit(s) selected
                </span>
                <Button
                  size="sm"
                  onClick={handleBulkUpdate}
                >
                  Move to {nextStateLabel}
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {productGroups.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No units in this order</p>
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
                        <span className="text-sm font-medium text-muted-foreground">{totalUnits} units</span>
                      </div>
                      <p className="text-sm text-muted-foreground">SKU: {productGroup.product_sku}</p>
                      <ProductProgress totalUnits={totalUnits} stateCounts={stateCounts} />
                    </div>
                    <div className="space-y-2">
                      {productGroup.batches.map(batch => {
                        const key = getBatchKey(batch.product_id, batch.state);
                        return (
                          <BatchCard
                            key={key}
                            batch={batch}
                            selectedQuantity={batchSelections.get(key) || 0}
                            onQuantityChange={(qty) => handleBatchQuantityChange(batch, qty)}
                            canUpdate={canUpdate}
                          />
                        );
                      })}
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
    </div>
  );
}
