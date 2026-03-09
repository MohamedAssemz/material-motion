import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Factory, Clock, AlertTriangle, TrendingUp, BarChart3, Timer } from 'lucide-react';
import { format, formatDistanceToNow, differenceInDays } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

interface BatchETA {
  id: string;
  qr_code_data: string;
  eta: string;
  current_state: string;
  quantity: number;
  lead_time_days: number | null;
  is_late: boolean;
  days_remaining: number;
  product_name: string;
  order_number: string;
}

interface MachineStats {
  machine_id: string;
  machine_name: string;
  machine_type: string;
  total_production: number;
  production_today: number;
  production_this_week: number;
}

interface StateDistribution {
  state: string;
  count: number;
  label: string;
}

interface GlobalCounters {
  avgLeadTime: number;
  lateBatches: number;
}

const STATE_COLORS: Record<string, string> = {
  waiting_for_rm: 'hsl(38, 92%, 50%)',
  in_manufacturing: 'hsl(214, 95%, 45%)',
  manufactured: 'hsl(214, 95%, 65%)',
  waiting_for_pm: 'hsl(25, 95%, 53%)',
  in_packaging: 'hsl(263, 70%, 50%)',
  packaged: 'hsl(263, 70%, 70%)',
  waiting_for_bm: 'hsl(16, 85%, 60%)',
  in_boxing: 'hsl(187, 85%, 43%)',
  boxed: 'hsl(187, 85%, 63%)',
  qced: 'hsl(166, 72%, 40%)',
  finished: 'hsl(142, 76%, 36%)',
};

