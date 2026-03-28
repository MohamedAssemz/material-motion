import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Box, Package, Search, CalendarIcon, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';
import { useLanguage } from '@/contexts/LanguageContext';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';

interface Order {
  id: string; order_number: string; reference_number: string | null; created_at: string; status: string;
  ready_for_boxing_count: number; boxing_count: number; ready_for_shipment_count: number;
  shipped_count: number; extra_boxing_count: number; total_units: number;
  _phaseCompleted: boolean;
}
type StatusFilter = 'all' | 'ready_for_boxing' | 'in_boxing' | 'ready_for_shipment' | 'shipped' | 'extra';
type TabStatus = 'active' | 'completed';

const BOXING_ACTIVE_STATES = ['ready_for_boxing', 'in_boxing', 'ready_for_shipment'];
const BOXING_PAST_STATES = ['shipped'];

export default function QueueBoxing() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeTab, setActiveTab] = useState<TabStatus>('active');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel('boxing-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_batches' }, () => fetchOrders())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchOrders = async () => {
    try {
      const { data: batchesData, error: batchError } = await supabase.from('order_batches').select('order_id, current_state, quantity');
      if (batchError) throw batchError;
      const { data: extraBatchesData, error: extraError } = await supabase.from('extra_batches').select('order_id, current_state, quantity').eq('current_state', 'extra_boxing').eq('inventory_state', 'RESERVED').not('order_id', 'is', null);
      if (extraError) throw extraError;

      const activeOrderIds = new Set<string>();
      const allOrderIds = new Set<string>();
      const orderHasPastBatches = new Set<string>();

      batchesData?.forEach(b => {
        if (b.order_id) {
          allOrderIds.add(b.order_id);
          if (BOXING_ACTIVE_STATES.includes(b.current_state)) activeOrderIds.add(b.order_id);
          if (BOXING_PAST_STATES.includes(b.current_state)) orderHasPastBatches.add(b.order_id);
        }
      });
      extraBatchesData?.forEach(b => { if (b.order_id) { activeOrderIds.add(b.order_id); allOrderIds.add(b.order_id); } });

      if (allOrderIds.size === 0) { setOrders([]); setLoading(false); return; }

      const { data: ordersData, error: ordersError } = await supabase.from('orders').select('id, order_number, reference_number, created_at, status').in('id', Array.from(allOrderIds));
      if (ordersError) throw ordersError;
      const { data: orderItemsData } = await supabase.from('order_items').select('order_id, quantity').in('order_id', Array.from(allOrderIds));
      const orderUnitCounts = new Map<string, number>();
      orderItemsData?.forEach(item => { orderUnitCounts.set(item.order_id, (orderUnitCounts.get(item.order_id) || 0) + item.quantity); });

      const ordersWithCounts = (ordersData || []).map((order: any) => {
        const orderBatches = batchesData?.filter(b => b.order_id === order.id) || [];
        const extraBatches = extraBatchesData?.filter(b => b.order_id === order.id) || [];
        const shippedCount = orderBatches.filter((b: any) => b.current_state === 'shipped').reduce((s: number, b: any) => s + b.quantity, 0);
        const totalUnits = orderUnitCounts.get(order.id) || 0;
        const hasActive = activeOrderIds.has(order.id);
        const hasPast = orderHasPastBatches.has(order.id);
        const phaseCompleted = !hasActive && hasPast;

        return {
          id: order.id, order_number: order.order_number, reference_number: order.reference_number,
          created_at: order.created_at, status: order.status,
          ready_for_boxing_count: orderBatches.filter((b: any) => b.current_state === 'ready_for_boxing').reduce((s: number, b: any) => s + b.quantity, 0),
          boxing_count: orderBatches.filter((b: any) => b.current_state === 'in_boxing').reduce((s: number, b: any) => s + b.quantity, 0),
          ready_for_shipment_count: orderBatches.filter((b: any) => b.current_state === 'ready_for_shipment').reduce((s: number, b: any) => s + b.quantity, 0),
          shipped_count: shippedCount,
          extra_boxing_count: extraBatches.reduce((s: number, b: any) => s + b.quantity, 0),
          total_units: totalUnits,
          _phaseCompleted: phaseCompleted, _hasActive: hasActive,
        };
      }).filter((o: any) => o._hasActive || o._phaseCompleted);
      setOrders(ordersWithCounts);
    } catch (error) { console.error('Error fetching orders:', error); } finally { setLoading(false); }
  };

  const activeOrders = useMemo(() => orders.filter(o => !o._phaseCompleted && o.status === 'in_progress'), [orders]);
  const completedOrders = useMemo(() => orders.filter(o => o._phaseCompleted), [orders]);

  const applyFilters = (list: Order[]) => {
    let filtered = list;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(o => o.order_number.toLowerCase().includes(term) || (o.reference_number && o.reference_number.toLowerCase().includes(term)));
    }
    if (dateRange?.from) {
      const from = new Date(dateRange.from); from.setHours(0, 0, 0, 0);
      const to = dateRange.to ? new Date(dateRange.to) : new Date(from);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter(o => { const d = new Date(o.created_at); return d >= from && d <= to; });
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter(order => {
        switch (statusFilter) {
          case 'ready_for_boxing': return order.ready_for_boxing_count > 0;
          case 'in_boxing': return order.boxing_count > 0;
          case 'ready_for_shipment': return order.ready_for_shipment_count > 0;
          case 'shipped': return order.shipped_count > 0;
          case 'extra': return order.extra_boxing_count > 0;
          default: return true;
        }
      });
    }
    return filtered;
  };

  const filteredActive = useMemo(() => applyFilters(activeOrders), [activeOrders, searchTerm, dateRange, statusFilter]);
  const filteredCompleted = useMemo(() => applyFilters(completedOrders), [completedOrders, searchTerm, dateRange, statusFilter]);

  const dateLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`
      : format(dateRange.from, 'dd/MM/yyyy')
    : t('queue.filter_by_date');

  const renderTable = (ordersList: Order[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('queue.order_number')}</TableHead>
          <TableHead>{t('queue.reference')}</TableHead>
          <TableHead>{t('queue.ready_boxing')}</TableHead>
          <TableHead>{t('queue.in_boxing')}</TableHead>
          <TableHead>{t('queue.extra_items')}</TableHead>
          <TableHead>{t('queue.ready_shipment')}</TableHead>
          <TableHead>{t('queue.shipped')}</TableHead>
          <TableHead>{t('queue.created_date')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordersList.map((order) => (
          <TableRow key={order.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/orders/${order.id}/boxing`)}>
            <TableCell className="font-medium">{order.order_number}</TableCell>
            <TableCell className="text-muted-foreground">{order.reference_number || '—'}</TableCell>
            <TableCell>{order.ready_for_boxing_count > 0 && <Badge className="bg-orange-500">{order.ready_for_boxing_count} {t('common.items')}</Badge>}</TableCell>
            <TableCell>{order.boxing_count > 0 && <Badge className="bg-cyan-500">{order.boxing_count} {t('common.items')}</Badge>}</TableCell>
            <TableCell>{order.extra_boxing_count > 0 && <Badge variant="outline" className="border-amber-500 text-amber-600"><Package className="h-3 w-3 mr-1" />{order.extra_boxing_count} {t('phase.extra').toLowerCase()}</Badge>}</TableCell>
            <TableCell>{order.ready_for_shipment_count > 0 && <Badge className="bg-green-500">{order.ready_for_shipment_count} {t('common.items')}</Badge>}</TableCell>
            <TableCell>{order.shipped_count > 0 && <Badge variant="secondary">{order.shipped_count} {t('common.items')}</Badge>}</TableCell>
            <TableCell>{format(new Date(order.created_at), 'PPP')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2"><Box className="h-8 w-8" />{t('boxing.queue')}</h1>
        <p className="text-muted-foreground">{t('queue.boxing_desc')}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t('queue.search_placeholder')} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className={cn("min-w-[240px] justify-start text-left font-normal", !dateRange?.from && "text-muted-foreground")}>
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {dateRange?.from && <Button variant="ghost" size="icon" onClick={() => setDateRange(undefined)}><X className="h-4 w-4" /></Button>}
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">{t('common.status')}:</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-48"><SelectValue placeholder={t('queue.all_statuses')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('queue.all_statuses')}</SelectItem>
              <SelectItem value="ready_for_boxing">{t('queue.ready_boxing')}</SelectItem>
              <SelectItem value="in_boxing">{t('queue.in_boxing')}</SelectItem>
              <SelectItem value="ready_for_shipment">{t('queue.ready_shipment')}</SelectItem>
              <SelectItem value="shipped">{t('queue.has_shipped')}</SelectItem>
              <SelectItem value="extra">{t('queue.has_extra')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)} className="space-y-4">
        <TabsList>
          <TabsTrigger value="active" className="gap-2">{t('common.active')}<Badge variant="secondary" className="ml-1">{activeOrders.length}</Badge></TabsTrigger>
          <TabsTrigger value="completed" className="gap-2">{t('status.completed')}<Badge variant="secondary" className="ml-1">{completedOrders.length}</Badge></TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <Card><CardContent className="pt-6">
            {loading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            : filteredActive.length === 0 ? <div className="text-center py-8 text-muted-foreground">{t('queue.no_active_boxing')}</div>
            : renderTable(filteredActive)}
          </CardContent></Card>
        </TabsContent>
        <TabsContent value="completed">
          <Card><CardContent className="pt-6">
            {loading ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
            : filteredCompleted.length === 0 ? <div className="text-center py-8 text-muted-foreground">{t('queue.no_completed_boxing')}</div>
            : renderTable(filteredCompleted)}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
