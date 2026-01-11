import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Factory, 
  Package, 
  Box, 
  TrendingUp, 
  Plus,
  AlertCircle,
  Sparkles,
  CheckCircle,
  Clock
} from 'lucide-react';

interface StateStats {
  pending_rm: number;
  in_manufacturing: number;
  ready_for_finishing: number;
  in_finishing: number;
  ready_for_packaging: number;
  in_packaging: number;
  ready_for_boxing: number;
  in_boxing: number;
  ready_for_receiving: number;
  received: number;
}

interface QueueData {
  name: string;
  href: string;
  icon: React.ElementType;
  color: string;
  waiting: number;
  inProgress: number;
  waitingLabel: string;
}

export default function Dashboard() {
  const { userRoles, hasRole } = useAuth();
  const [stats, setStats] = useState<StateStats>({
    pending_rm: 0,
    in_manufacturing: 0,
    ready_for_finishing: 0,
    in_finishing: 0,
    ready_for_packaging: 0,
    in_packaging: 0,
    ready_for_boxing: 0,
    in_boxing: 0,
    ready_for_receiving: 0,
    received: 0,
  });
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();

    const channel = supabase
      .channel('dashboard-batches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchStats = async () => {
    try {
      const [ordersRes, batchesRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('order_batches').select('current_state, quantity').eq('is_terminated', false),
      ]);

      const batchesByState = batchesRes.data?.reduce((acc, batch) => {
        acc[batch.current_state] = (acc[batch.current_state] || 0) + batch.quantity;
        return acc;
      }, {} as Record<string, number>) || {};

      setStats({
        pending_rm: batchesByState.pending_rm || 0,
        in_manufacturing: batchesByState.in_manufacturing || 0,
        ready_for_finishing: batchesByState.ready_for_finishing || 0,
        in_finishing: batchesByState.in_finishing || 0,
        ready_for_packaging: batchesByState.ready_for_packaging || 0,
        in_packaging: batchesByState.in_packaging || 0,
        ready_for_boxing: batchesByState.ready_for_boxing || 0,
        in_boxing: batchesByState.in_boxing || 0,
        ready_for_receiving: batchesByState.ready_for_receiving || 0,
        received: batchesByState.received || 0,
      });
      setOrderCount(ordersRes.count || 0);
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalInProgress = stats.in_manufacturing + stats.in_finishing + stats.in_packaging + stats.in_boxing;
  const totalWaiting = stats.pending_rm + stats.ready_for_finishing + stats.ready_for_packaging + stats.ready_for_boxing + stats.ready_for_receiving;

  const queues: QueueData[] = [
    {
      name: 'Manufacturing',
      href: '/queues/manufacturing',
      icon: Factory,
      color: 'blue',
      waiting: stats.pending_rm,
      inProgress: stats.in_manufacturing,
      waitingLabel: 'Pending RM',
    },
    {
      name: 'Finishing',
      href: '/queues/finishing',
      icon: Sparkles,
      color: 'purple',
      waiting: stats.ready_for_finishing,
      inProgress: stats.in_finishing,
      waitingLabel: 'Ready',
    },
    {
      name: 'Packaging',
      href: '/queues/packaging',
      icon: Package,
      color: 'indigo',
      waiting: stats.ready_for_packaging,
      inProgress: stats.in_packaging,
      waitingLabel: 'Ready',
    },
    {
      name: 'Boxing',
      href: '/queues/boxing',
      icon: Box,
      color: 'cyan',
      waiting: stats.ready_for_boxing,
      inProgress: stats.in_boxing,
      waitingLabel: 'Ready',
    },
  ];

  const canCreateOrders = hasRole('manufacture_lead') || hasRole('admin');

  return (
    <div className="p-6 space-y-6">
      {/* Quick Actions */}
      {canCreateOrders && (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3">
              <Button asChild>
                <Link to="/orders/create">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Order
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to="/orders">View Orders</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{orderCount}</div>
            <p className="text-xs text-muted-foreground">Active production orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Waiting</CardTitle>
            <Clock className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-warning">{totalWaiting}</div>
            <p className="text-xs text-muted-foreground">Items awaiting processing</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <AlertCircle className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{totalInProgress}</div>
            <p className="text-xs text-muted-foreground">Items being processed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Fulfilled</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">{stats.received}</div>
            <p className="text-xs text-muted-foreground">Completed items</p>
          </CardContent>
        </Card>
      </div>

      {/* Production Queues */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Production Queues</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {queues.map((queue) => {
            const Icon = queue.icon;
            const total = queue.waiting + queue.inProgress;
            
            return (
              <Link key={queue.name} to={queue.href}>
                <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className={`p-2 rounded-lg bg-${queue.color}-100 dark:bg-${queue.color}-900/30`}>
                        <Icon className={`h-5 w-5 text-${queue.color}-600 dark:text-${queue.color}-400`} />
                      </div>
                      {total > 0 && (
                        <Badge variant="secondary">{total}</Badge>
                      )}
                    </div>
                    <CardTitle className="text-base">{queue.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-muted-foreground text-xs">{queue.waitingLabel}</p>
                        <p className="text-lg font-semibold text-warning">{queue.waiting}</p>
                      </div>
                      <div className="p-2 rounded bg-muted/50">
                        <p className="text-muted-foreground text-xs">In Progress</p>
                        <p className="text-lg font-semibold text-primary">{queue.inProgress}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Ready for Receiving */}
      {stats.ready_for_receiving > 0 && (
        <Card className="border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-900/10">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-teal-600" />
                Ready for Receiving
              </CardTitle>
              <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300">
                {stats.ready_for_receiving} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Items waiting to be received from boxing into final inventory
            </p>
          </CardContent>
        </Card>
      )}

      {/* State Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>State Breakdown</CardTitle>
          <CardDescription>Current distribution of items across all production states</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-5">
            {[
              { state: 'pending_rm', label: 'Pending RM', count: stats.pending_rm, color: 'bg-yellow-500' },
              { state: 'in_manufacturing', label: 'Manufacturing', count: stats.in_manufacturing, color: 'bg-blue-500' },
              { state: 'ready_for_finishing', label: 'Ready Finishing', count: stats.ready_for_finishing, color: 'bg-blue-300' },
              { state: 'in_finishing', label: 'Finishing', count: stats.in_finishing, color: 'bg-purple-500' },
              { state: 'ready_for_packaging', label: 'Ready Packaging', count: stats.ready_for_packaging, color: 'bg-orange-500' },
              { state: 'in_packaging', label: 'Packaging', count: stats.in_packaging, color: 'bg-indigo-500' },
              { state: 'ready_for_boxing', label: 'Ready Boxing', count: stats.ready_for_boxing, color: 'bg-cyan-300' },
              { state: 'in_boxing', label: 'Boxing', count: stats.in_boxing, color: 'bg-cyan-500' },
              { state: 'ready_for_receiving', label: 'Ready Receiving', count: stats.ready_for_receiving, color: 'bg-teal-300' },
              { state: 'received', label: 'Received', count: stats.received, color: 'bg-green-500' },
            ].map((item) => (
              <div 
                key={item.state}
                className="flex items-center gap-2 p-2 rounded border"
              >
                <div className={`w-3 h-3 rounded-full ${item.color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{item.label}</p>
                  <p className="font-semibold">{item.count}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
