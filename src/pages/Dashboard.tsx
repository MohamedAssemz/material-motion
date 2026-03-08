import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import {
  Factory, Package, Box, TrendingUp, Plus, AlertTriangle, Sparkles,
  CheckCircle, Clock, AlertCircle, ShieldAlert, Flag, CalendarClock,
  ArrowRight, Truck,
} from 'lucide-react';
import { startOfDay, isBefore, addDays, format } from 'date-fns';

/* ─── types ─── */
interface DashboardData {
  profile: { full_name: string | null } | null;
  ordersByStatus: Record<string, number>;
  recentOrders: Array<{
    id: string;
    order_number: string;
    status: string;
    priority: string | null;
    customer: { name: string } | null;
    created_at: string | null;
  }>;
  batchesByState: Record<string, number>;
  lateBatchCount: number;
  flaggedBatchCount: number;
  lateBatches: Array<{ id: string; order_id: string; product_id: string; eta: string; quantity: number; order: { order_number: string } | null }>;
  flaggedBatches: Array<{ id: string; order_id: string; flagged_reason: string | null; quantity: number; order: { order_number: string } | null }>;
  approachingEtaOrders: Array<{ id: string; order_number: string; estimated_fulfillment_time: string }>;
  todayThroughput: Record<string, number>;
  orderItemCounts: Record<string, number>;
  orderShippedCounts: Record<string, number>;
}

/* ─── constants ─── */
const PHASE_COLORS: Record<string, string> = {
  in_manufacturing: 'hsl(214, 95%, 36%)',
  ready_for_finishing: 'hsl(214, 70%, 60%)',
  in_finishing: 'hsl(270, 60%, 50%)',
  ready_for_packaging: 'hsl(270, 40%, 65%)',
  in_packaging: 'hsl(240, 50%, 55%)',
  ready_for_boxing: 'hsl(190, 60%, 55%)',
  in_boxing: 'hsl(190, 80%, 40%)',
  ready_for_shipment: 'hsl(170, 55%, 45%)',
  shipped: 'hsl(142, 76%, 36%)',
};

const PHASE_LABELS: Record<string, string> = {
  in_manufacturing: 'Manufacturing',
  ready_for_finishing: 'Ready Finishing',
  in_finishing: 'Finishing',
  ready_for_packaging: 'Ready Packaging',
  in_packaging: 'Packaging',
  ready_for_boxing: 'Ready Boxing',
  in_boxing: 'Boxing',
  ready_for_shipment: 'Ready Shipment',
  shipped: 'Shipped',
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: 'hsl(38, 92%, 50%)',
  in_progress: 'hsl(214, 95%, 36%)',
  completed: 'hsl(142, 76%, 36%)',
  cancelled: 'hsl(0, 72%, 51%)',
};

const TRANSITION_LABELS: Record<string, string> = {
  'start_manufacturing': 'Manufacturing',
  'finish_manufacturing': 'Manufactured',
  'start_finishing': 'Finishing',
  'finish_finishing': 'Finished',
  'start_packaging': 'Packaging',
  'finish_packaging': 'Packaged',
  'start_boxing': 'Boxing',
  'finish_boxing': 'Boxed',
};

const TRANSITION_COLORS = [
  'hsl(214, 95%, 36%)',
  'hsl(270, 60%, 50%)',
  'hsl(240, 50%, 55%)',
  'hsl(190, 80%, 40%)',
  'hsl(142, 76%, 36%)',
  'hsl(38, 92%, 50%)',
  'hsl(0, 72%, 51%)',
  'hsl(170, 55%, 45%)',
];

