import { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from
'@/components/ui/select';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend } from
'recharts';
import {
  Factory, Package, Box, TrendingUp, Plus, AlertTriangle, Sparkles,
  CheckCircle, Clock, AlertCircle, Flag, CalendarClock,
  ArrowRight, Truck, Archive, FileText, Trophy, Activity, Wrench } from
'lucide-react';
import { startOfDay, subDays, format } from 'date-fns';

/* ─── types ─── */
interface DashboardData {
  profile: {full_name: string | null;} | null;
  ordersByStatus: Record<string, number>;
  batchesByState: Record<string, number>;
  lateOrderCount: number;
  newOrdersToday: number;
  flaggedBatchCount: number;
  lateBatches: Array<{id: string;order_id: string;product_id: string;eta: string;quantity: number;order: {order_number: string;status: string;} | null;}>;
  flaggedBatches: Array<{id: string;order_id: string;flagged_reason: string | null;quantity: number;order: {order_number: string;status: string;} | null;}>;
  approachingEtaOrders: Array<{id: string;order_number: string;estimated_fulfillment_time: string;}>;
  todayThroughput: Record<string, number>;
  extraInventoryCount: number;
  completedOrders: number;
  shipmentsCount: number;
  topProducts: Array<{name: string;quantity: number;}>;
  avgFinishedPerDay: number;
  topMachines: Array<{name: string;count: number;}>;
}

type TimeRange = 'today' | 'week' | 'month';

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
  shipped: 'hsl(142, 76%, 36%)'
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
  shipped: 'Shipped'
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: 'hsl(38, 92%, 50%)',
  in_progress: 'hsl(214, 95%, 36%)',
  completed: 'hsl(142, 76%, 36%)',
  cancelled: 'hsl(0, 72%, 51%)'
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled'
};

const TRANSITION_LABELS: Record<string, string> = {
  'start_manufacturing': 'Manufacturing',
  'finish_manufacturing': 'Manufactured',
  'start_finishing': 'Finishing',
  'finish_finishing': 'Finished',
  'start_packaging': 'Packaging',
  'finish_packaging': 'Packaged',
  'start_boxing': 'Boxing',
  'finish_boxing': 'Boxed'
};

const TRANSITION_COLORS = [
'hsl(214, 95%, 36%)',
'hsl(270, 60%, 50%)',
'hsl(240, 50%, 55%)',
'hsl(190, 80%, 40%)',
'hsl(142, 76%, 36%)',
'hsl(38, 92%, 50%)',
'hsl(0, 72%, 51%)',
'hsl(170, 55%, 45%)'];


const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  today: 'Today',
  week: 'This Week',
  month: 'Last 30 Days'
};

/* ─── helpers ─── */
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function getTimeRangeStart(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case 'today':return startOfDay(now);
    case 'week':return startOfDay(subDays(now, 7));
    case 'month':return startOfDay(subDays(now, 30));
  }
}

