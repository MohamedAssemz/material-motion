import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { OrderTimeline } from '@/components/OrderTimeline';
import { UnitCard } from '@/components/UnitCard';
import { LeadTimeDialog } from '@/components/LeadTimeDialog';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Unit {
  id: string;
  serial_no: string | null;
  state: string;
  created_at: string;
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
  const [selectedUnits, setSelectedUnits] = useState<Set<string>>(new Set());
  const [leadTimeDialogOpen, setLeadTimeDialogOpen] = useState(false);
  const [pendingStateChange, setPendingStateChange] = useState<string | null>(null);

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
      setOrder({
        ...orderData,
        profile: profileData
      } as any);
    } catch (error) {
      console.error('Error fetching order:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

  const handleUnitSelect = (unitId: string) => {
    setSelectedUnits(prev => {
      const newSet = new Set(prev);
      if (newSet.has(unitId)) {
        newSet.delete(unitId);
      } else {
        newSet.add(unitId);
      }
      return newSet;
    });
  };

  const handleBulkUpdate = async (newState: string) => {
    if (selectedUnits.size === 0) {
      toast.error('Please select at least one unit');
      return;
    }

    // States that require lead time input
    const requiresLeadTime = ['manufacturing', 'packaging', 'boxing'];
    
    if (requiresLeadTime.includes(newState)) {
      setPendingStateChange(newState);
      setLeadTimeDialogOpen(true);
    } else {
      await updateUnitsState(newState);
    }
  };

  const updateUnitsState = async (newState: string, leadTimeDays?: number, eta?: Date) => {
    try {
      const { error } = await supabase
        .from('units')
        .update({ state: newState as any })
        .in('id', Array.from(selectedUnits));

      if (error) throw error;

      // If lead time is provided, create stage ETA records
      if (leadTimeDays && eta) {
        const { data: { user } } = await supabase.auth.getUser();
        
        const etaRecords = Array.from(selectedUnits).map(unitId => ({
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

      toast.success(`Updated ${selectedUnits.size} unit(s)`);
      setSelectedUnits(new Set());
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

  const isUnitLate = (unit: Unit) => {
    if (!unit.stage_eta || unit.stage_eta.length === 0) return false;
    
    const currentStageEta = unit.stage_eta.find(eta => eta.stage === unit.state);
    if (!currentStageEta) return false;
    
    return new Date(currentStageEta.eta) < new Date();
  };

  const getNextStates = () => {
    const userRoles = [];
    if (hasRole('manufacturer')) userRoles.push('manufacturing');
    if (hasRole('packer')) userRoles.push('packaging');
    if (hasRole('boxer')) userRoles.push('boxing');
    if (hasRole('packaging_manager')) userRoles.push('waiting_for_packaging_material');
    if (hasRole('boxing_manager')) userRoles.push('waiting_for_boxing_material');
    if (hasRole('admin')) return [
      'waiting_for_rm',
      'manufacturing',
      'waiting_for_packaging_material',
      'packaging',
      'waiting_for_boxing_material',
      'boxing',
      'waiting_for_receiving',
      'received',
      'finished'
    ];
    return userRoles;
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

  const lateUnits = order.units.filter(isUnitLate).length;
  const nextStates = getNextStates();

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

      {lateUnits > 0 && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-2 p-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <span className="font-medium">{lateUnits} unit(s) are behind schedule</span>
          </CardContent>
        </Card>
      )}

      <OrderTimeline order={order} />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Units ({order.units.length})</CardTitle>
            {selectedUnits.size > 0 && nextStates.length > 0 && (
              <div className="flex gap-2">
                <span className="text-sm text-muted-foreground">
                  {selectedUnits.size} selected
                </span>
                {nextStates.map(state => (
                  <Button
                    key={state}
                    size="sm"
                    onClick={() => handleBulkUpdate(state)}
                  >
                    Move to {state.replace(/_/g, ' ')}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {order.units.map(unit => (
            <UnitCard
              key={unit.id}
              unit={unit}
              isSelected={selectedUnits.has(unit.id)}
              onSelect={handleUnitSelect}
              isLate={isUnitLate(unit)}
              canUpdate={nextStates.length > 0}
            />
          ))}
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
        unitCount={selectedUnits.size}
        nextState={pendingStateChange || ''}
      />
    </div>
  );
}