/* ─── helpers ─── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'completed': return 'default';
    case 'cancelled': return 'destructive';
    case 'in_progress': return 'secondary';
    default: return 'outline';
  }
}

/* ─── component ─── */
export default function Dashboard() {
  const { user, hasRole, primaryRole } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAll();
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, fetchAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchAll = async () => {
    try {
      const now = new Date().toISOString();
      const todayStart = startOfDay(new Date()).toISOString();
      const twoDaysFromNow = addDays(new Date(), 2).toISOString();

      const [
        profileRes,
        ordersRes,
        recentOrdersRes,
        batchesRes,
        lateBatchesRes,
        flaggedBatchesRes,
        approachingRes,
        throughputRes,
        orderItemsRes,
        shippedBatchesRes,
      ] = await Promise.all([
        user ? supabase.from('profiles').select('full_name').eq('id', user.id).single() : Promise.resolve({ data: null }),
        supabase.from('orders').select('status'),
        supabase.from('orders').select('id, order_number, status, priority, created_at, customer:customers(name)').order('created_at', { ascending: false }).limit(8),
        supabase.from('order_batches').select('current_state, quantity').eq('is_terminated', false),
        supabase.from('order_batches').select('id, order_id, product_id, eta, quantity, order:orders(order_number)').eq('is_terminated', false).not('current_state', 'in', '(shipped,ready_for_shipment)').not('eta', 'is', null).lt('eta', now).limit(10),
        supabase.from('order_batches').select('id, order_id, flagged_reason, quantity, order:orders(order_number)').eq('is_flagged', true).eq('is_terminated', false).limit(10),
        supabase.from('orders').select('id, order_number, estimated_fulfillment_time').not('estimated_fulfillment_time', 'is', null).gt('estimated_fulfillment_time', now).lt('estimated_fulfillment_time', twoDaysFromNow).neq('status', 'completed').neq('status', 'cancelled').limit(5),
        supabase.from('machine_production').select('state_transition').gte('created_at', todayStart),
        supabase.from('order_items').select('order_id, quantity'),
        supabase.from('order_batches').select('order_id, quantity').eq('current_state', 'shipped').eq('is_terminated', false),
      ]);

      // order status counts
      const ordersByStatus: Record<string, number> = {};
      (ordersRes.data || []).forEach(o => { ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1; });

      // batches by state
      const batchesByState: Record<string, number> = {};
      (batchesRes.data || []).forEach(b => { batchesByState[b.current_state] = (batchesByState[b.current_state] || 0) + b.quantity; });

      // today throughput
      const todayThroughput: Record<string, number> = {};
      (throughputRes.data || []).forEach(t => { todayThroughput[t.state_transition] = (todayThroughput[t.state_transition] || 0) + 1; });

      // order item counts
      const orderItemCounts: Record<string, number> = {};
      (orderItemsRes.data || []).forEach(i => { orderItemCounts[i.order_id] = (orderItemCounts[i.order_id] || 0) + i.quantity; });

      // shipped counts per order
      const orderShippedCounts: Record<string, number> = {};
      (shippedBatchesRes.data || []).forEach(b => { orderShippedCounts[b.order_id] = (orderShippedCounts[b.order_id] || 0) + b.quantity; });

      setData({
        profile: profileRes.data as any,
        ordersByStatus,
        recentOrders: (recentOrdersRes.data || []) as any,
        batchesByState,
        lateBatchCount: (lateBatchesRes.data || []).reduce((s, b) => s + b.quantity, 0),
        flaggedBatchCount: (flaggedBatchesRes.data || []).reduce((s, b) => s + b.quantity, 0),
        lateBatches: (lateBatchesRes.data || []) as any,
        flaggedBatches: (flaggedBatchesRes.data || []) as any,
        approachingEtaOrders: (approachingRes.data || []) as any,
        todayThroughput,
        orderItemCounts,
        orderShippedCounts,
      });
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  /* ─── derived metrics ─── */
  const totalOrders = useMemo(() => data ? Object.values(data.ordersByStatus).reduce((a, b) => a + b, 0) : 0, [data]);
  const totalInProgress = useMemo(() => {
    if (!data) return 0;
    return (data.batchesByState.in_manufacturing || 0) + (data.batchesByState.in_finishing || 0) +
      (data.batchesByState.in_packaging || 0) + (data.batchesByState.in_boxing || 0);
  }, [data]);
  const totalWaiting = useMemo(() => {
    if (!data) return 0;
    return (data.batchesByState.ready_for_finishing || 0) + (data.batchesByState.ready_for_packaging || 0) +
      (data.batchesByState.ready_for_boxing || 0) + (data.batchesByState.ready_for_shipment || 0);
  }, [data]);
  const shippedTotal = useMemo(() => data?.batchesByState.shipped || 0, [data]);
  const allBatchTotal = useMemo(() => data ? Object.values(data.batchesByState).reduce((a, b) => a + b, 0) : 0, [data]);
  const fulfillmentRate = useMemo(() => allBatchTotal > 0 ? Math.round((shippedTotal / allBatchTotal) * 100) : 0, [shippedTotal, allBatchTotal]);

  // Pipeline chart data
  const pipelineData = useMemo(() => {
    if (!data) return [];
    return Object.entries(PHASE_LABELS).map(([key, label]) => ({
      name: label,
      value: data.batchesByState[key] || 0,
      fill: PHASE_COLORS[key],
    }));
  }, [data]);

  // Order status donut
  const donutData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.ordersByStatus).map(([status, count]) => ({
      name: status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase()),
      value: count,
      fill: ORDER_STATUS_COLORS[status] || 'hsl(216, 12%, 60%)',
    }));
  }, [data]);

  // Throughput chart
  const throughputData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.todayThroughput)
      .filter(([key]) => TRANSITION_LABELS[key])
      .map(([key, count]) => ({
        name: TRANSITION_LABELS[key] || key,
        value: count,
      }));
  }, [data]);

  const canCreateOrders = hasRole('admin');

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  if (!data) return null;

  const alertCount = data.lateBatches.length + data.flaggedBatches.length + data.approachingEtaOrders.length;

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ═══════ WELCOME BAR ═══════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()}, {data.profile?.full_name || 'there'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's your factory overview for {format(new Date(), 'EEEE, MMMM d')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {primaryRole && (
            <Badge variant="outline" className="capitalize text-xs">
              {primaryRole.replace('_', ' ')}
            </Badge>
          )}
          {canCreateOrders && (
            <Button asChild size="sm">
              <Link to="/orders/create"><Plus className="mr-1 h-4 w-4" />New Order</Link>
            </Button>
          )}
        </div>
      </div>

      {/* ═══════ KPI CARDS ═══════ */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <KpiCard icon={TrendingUp} label="Active Orders" value={totalOrders} sub="All orders" color="text-primary" />
        <KpiCard icon={AlertCircle} label="In Progress" value={totalInProgress} sub="Being processed" color="text-primary" />
        <KpiCard icon={Clock} label="Waiting" value={totalWaiting} sub="Awaiting next phase" color="text-warning" />
        <KpiCard icon={AlertTriangle} label="Late Batches" value={data.lateBatchCount} sub="Past ETA" color="text-destructive" highlight={data.lateBatchCount > 0} />
        <KpiCard icon={CheckCircle} label="Fulfillment" value={`${fulfillmentRate}%`} sub={`${shippedTotal} shipped`} color="text-success" />
      </div>

      {/* ═══════ CHARTS ROW ═══════ */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Production Pipeline */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Production Pipeline</CardTitle>
            <CardDescription>Item distribution across phases</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineData} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis dataKey="name" type="category" width={110} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {pipelineData.map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Order Status Donut */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Order Status</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent className="h-72 flex items-center justify-center">
            {donutData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  {/* center label */}
                  <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-2xl font-bold">
                    {totalOrders}
                  </text>
                  <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-xs">
                    orders
                  </text>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No orders yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ QUEUE CARDS ═══════ */}
      <div>
        <h2 className="text-base font-semibold mb-3">Production Queues</h2>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <QueueCard name="Manufacturing" href="/queues/manufacturing" icon={Factory}
            waiting={0} inProgress={data.batchesByState.in_manufacturing || 0}
            waitingLabel="Waiting" bgClass="bg-blue-50 dark:bg-blue-950/30" iconClass="text-blue-600 dark:text-blue-400" />
          <QueueCard name="Finishing" href="/queues/finishing" icon={Sparkles}
            waiting={data.batchesByState.ready_for_finishing || 0} inProgress={data.batchesByState.in_finishing || 0}
            waitingLabel="Ready" bgClass="bg-purple-50 dark:bg-purple-950/30" iconClass="text-purple-600 dark:text-purple-400" />
          <QueueCard name="Packaging" href="/queues/packaging" icon={Package}
            waiting={data.batchesByState.ready_for_packaging || 0} inProgress={data.batchesByState.in_packaging || 0}
            waitingLabel="Ready" bgClass="bg-indigo-50 dark:bg-indigo-950/30" iconClass="text-indigo-600 dark:text-indigo-400" />
          <QueueCard name="Boxing" href="/queues/boxing" icon={Box}
            waiting={data.batchesByState.ready_for_boxing || 0} inProgress={data.batchesByState.in_boxing || 0}
            waitingLabel="Ready" bgClass="bg-cyan-50 dark:bg-cyan-950/30" iconClass="text-cyan-600 dark:text-cyan-400" />
        </div>
      </div>

      {/* ═══════ THROUGHPUT + ALERTS ═══════ */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Today's Throughput */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Today's Throughput</CardTitle>
            <CardDescription>Items processed per phase today</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {throughputData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={throughputData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 'var(--radius)',
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {throughputData.map((_, i) => (
                      <Cell key={i} fill={TRANSITION_COLORS[i % TRANSITION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No production recorded today</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alerts & Attention */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Alerts & Attention</CardTitle>
              {alertCount > 0 && (
                <Badge variant="destructive" className="text-xs">{alertCount}</Badge>
              )}
            </div>
            <CardDescription>Items needing your attention</CardDescription>
          </CardHeader>
          <CardContent className="max-h-56 overflow-y-auto space-y-2">
            {alertCount === 0 && (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mb-2 text-success" />
                <p className="text-sm">All clear! No alerts.</p>
              </div>
            )}
            {data.lateBatches.map(b => (
              <Link key={`late-${b.id}`} to={`/orders/${b.order_id}`} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Late: {b.order?.order_number || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{b.quantity} items past ETA</p>
                </div>
              </Link>
            ))}
            {data.flaggedBatches.map(b => (
              <Link key={`flag-${b.id}`} to={`/orders/${b.order_id}`} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Flag className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Flagged: {b.order?.order_number || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{b.flagged_reason || `${b.quantity} items`}</p>
                </div>
              </Link>
            ))}
            {data.approachingEtaOrders.map(o => (
              <Link key={`eta-${o.id}`} to={`/orders/${o.id}`} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{o.order_number} due soon</p>
                  <p className="text-xs text-muted-foreground">ETA: {format(new Date(o.estimated_fulfillment_time), 'MMM d')}</p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* ═══════ RECENT ORDERS TABLE ═══════ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Orders</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders" className="text-xs">View All <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Order</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="pr-6">Progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recentOrders.map(order => {
                const items = data.orderItemCounts[order.id] || 0;
                const shipped = data.orderShippedCounts[order.id] || 0;
                const pct = items > 0 ? Math.round((shipped / items) * 100) : 0;
                return (
                  <TableRow key={order.id} className="cursor-pointer" onClick={() => window.location.href = `/orders/${order.id}`}>
                    <TableCell className="pl-6 font-medium">{order.order_number}</TableCell>
                    <TableCell className="text-muted-foreground">{order.customer?.name || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(order.status)} className="capitalize text-xs">
                        {order.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell>{items}</TableCell>
                    <TableCell className="pr-6">
                      <div className="flex items-center gap-2">
                        <Progress value={pct} className="h-2 flex-1 max-w-24" />
                        <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {data.recentOrders.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No orders yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* ═══════ SHIPMENT READY BANNER ═══════ */}
      {(data.batchesByState.ready_for_shipment || 0) > 0 && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Truck className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-semibold text-sm">{data.batchesByState.ready_for_shipment} items ready for shipment</p>
                <p className="text-xs text-muted-foreground">Ready to be added to a Kartona</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/queues/boxing">View <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ─── sub-components ─── */

function KpiCard({ icon: Icon, label, value, sub, color, highlight }: {
  icon: React.ElementType; label: string; value: string | number; sub: string; color: string; highlight?: boolean;
}) {
  return (
    <Card className={highlight ? 'border-destructive/40 bg-destructive/5' : ''}>
      <CardContent className="pt-4 pb-3 px-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>
  );
}

function QueueCard({ name, href, icon: Icon, waiting, inProgress, waitingLabel, bgClass, iconClass }: {
  name: string; href: string; icon: React.ElementType; waiting: number; inProgress: number;
  waitingLabel: string; bgClass: string; iconClass: string;
}) {
  const total = waiting + inProgress;
  return (
    <Link to={href}>
      <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
        <CardContent className="pt-4 pb-3 px-4">
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2 rounded-lg ${bgClass}`}>
              <Icon className={`h-4 w-4 ${iconClass}`} />
            </div>
            {total > 0 && <Badge variant="secondary" className="text-xs">{total}</Badge>}
          </div>
          <p className="text-sm font-semibold mb-2">{name}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="p-1.5 rounded bg-muted/50 text-center">
              <p className="text-[10px] text-muted-foreground">{waitingLabel}</p>
              <p className="text-base font-bold text-warning">{waiting}</p>
            </div>
            <div className="p-1.5 rounded bg-muted/50 text-center">
              <p className="text-[10px] text-muted-foreground">Active</p>
              <p className="text-base font-bold text-primary">{inProgress}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
