import { useState, useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay, parseISO, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { CalendarIcon } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';

const CHART_COLORS = {
  created: 'hsl(214, 95%, 45%)',
  shipped: 'hsl(142, 76%, 36%)',
  extra: 'hsl(263, 70%, 50%)',
};

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

interface BoxData {
  id: string;
  box_code: string;
  created_at: string;
  items_list: any;
}

interface Shipment {
  id: string;
  created_at: string;
  status: string;
}

interface ExtraBatchHistory {
  event_type: string;
  quantity: number;
  created_at: string;
  from_state: string | null;
  product_id: string | null;
}

interface InventoryBoxesTabProps {
  boxes: BoxData[];
  shipments: Shipment[];
  extraHistory: ExtraBatchHistory[];
  products: { id: string; name: string }[];
}

export function InventoryBoxesTab({ boxes, shipments, extraHistory, products }: InventoryBoxesTabProps) {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [productFilter, setProductFilter] = useState<string>('all');

  const inRange = (dateStr: string) => {
    const d = parseISO(dateStr);
    return isWithinInterval(d, { start: startOfDay(dateFrom), end: endOfDay(dateTo) });
  };

  // Chart A: Boxes Created vs Shipped
  const boxesCreatedVsShipped = useMemo(() => {
    const dayMap = new Map<string, { date: string; created: number; shipped: number }>();
    
    boxes.forEach(box => {
      if (!inRange(box.created_at)) return;
      const day = format(parseISO(box.created_at), 'MMM dd');
      if (!dayMap.has(day)) dayMap.set(day, { date: day, created: 0, shipped: 0 });
      dayMap.get(day)!.created++;
    });

    shipments.forEach(s => {
      if (s.status !== 'sealed' || !inRange(s.created_at)) return;
      const day = format(parseISO(s.created_at), 'MMM dd');
      if (!dayMap.has(day)) dayMap.set(day, { date: day, created: 0, shipped: 0 });
      dayMap.get(day)!.shipped++;
    });

    return Array.from(dayMap.values());
  }, [boxes, shipments, dateFrom, dateTo]);

  // Chart B: Shipment Count Over Time
  const shipmentCount = useMemo(() => {
    const dayMap = new Map<string, number>();
    shipments.forEach(s => {
      if (!inRange(s.created_at)) return;
      const day = format(parseISO(s.created_at), 'MMM dd');
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    });
    return Array.from(dayMap.entries()).map(([date, count]) => ({ date, count }));
  }, [shipments, dateFrom, dateTo]);

  // Chart C: Average Items per Box
  const avgItemsPerBox = useMemo(() => {
    const dayMap = new Map<string, { total: number; count: number }>();
    boxes.forEach(box => {
      if (!inRange(box.created_at)) return;
      const day = format(parseISO(box.created_at), 'MMM dd');
      if (!dayMap.has(day)) dayMap.set(day, { total: 0, count: 0 });
      const entry = dayMap.get(day)!;
      const items = Array.isArray(box.items_list) ? box.items_list.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) : 0;
      entry.total += items;
      entry.count++;
    });
    return Array.from(dayMap.entries()).map(([date, data]) => ({
      date,
      avg: data.count > 0 ? Math.round(data.total / data.count * 10) / 10 : 0,
    }));
  }, [boxes, dateFrom, dateTo]);

  // Chart D: Extra Inventory Usage by phase
  const extraUsage = useMemo(() => {
    const phases: Record<string, number> = { Manufacturing: 0, Finishing: 0, Packaging: 0, Boxing: 0 };
    extraHistory.forEach(h => {
      if (h.event_type !== 'CONSUMED' && h.event_type !== 'RESERVED') return;
      if (!inRange(h.created_at)) return;
      if (productFilter !== 'all' && h.product_id !== productFilter) return;
      
      // Map from_state to phase
      let phase = 'Manufacturing';
      if (h.from_state) {
        if (['in_manufacturing', 'waiting_for_rm'].some(s => h.from_state!.includes(s))) phase = 'Manufacturing';
        else if (h.from_state.includes('manufactured')) phase = 'Finishing';
        else if (h.from_state.includes('packaging') || h.from_state.includes('packaged')) phase = 'Packaging';
        else if (h.from_state.includes('boxing') || h.from_state.includes('boxed')) phase = 'Boxing';
      }
      phases[phase] += h.quantity;
    });
    return Object.entries(phases).map(([phase, quantity]) => ({ phase, quantity }));
  }, [extraHistory, dateFrom, dateTo, productFilter]);

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
        {/* A: Boxes Created vs Shipped */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Boxes Created vs Shipped</CardTitle>
            <CardDescription>Daily box creation and shipment completion</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {boxesCreatedVsShipped.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={boxesCreatedVsShipped}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="created" stroke={CHART_COLORS.created} name="Created" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="shipped" stroke={CHART_COLORS.shipped} name="Shipped" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data for selected range</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* B: Shipment Count */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shipment Count Over Time</CardTitle>
            <CardDescription>Number of shipments created per day</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {shipmentCount.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={shipmentCount}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill={CHART_COLORS.shipped} name="Shipments" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No shipments in range</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* C: Avg Items per Box */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Items per Box</CardTitle>
            <CardDescription>Average number of items per box over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {avgItemsPerBox.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={avgItemsPerBox}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} items`, 'Avg Items']} />
                    <Line type="monotone" dataKey="avg" stroke={CHART_COLORS.created} name="Avg Items" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No box data in range</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* D: Extra Inventory Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Extra Inventory Usage</CardTitle>
            <CardDescription>Quantity pulled from extra inventory per phase</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={extraUsage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="phase" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="quantity" name="Units Used" radius={[4, 4, 0, 0]}>
                    {extraUsage.map((entry, i) => (
                      <Cell key={i} fill={(PHASE_COLORS as any)[entry.phase] || CHART_COLORS.extra} />
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
