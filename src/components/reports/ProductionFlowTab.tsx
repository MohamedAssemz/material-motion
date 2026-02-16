import { useState, useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay, parseISO, isWithinInterval, differenceInHours } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';

const PHASE_COLORS = {
  Manufacturing: 'hsl(214, 95%, 45%)',
  Finishing: 'hsl(38, 92%, 50%)',
  Packaging: 'hsl(263, 70%, 50%)',
  Boxing: 'hsl(187, 85%, 43%)',
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--card-foreground))',
};

interface UnitHistory {
  unit_id: string;
  prev_state: string | null;
  new_state: string;
  created_at: string | null;
}

interface Unit {
  id: string;
  state: string;
  product_id: string;
}

interface ProductionFlowTabProps {
  unitHistory: UnitHistory[];
  units: Unit[];
  products: { id: string; name: string }[];
}

function getPhase(state: string): string | null {
  if (['in_manufacturing', 'manufactured'].includes(state)) return 'Manufacturing';
  if (['waiting_for_pm', 'in_packaging', 'packaged'].includes(state)) return 'Packaging';
  if (['waiting_for_bm', 'in_boxing', 'boxed'].includes(state)) return 'Boxing';
  // "Finishing" is between manufactured and packaging
  if (state === 'manufactured') return 'Finishing';
  return null;
}

function getPhaseForBacklog(state: string): string | null {
  if (['waiting_for_rm', 'in_manufacturing'].includes(state)) return 'Manufacturing';
  if (['manufactured'].includes(state)) return 'Finishing';
  if (['waiting_for_pm', 'in_packaging', 'waiting_for_packaging_material'].includes(state)) return 'Packaging';
  if (['waiting_for_bm', 'in_boxing', 'waiting_for_boxing_material'].includes(state)) return 'Boxing';
  return null;
}

