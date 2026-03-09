import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend,
} from 'recharts';
import { CalendarIcon, Wrench, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { format, subDays, startOfDay, isWithinInterval, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';

/* ─── types ─── */
interface MachineRecord {
  id: string;
  machine_id: string;
  state_transition: string;
  created_at: string;
}
interface Machine {
  id: string;
  name: string;
  type: string;
}

type DurationPreset = 'today' | 'week' | '30days' | '90days' | 'custom';

/* ─── constants ─── */
const DURATION_LABELS: Record<DurationPreset, string> = {
  today: 'Today',
  week: 'This Week',
  '30days': 'Last 30 Days',
  '90days': 'Last 90 Days',
  custom: 'Custom Range',
};

const MACHINE_TYPE_COLORS: Record<string, string> = {
  manufacturing: 'hsl(214, 95%, 36%)',
  finishing: 'hsl(270, 60%, 50%)',
  packaging: 'hsl(240, 50%, 55%)',
  boxing: 'hsl(190, 80%, 40%)',
};

const MACHINE_TYPE_BADGE: Record<string, string> = {
  manufacturing: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  finishing: 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300',
  packaging: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
  boxing: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
};

function getPhaseFromTransition(transition: string): string | null {
  if (transition.includes('manufacturing')) return 'manufacturing';
  if (transition.includes('finishing')) return 'finishing';
  if (transition.includes('packaging')) return 'packaging';
  if (transition.includes('boxing')) return 'boxing';
  return null;
}

function getDateRange(preset: DurationPreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case 'today': return { from: startOfDay(now), to: now };
    case 'week': return { from: startOfDay(subDays(now, 7)), to: now };
    case '30days': return { from: startOfDay(subDays(now, 30)), to: now };
    case '90days': return { from: startOfDay(subDays(now, 90)), to: now };
    case 'custom': return { from: customFrom || startOfDay(subDays(now, 30)), to: customTo || now };
  }
}

export function MachineProductionTab() {
  const [records, setRecords] = useState<MachineRecord[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState<DurationPreset>('30days');
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [recordsRes, machinesRes] = await Promise.all([
        supabase.from('machine_production').select('id, machine_id, state_transition, created_at'),
        supabase.from('machines').select('id, name, type'),
      ]);
      setRecords(recordsRes.data || []);
      setMachines(machinesRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const { from: dateFrom, to: dateTo } = useMemo(
    () => getDateRange(duration, customFrom, customTo),
    [duration, customFrom, customTo]
  );

  const machineMap = useMemo(() => new Map(machines.map(m => [m.id, m])), [machines]);

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      const d = parseISO(r.created_at);
      if (!isWithinInterval(d, { start: dateFrom, end: dateTo })) return false;
      if (typeFilter !== 'all') {
        const machine = machineMap.get(r.machine_id);
        if (!machine || machine.type !== typeFilter) return false;
      }
      return true;
    });
  }, [records, dateFrom, dateTo, typeFilter, machineMap]);

  /* A: Total ops per machine */
  const machineOpsData = useMemo(() => {
    const countMap: Record<string, number> = {};
    filteredRecords.forEach(r => {
      countMap[r.machine_id] = (countMap[r.machine_id] || 0) + 1;
    });
    return Object.entries(countMap)
      .map(([id, count]) => {
        const m = machineMap.get(id);
        return { name: m?.name || 'Unknown', type: m?.type || '', count, color: MACHINE_TYPE_COLORS[m?.type || ''] || 'hsl(216,12%,60%)' };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredRecords, machineMap]);

  /* B: Daily trend stacked by type */
  const dailyTrendData = useMemo(() => {
    const dayMap: Record<string, Record<string, number>> = {};
    filteredRecords.forEach(r => {
      const day = format(parseISO(r.created_at), 'MMM d');
      const machine = machineMap.get(r.machine_id);
      const type = machine?.type || 'unknown';
      if (!dayMap[day]) dayMap[day] = {};
      dayMap[day][type] = (dayMap[day][type] || 0) + 1;
    });
    return Object.entries(dayMap)
      .sort((a, b) => {
        // sort chronologically by first occurrence
        const aIdx = records.findIndex(r => format(parseISO(r.created_at), 'MMM d') === a[0]);
        const bIdx = records.findIndex(r => format(parseISO(r.created_at), 'MMM d') === b[0]);
        return aIdx - bIdx;
      })
      .map(([day, types]) => ({ day, ...types }))
      .slice(-30);
  }, [filteredRecords, machineMap, records]);

  /* C: Phase breakdown (start vs finish per phase) */
  const phaseBreakdownData = useMemo(() => {
    const phases = ['manufacturing', 'finishing', 'packaging', 'boxing'];
    return phases.map(phase => {
      let started = 0, finished = 0;
      filteredRecords.forEach(r => {
        if (getPhaseFromTransition(r.state_transition) !== phase) return;
        if (r.state_transition.startsWith('start_')) started++;
        else finished++;
      });
      return { phase: phase.charAt(0).toUpperCase() + phase.slice(1), started, finished };
    });
  }, [filteredRecords]);

  /* D: Ranked table with trend */
  const rankedMachines = useMemo(() => {
    const now = new Date();
    const halfDuration = (dateTo.getTime() - dateFrom.getTime()) / 2;
    const midPoint = new Date(dateFrom.getTime() + halfDuration);

    const currentMap: Record<string, number> = {};
    const prevMap: Record<string, number> = {};

    records.forEach(r => {
      const d = parseISO(r.created_at);
      if (d >= midPoint && d <= dateTo) {
        if (typeFilter !== 'all') {
          const m = machineMap.get(r.machine_id);
          if (!m || m.type !== typeFilter) return;
        }
        currentMap[r.machine_id] = (currentMap[r.machine_id] || 0) + 1;
      } else if (d >= dateFrom && d < midPoint) {
        if (typeFilter !== 'all') {
          const m = machineMap.get(r.machine_id);
          if (!m || m.type !== typeFilter) return;
        }
        prevMap[r.machine_id] = (prevMap[r.machine_id] || 0) + 1;
      }
    });

    const totalMap: Record<string, number> = {};
    filteredRecords.forEach(r => {
      totalMap[r.machine_id] = (totalMap[r.machine_id] || 0) + 1;
    });

    return Object.entries(totalMap)
      .sort((a, b) => b[1] - a[1])
      .map(([id, total], idx) => {
        const m = machineMap.get(id);
        const curr = currentMap[id] || 0;
        const prev = prevMap[id] || 0;
        const trend = prev === 0 ? (curr > 0 ? 'up' : 'flat') : curr > prev ? 'up' : curr < prev ? 'down' : 'flat';
        return { rank: idx + 1, id, name: m?.name || 'Unknown', type: m?.type || '', total, trend };
      });
  }, [filteredRecords, records, dateFrom, dateTo, typeFilter, machineMap]);

  const machineTypes = useMemo(() => [...new Set(machines.map(m => m.type))], [machines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  const totalOps = filteredRecords.length;
  const uniqueMachinesActive = new Set(filteredRecords.map(r => r.machine_id)).size;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={duration} onValueChange={(v) => setDuration(v as DurationPreset)}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DURATION_LABELS) as DurationPreset[]).map(k => (
                  <SelectItem key={k} value={k}>{DURATION_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {duration === 'custom' && (
              <>
                <Popover open={fromOpen} onOpenChange={setFromOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('h-9 text-xs', !customFrom && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {customFrom ? format(customFrom, 'MMM d, yyyy') : 'From'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customFrom} onSelect={(d) => { setCustomFrom(d); setFromOpen(false); }} className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
                <Popover open={toOpen} onOpenChange={setToOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('h-9 text-xs', !customTo && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {customTo ? format(customTo, 'MMM d, yyyy') : 'To'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customTo} onSelect={(d) => { setCustomTo(d); setToOpen(false); }} className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Machine Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {machineTypes.map(t => (
                  <SelectItem key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex gap-4 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{totalOps}</p>
                <p className="text-xs text-muted-foreground">Total Ops</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{uniqueMachinesActive}</p>
                <p className="text-xs text-muted-foreground">Active Machines</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* A: Total ops per machine (horizontal bar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Operations per Machine</CardTitle>
          <CardDescription>Total production records per machine in selected period</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {machineOpsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={machineOpsData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', fontSize: 12 }}
                  formatter={(v) => [v, 'Operations']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {machineOpsData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">No machine production data</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B + C: Daily trend + Phase breakdown */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* B: Daily trend stacked by type */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Production Trend</CardTitle>
            <CardDescription>Operations per day, stacked by machine type</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {dailyTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {['manufacturing', 'finishing', 'packaging', 'boxing'].map(type => (
                    <Bar key={type} dataKey={type} stackId="a" fill={MACHINE_TYPE_COLORS[type]} name={type.charAt(0).toUpperCase() + type.slice(1)} maxBarSize={32} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No data for selected period</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* C: Phase breakdown (start vs finish) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Phase Breakdown</CardTitle>
            <CardDescription>Started vs finished operations per phase</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {phaseBreakdownData.some(d => d.started > 0 || d.finished > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseBreakdownData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="phase" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 'var(--radius)', fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="started" name="Started" fill="hsl(214, 95%, 36%)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="finished" name="Finished" fill="hsl(142, 76%, 36%)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No phase data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* D: Ranked machine table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Machine Leaderboard</CardTitle>
          <CardDescription>Ranked by total operations, with trend vs previous half of period</CardDescription>
        </CardHeader>
        <CardContent>
          {rankedMachines.length > 0 ? (
            <div className="space-y-2">
              {rankedMachines.map(m => {
                const maxOps = rankedMachines[0]?.total || 1;
                const pct = Math.round((m.total / maxOps) * 100);
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <span className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 ${
                      m.rank === 1 ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>{m.rank}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{m.name}</span>
                        {m.type && (
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${MACHINE_TYPE_BADGE[m.type] || 'bg-muted text-muted-foreground'}`}>
                            {m.type}
                          </span>
                        )}
                      </div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: MACHINE_TYPE_COLORS[m.type] || 'hsl(216,12%,60%)' }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold w-12 text-right">{m.total} ops</span>
                      {m.trend === 'up' && <TrendingUp className="h-4 w-4 text-success" />}
                      {m.trend === 'down' && <TrendingDown className="h-4 w-4 text-destructive" />}
                      {m.trend === 'flat' && <Minus className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No machine production data for selected filters</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