export default function Analytics() {
  const navigate = useNavigate();
  const [batchETAs, setBatchETAs] = useState<BatchETA[]>([]);
  const [machineStats, setMachineStats] = useState<MachineStats[]>([]);
  const [stateDistribution, setStateDistribution] = useState<StateDistribution[]>([]);
  const [globalCounters, setGlobalCounters] = useState<GlobalCounters>({
    totalTerminations: 0,
    totalRedos: 0,
    avgLeadTime: 0,
    lateBatches: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();

    const channel = supabase
      .channel('analytics-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => {
        fetchAnalytics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machine_production' }, () => {
        fetchAnalytics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Fetch batches with ETA
      const { data: batchesData } = await supabase
        .from('order_batches')
        .select(`
          id,
          qr_code_data,
          eta,
          current_state,
          quantity,
          lead_time_days,
          is_redo,
          is_terminated,
          product:products(name),
          order:orders(order_number)
        `)
        .not('eta', 'is', null)
        .not('current_state', 'eq', 'finished')
        .order('eta', { ascending: true });

      const now = new Date();
      const processedBatches: BatchETA[] = (batchesData || []).map((batch: any) => {
        const etaDate = new Date(batch.eta);
        const daysRemaining = differenceInDays(etaDate, now);
        return {
          id: batch.id,
          qr_code_data: batch.qr_code_data || 'N/A',
          eta: batch.eta,
          current_state: batch.current_state,
          quantity: batch.quantity,
          lead_time_days: batch.lead_time_days,
          is_late: etaDate < now,
          days_remaining: daysRemaining,
          product_name: batch.product?.name || 'Unknown',
          order_number: batch.order?.order_number || 'Unknown',
        };
      });
      setBatchETAs(processedBatches);

      // Fetch machine production stats
      const { data: machinesData } = await supabase
        .from('machines')
        .select('id, name, type');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      const { data: productionData } = await supabase
        .from('machine_production')
        .select('machine_id, created_at');

      const machineStatsMap = new Map<string, MachineStats>();
      
      (machinesData || []).forEach((machine: any) => {
        machineStatsMap.set(machine.id, {
          machine_id: machine.id,
          machine_name: machine.name,
          machine_type: machine.type,
          total_production: 0,
          production_today: 0,
          production_this_week: 0,
        });
      });

      (productionData || []).forEach((prod: any) => {
        const stats = machineStatsMap.get(prod.machine_id);
        if (stats) {
          stats.total_production++;
          const prodDate = new Date(prod.created_at);
          if (prodDate >= today) {
            stats.production_today++;
          }
          if (prodDate >= weekAgo) {
            stats.production_this_week++;
          }
        }
      });

      setMachineStats(Array.from(machineStatsMap.values()).filter(m => m.total_production > 0));

      // Fetch state distribution
      const { data: allBatches } = await supabase
        .from('order_batches')
        .select('current_state, quantity');

      const stateMap = new Map<string, number>();
      (allBatches || []).forEach((batch: any) => {
        const current = stateMap.get(batch.current_state) || 0;
        stateMap.set(batch.current_state, current + batch.quantity);
      });

      const distribution: StateDistribution[] = Array.from(stateMap.entries()).map(([state, count]) => ({
        state,
        count,
        label: state.replace(/_/g, ' ').toUpperCase(),
      }));
      setStateDistribution(distribution);

      // Fetch global counters
      const { data: ordersData } = await supabase
        .from('orders')
        .select('termination_counter, redo_counter');

      const totalTerminations = (ordersData || []).reduce((sum, o: any) => sum + (o.termination_counter || 0), 0);
      const totalRedos = (ordersData || []).reduce((sum, o: any) => sum + (o.redo_counter || 0), 0);

      const { data: leadTimeData } = await supabase
        .from('order_batches')
        .select('lead_time_days')
        .not('lead_time_days', 'is', null);

      const avgLeadTime = leadTimeData && leadTimeData.length > 0
        ? (leadTimeData.reduce((sum, b: any) => sum + b.lead_time_days, 0) / leadTimeData.length)
        : 0;

      setGlobalCounters({
        totalTerminations,
        totalRedos,
        avgLeadTime: Math.round(avgLeadTime * 10) / 10,
        lateBatches: processedBatches.filter(b => b.is_late).length,
      });

    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Analytics & Timelines</h1>
          <p className="text-muted-foreground">Production metrics and batch tracking</p>
        </div>
      </div>

      {/* Global Counters */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Terminations</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{globalCounters.totalTerminations}</div>
            <p className="text-xs text-muted-foreground">Items marked as lost</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Redos</CardTitle>
            <TrendingUp className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-warning">{globalCounters.totalRedos}</div>
            <p className="text-xs text-muted-foreground">Items sent for redo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Lead Time</CardTitle>
            <Timer className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{globalCounters.avgLeadTime} days</div>
            <p className="text-xs text-muted-foreground">Average per stage</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Late Batches</CardTitle>
            <Clock className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{globalCounters.lateBatches}</div>
            <p className="text-xs text-muted-foreground">Past their ETA</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* State Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Items by State
            </CardTitle>
            <CardDescription>Current distribution of items across states</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stateDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="count"
                    nameKey="label"
                  >
                    {stateDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATE_COLORS[entry.state] || 'hsl(0, 0%, 50%)'} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value, name) => [value, name]}
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Machine Production */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Factory className="h-5 w-5" />
              Machine Production Rate
            </CardTitle>
            <CardDescription>Production output by machine</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {machineStats.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={machineStats} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="machine_name" type="category" width={100} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="production_today" fill="hsl(214, 95%, 45%)" name="Today" />
                    <Bar dataKey="production_this_week" fill="hsl(142, 76%, 36%)" name="This Week" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No machine production data available
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batch ETA Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Batch ETA Timeline
          </CardTitle>
          <CardDescription>Upcoming batch deadlines and late batches</CardDescription>
        </CardHeader>
        <CardContent>
          {batchETAs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No batches with ETA set</p>
          ) : (
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {batchETAs.map((batch) => (
                <div
                  key={batch.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    batch.is_late ? 'border-destructive bg-destructive/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className="text-center min-w-[60px]">
                      <div className={`text-lg font-bold ${batch.is_late ? 'text-destructive' : 'text-primary'}`}>
                        {batch.is_late ? 'LATE' : `${batch.days_remaining}d`}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {batch.is_late ? 'overdue' : 'remaining'}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{batch.qr_code_data}</span>
                        <Badge variant="outline" className="text-xs">
                          {batch.current_state.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {batch.product_name} • {batch.order_number} • {batch.quantity} items
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      ETA: {format(new Date(batch.eta), 'MMM d, yyyy')}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(batch.eta), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}