export function ProductionFlowTab({ unitHistory, units, products }: ProductionFlowTabProps) {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [phaseFilter, setPhaseFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');

  // Chart A: Items Processed Per Phase (stacked bar by date)
  const processedPerPhase = useMemo(() => {
    const dayMap = new Map<string, { date: string; Manufacturing: number; Finishing: number; Packaging: number; Boxing: number }>();
    
    unitHistory.forEach(h => {
      if (!h.created_at) return;
      const d = parseISO(h.created_at);
      if (!isWithinInterval(d, { start: startOfDay(dateFrom), end: endOfDay(dateTo) })) return;

      // Check product filter
      if (productFilter !== 'all') {
        const unit = units.find(u => u.id === h.unit_id);
        if (!unit || unit.product_id !== productFilter) return;
      }

      let phase: string | null = null;
      // Determine phase by the new_state transition
      if (h.new_state === 'in_manufacturing') phase = 'Manufacturing';
      else if (h.new_state === 'manufactured') phase = 'Finishing';
      else if (h.new_state === 'in_packaging') phase = 'Packaging';
      else if (h.new_state === 'in_boxing') phase = 'Boxing';

      if (!phase) return;
      if (phaseFilter !== 'all' && phase !== phaseFilter) return;

      const day = format(d, 'MMM dd');
      if (!dayMap.has(day)) dayMap.set(day, { date: day, Manufacturing: 0, Finishing: 0, Packaging: 0, Boxing: 0 });
      (dayMap.get(day) as any)[phase]++;
    });

    return Array.from(dayMap.values());
  }, [unitHistory, dateFrom, dateTo, phaseFilter, productFilter, units]);

  // Chart B: Average Time Spent in Each Phase (horizontal bar)
  const avgTimePerPhase = useMemo(() => {
    // Build timeline per unit: group consecutive states into phase durations
    const unitMap = new Map<string, UnitHistory[]>();
    unitHistory.forEach(h => {
      if (!h.created_at) return;
      const d = parseISO(h.created_at);
      if (!isWithinInterval(d, { start: startOfDay(dateFrom), end: endOfDay(dateTo) })) return;
      if (!unitMap.has(h.unit_id)) unitMap.set(h.unit_id, []);
      unitMap.get(h.unit_id)!.push(h);
    });

    const phaseDurations: Record<string, number[]> = {
      Manufacturing: [], Finishing: [], Packaging: [], Boxing: [],
    };

    unitMap.forEach((events) => {
      events.sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime());
      for (let i = 0; i < events.length - 1; i++) {
        const current = events[i];
        const next = events[i + 1];
        let phase: string | null = null;
        if (current.new_state === 'in_manufacturing') phase = 'Manufacturing';
        else if (current.new_state === 'manufactured') phase = 'Finishing';
        else if (current.new_state === 'in_packaging') phase = 'Packaging';
        else if (current.new_state === 'in_boxing') phase = 'Boxing';
        
        if (phase) {
          const hours = differenceInHours(parseISO(next.created_at!), parseISO(current.created_at!));
          if (hours > 0 && hours < 720) { // cap at 30 days
            phaseDurations[phase].push(hours);
          }
        }
      }
    });

    return Object.entries(phaseDurations).map(([phase, durations]) => ({
      phase,
      avgHours: durations.length > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    })).filter(d => phaseFilter === 'all' || d.phase === phaseFilter);
  }, [unitHistory, dateFrom, dateTo, phaseFilter]);

  // Chart C: Phase Backlog Size (current items per phase)
  const backlogData = useMemo(() => {
    const counts: Record<string, number> = { Manufacturing: 0, Finishing: 0, Packaging: 0, Boxing: 0 };
    units.forEach(u => {
      if (productFilter !== 'all' && u.product_id !== productFilter) return;
      const phase = getPhaseForBacklog(u.state);
      if (phase && (phaseFilter === 'all' || phase === phaseFilter)) {
        counts[phase]++;
      }
    });
    return Object.entries(counts).map(([phase, count]) => ({ phase, count }));
  }, [units, phaseFilter, productFilter]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(dateFrom, 'MMM dd, yy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                    {format(dateTo, 'MMM dd, yy')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Phase</label>
              <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Phases</SelectItem>
                  <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                  <SelectItem value="Finishing">Finishing</SelectItem>
                  <SelectItem value="Packaging">Packaging</SelectItem>
                  <SelectItem value="Boxing">Boxing</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Product</label>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Products</SelectItem>
                  {products.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* A: Items Processed Per Phase */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Items Processed Per Phase</CardTitle>
            <CardDescription>Daily items entering each production phase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {processedPerPhase.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={processedPerPhase}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar dataKey="Manufacturing" stackId="a" fill={PHASE_COLORS.Manufacturing} />
                    <Bar dataKey="Finishing" stackId="a" fill={PHASE_COLORS.Finishing} />
                    <Bar dataKey="Packaging" stackId="a" fill={PHASE_COLORS.Packaging} />
                    <Bar dataKey="Boxing" stackId="a" fill={PHASE_COLORS.Boxing} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data for selected range</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* B: Average Time in Phase */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Time Spent in Each Phase</CardTitle>
            <CardDescription>Average hours items remain in each phase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              {avgTimePerPhase.some(d => d.avgHours > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={avgTimePerPhase} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} unit="h" />
                    <YAxis dataKey="phase" type="category" width={100} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} hours`, 'Avg Time']} />
                    <Bar dataKey="avgHours" name="Avg Hours" radius={[0, 4, 4, 0]}>
                      {avgTimePerPhase.map((entry, i) => (
                        <Cell key={i} fill={(PHASE_COLORS as any)[entry.phase] || 'hsl(var(--primary))'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No timing data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* C: Phase Backlog */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Phase Backlog Size</CardTitle>
            <CardDescription>Current number of items in each phase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={backlogData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="phase" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Items" radius={[4, 4, 0, 0]}>
                    {backlogData.map((entry, i) => (
                      <Cell key={i} fill={(PHASE_COLORS as any)[entry.phase] || 'hsl(var(--primary))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