/* ─── component ─── */
export default function Dashboard() {
  const { user, hasRole, primaryRole } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('today');

  const fetchAll = useCallback(async () => {
    try {
      const now = new Date().toISOString();
      const rangeStart = getTimeRangeStart(timeRange).toISOString();
      const todayStart = startOfDay(new Date()).toISOString();
      const twoDaysFromNow = new Date(Date.now() + 2 * 86400000).toISOString();

      const [
      profileRes,
      ordersRes,
      newOrdersTodayRes,
      batchesRes,
      lateBatchesRes,
      approachingRes,
      extraRes,
      shipmentsRes,
      shippedBatchesRes,
      machinesRes] =
      await Promise.all([
      user ? supabase.from('profiles').select('full_name').eq('id', user.id).single() : Promise.resolve({ data: null }),
      supabase.from('orders').select('status').gte('created_at', rangeStart),
      supabase.from('orders').select('id').gte('created_at', todayStart),
      supabase.from('order_batches').select('current_state, quantity, manufacturing_machine_id, finishing_machine_id, packaging_machine_id, boxing_machine_id').gte('created_at', rangeStart),
      supabase.from('order_batches').select('id, order_id, product_id, eta, quantity, order:orders(order_number, status)').not('current_state', 'in', '(shipped,ready_for_shipment)').not('eta', 'is', null).lt('eta', now).limit(50),
      supabase.from('orders').select('id, order_number, estimated_fulfillment_time').not('estimated_fulfillment_time', 'is', null).gt('estimated_fulfillment_time', now).lt('estimated_fulfillment_time', twoDaysFromNow).neq('status', 'completed').neq('status', 'cancelled').limit(5),
      supabase.from('extra_batches').select('quantity').eq('inventory_state', 'AVAILABLE'),
      supabase.from('shipments').select('id').gte('created_at', rangeStart),
      supabase.from('order_batches').select('product_id, quantity').in('current_state', ['shipped', 'ready_for_shipment']).gte('created_at', rangeStart),
      supabase.from('machines').select('id, name')]
      );

      const ordersByStatus: Record<string, number> = {};
      (ordersRes.data || []).forEach((o) => {ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;});

      const batchesByState: Record<string, number> = {};
      (batchesRes.data || []).forEach((b: any) => {batchesByState[b.current_state] = (batchesByState[b.current_state] || 0) + b.quantity;});

      const todayThroughput: Record<string, number> = {};

      const extraInventoryCount = (extraRes.data || []).reduce((s, b) => s + b.quantity, 0);

      // Filter out cancelled orders from alerts
      const activeLate = ((lateBatchesRes.data || []) as any[]).filter((b) => b.order?.status !== 'cancelled');
      const lateOrderIds = new Set(activeLate.map((b) => b.order_id));

      // Top 3 products by finished quantity
      const productQtyMap: Record<string, number> = {};
      (shippedBatchesRes.data || []).forEach((b: any) => {
        productQtyMap[b.product_id] = (productQtyMap[b.product_id] || 0) + b.quantity;
      });

      // We need product names — fetch them if we have product ids
      const topProductIds = Object.entries(productQtyMap).
      sort((a, b) => b[1] - a[1]).
      slice(0, 3);
      let topProducts: Array<{name: string;quantity: number;}> = [];
      if (topProductIds.length > 0) {
        const prodRes = await supabase.from('products').select('id, name').in('id', topProductIds.map((p) => p[0]));
        const prodMap = new Map((prodRes.data || []).map((p) => [p.id, p.name]));
        topProducts = topProductIds.map(([id, qty]) => ({ name: prodMap.get(id) || 'Unknown', quantity: qty }));
      }

      // Avg finished items per day
      const rangeStartDate = getTimeRangeStart(timeRange);
      const daysDiff = Math.max(1, Math.ceil((Date.now() - rangeStartDate.getTime()) / 86400000));
      const totalFinished = Object.values(productQtyMap).reduce((s, v) => s + v, 0);
      const avgFinishedPerDay = Math.round(totalFinished / daysDiff * 10) / 10;

      // Top machines — use order_batches machine columns since machine_production table doesn't exist
      const machineCountMap: Record<string, number> = {};
      ((batchesRes.data || []) as any[]).forEach((b: any) => {
        const machineFields = [b.manufacturing_machine_id, b.finishing_machine_id, b.packaging_machine_id, b.boxing_machine_id];
        machineFields.forEach((mid: string | null) => {
          if (mid) machineCountMap[mid] = (machineCountMap[mid] || 0) + 1;
        });
      });
      const machineNameMap = new Map((machinesRes.data || []).map((m: any) => [m.id, m.name]));
      const topMachines = Object.entries(machineCountMap).
      sort((a, b) => b[1] - a[1]).
      slice(0, 3).
      map(([id, count]) => ({ name: machineNameMap.get(id) || 'Unknown', count }));

      setData({
        profile: profileRes.data as any,
        ordersByStatus,
        batchesByState,
        lateOrderCount: lateOrderIds.size,
        newOrdersToday: (newOrdersTodayRes.data || []).length,
        flaggedBatchCount: 0,
        lateBatches: activeLate.slice(0, 10),
        flaggedBatches: [],
        approachingEtaOrders: (approachingRes.data || []) as any,
        todayThroughput,
        extraInventoryCount,
        completedOrders: ordersByStatus.completed || 0,
        shipmentsCount: (shipmentsRes.data || []).length,
        topProducts,
        avgFinishedPerDay,
        topMachines
      });
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [user, timeRange]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
    const channel = supabase.
    channel('dashboard-realtime').
    on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, fetchAll).
    subscribe();
    return () => {supabase.removeChannel(channel);};
  }, [fetchAll]);

  /* ─── derived metrics ─── */
  const activeOrders = useMemo(() => data ? (data.ordersByStatus.pending || 0) + (data.ordersByStatus.in_progress || 0) : 0, [data]);
  const shippedTotal = useMemo(() => data?.batchesByState.shipped || 0, [data]);
  const allBatchTotal = useMemo(() => data ? Object.values(data.batchesByState).reduce((a, b) => a + b, 0) : 0, [data]);
  const fulfillmentRate = useMemo(() => allBatchTotal > 0 ? Math.round(shippedTotal / allBatchTotal * 100) : 0, [shippedTotal, allBatchTotal]);
  const totalOrders = useMemo(() => data ? Object.values(data.ordersByStatus).reduce((a, b) => a + b, 0) : 0, [data]);

  const pipelineData = useMemo(() => {
    if (!data) return [];
    return Object.entries(PHASE_LABELS).map(([key, label]) => ({
      name: label,
      value: data.batchesByState[key] || 0,
      fill: PHASE_COLORS[key]
    }));
  }, [data]);

  const donutData = useMemo(() => {
    if (!data) return [];
    const allStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
    return allStatuses.map((status) => ({
      name: ORDER_STATUS_LABELS[status] || status,
      value: data.ordersByStatus[status] || 0,
      fill: ORDER_STATUS_COLORS[status] || 'hsl(216, 12%, 60%)'
    }));
  }, [data]);

  const throughputData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.todayThroughput).
    filter(([key]) => TRANSITION_LABELS[key]).
    map(([key, count]) => ({
      name: TRANSITION_LABELS[key] || key,
      value: count
    }));
  }, [data]);

  const canCreateOrders = hasRole('admin');
  const readyForShipment = data?.batchesByState.ready_for_shipment || 0;

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
      </div>);

  }

  if (!data) return null;

  const alertCount = (data.lateBatches?.length || 0) + (data.flaggedBatches?.length || 0) + (data.approachingEtaOrders?.length || 0);

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ═══════ WELCOME BAR ═══════ */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()}, {data.profile?.full_name || 'there'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Here's your factory overview — {TIME_RANGE_LABELS[timeRange]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[150px] h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ═══════ KPI CARDS ═══════ */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
        <div onClick={() => navigate('/orders')} className="cursor-pointer h-full">
          <KpiCard icon={TrendingUp} label="Active Orders" value={activeOrders} sub={TIME_RANGE_LABELS[timeRange]} color="text-primary" />
        </div>
        <div onClick={() => navigate('/orders')} className="cursor-pointer h-full">
          <KpiCard icon={FileText} label="New Orders" value={data.newOrdersToday} sub="Today" color="text-primary" />
        </div>
        <div onClick={() => navigate('/orders')} className="cursor-pointer h-full">
          <KpiCard icon={CheckCircle} label="Completed" value={data.completedOrders} sub={`${data.shipmentsCount} shipments`} color="text-success" />
        </div>
        <div onClick={() => navigate('/orders')} className="cursor-pointer h-full">
          <KpiCard icon={AlertTriangle} label="Late Orders" value={data.lateOrderCount} sub="With late batches" color="text-destructive" highlight={data.lateOrderCount > 0} />
        </div>
        

        
        <div onClick={() => navigate('/extra-inventory')} className="cursor-pointer h-full">
          <KpiCard icon={Archive} label="Extra Inventory" value={data.extraInventoryCount} sub="Available items" color="text-primary" />
        </div>
      </div>

      {/* ═══════ SHIPMENT READY BANNER ═══════ */}
      {readyForShipment > 0 &&
      <Card className="border-success/30 bg-success/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <Truck className="h-5 w-5 text-success" />
              </div>
              <div>
                <p className="font-semibold text-sm">{readyForShipment} items ready for shipment</p>
                <p className="text-xs text-muted-foreground">Ready to be added to a Kartona</p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to="/queues/boxing">View <ArrowRight className="ml-1 h-3 w-3" /></Link>
            </Button>
          </CardContent>
        </Card>
      }

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
                    fontSize: 12
                  }} />
                
                <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={24}>
                  {pipelineData.map((entry, i) =>
                  <Cell key={i} fill={entry.fill} />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Order Status Donut */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Order Status Breakdown</CardTitle>
            <CardDescription>Distribution by status</CardDescription>
          </CardHeader>
          <CardContent className="h-72 flex items-center justify-center">
            {donutData.some((d) => d.value > 0) ?
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
                  stroke="none">
                  
                    {donutData.map((entry, i) =>
                  <Cell key={i} fill={entry.fill} />
                  )}
                  </Pie>
                  <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                    fontSize: 12
                  }} />
                
                  <Legend
                  verticalAlign="bottom"
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11 }} />
                
                  <text x="50%" y="48%" textAnchor="middle" dominantBaseline="middle" className="fill-foreground text-2xl font-bold">
                    {totalOrders}
                  </text>
                  <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" className="fill-muted-foreground text-xs">
                    orders
                  </text>
                </PieChart>
              </ResponsiveContainer> :

            <p className="text-sm text-muted-foreground">No orders yet</p>
            }
          </CardContent>
        </Card>
      </div>

      {/* ═══════ INSIGHTS ROW ═══════ */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
        {/* Top 3 Products */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Top Products</CardTitle>
            </div>
            <CardDescription>Most completed in {TIME_RANGE_LABELS[timeRange].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topProducts.length > 0 ? data.topProducts.map((p, i) =>
            <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                i === 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`
                }>{i + 1}</span>
                  <span className="text-sm font-medium truncate">{p.name}</span>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">{p.quantity} units</Badge>
              </div>
            ) :
            <p className="text-sm text-muted-foreground text-center py-4">No completed items yet</p>
            }
          </CardContent>
        </Card>

        {/* Average Finished Per Day */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Avg. Finished / Day</CardTitle>
            </div>
            <CardDescription>Daily average in {TIME_RANGE_LABELS[timeRange].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            <p className="text-4xl font-bold text-primary">{data.avgFinishedPerDay}</p>
            <p className="text-sm text-muted-foreground mt-1">items per day</p>
          </CardContent>
        </Card>

        {/* Most Used Machinery */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Most Used Machines</CardTitle>
            </div>
            <CardDescription>By production records in {TIME_RANGE_LABELS[timeRange].toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {data.topMachines.length > 0 ? data.topMachines.map((m, i) =>
            <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold ${
                i === 0 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`
                }>{i + 1}</span>
                  <span className="text-sm font-medium truncate">{m.name}</span>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">{m.count} ops</Badge>
              </div>
            ) :
            <p className="text-sm text-muted-foreground text-center py-4">No machine activity yet</p>
            }
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
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{timeRange === 'today' ? "Today's" : TIME_RANGE_LABELS[timeRange]} Throughput</CardTitle>
            <CardDescription>Items processed per phase</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {throughputData.length > 0 ?
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
                    fontSize: 12
                  }} />
                
                  <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {throughputData.map((_, i) =>
                  <Cell key={i} fill={TRANSITION_COLORS[i % TRANSITION_COLORS.length]} />
                  )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer> :

            <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No production recorded</p>
              </div>
            }
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Alerts & Attention</CardTitle>
              {alertCount > 0 &&
              <Badge variant="destructive" className="text-xs">{alertCount}</Badge>
              }
            </div>
            <CardDescription>Items needing your attention</CardDescription>
          </CardHeader>
          <CardContent className="max-h-56 overflow-y-auto space-y-2">
            {alertCount === 0 &&
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <CheckCircle className="h-8 w-8 mb-2 text-success" />
                <p className="text-sm">All clear! No alerts.</p>
              </div>
            }
            {(data.lateBatches || []).map((b) =>
            <Link key={`late-${b.id}`} to={`/orders/${b.order_id}`} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Late: {b.order?.order_number || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{b.quantity} items past ETA</p>
                </div>
              </Link>
            )}
            {(data.flaggedBatches || []).map((b) =>
            <Link key={`flag-${b.id}`} to={`/orders/${b.order_id}`} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <Flag className="h-4 w-4 text-warning mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">Flagged: {b.order?.order_number || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{b.flagged_reason || `${b.quantity} items`}</p>
                </div>
              </Link>
            )}
            {(data.approachingEtaOrders || []).map((o) =>
            <Link key={`eta-${o.id}`} to={`/orders/${o.id}`} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{o.order_number} due soon</p>
                  <p className="text-xs text-muted-foreground">ETA: {format(new Date(o.estimated_fulfillment_time), 'MMM d')}</p>
                </div>
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </div>);

}

/* ─── sub-components ─── */

function KpiCard({ icon: Icon, label, value, sub, color, highlight

}: {icon: React.ElementType;label: string;value: string | number;sub: string;color: string;highlight?: boolean;}) {
  return (
    <Card className={`h-full ${highlight ? 'border-destructive/40 bg-destructive/5' : ''}`}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <p className="text-2xl font-bold">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </CardContent>
    </Card>);

}

function QueueCard({ name, href, icon: Icon, waiting, inProgress, waitingLabel, bgClass, iconClass


}: {name: string;href: string;icon: React.ElementType;waiting: number;inProgress: number;waitingLabel: string;bgClass: string;iconClass: string;}) {
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
    </Link>);

}