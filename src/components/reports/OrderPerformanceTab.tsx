import { useState, useMemo } from 'react';
import { format, subDays, startOfDay, endOfDay, parseISO, differenceInDays, isWithinInterval } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CalendarIcon, CheckCircle2, XCircle, ChevronDown, ChevronRight, Globe, Users } from 'lucide-react';
import { getCountryByCode, getCountryByName } from '@/lib/countries';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

interface Order {
  id: string;
  order_number: string;
  status: string;
  priority: string | null;
  created_at: string | null;
  updated_at: string | null;
  estimated_fulfillment_time: string | null;
  customer_id?: string | null;
}

interface OrderPerformanceTabProps {
  orders: Order[];
  products: { id: string; name: string }[];
  orderItems: { order_id: string; product_id: string; quantity?: number }[];
  customers?: { id: string; name: string; code: string | null; country: string | null }[];
}

const CHART_COLORS = {
  created: 'hsl(214, 95%, 45%)',
  completed: 'hsl(142, 76%, 36%)',
  inProgress: 'hsl(38, 92%, 50%)',
  pending: 'hsl(263, 70%, 50%)',
  cancelled: 'hsl(0, 72%, 51%)',
};

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--card-foreground))',
};

export function OrderPerformanceTab({ orders, products, orderItems, customers = [] }: OrderPerformanceTabProps) {
  const [dateFrom, setDateFrom] = useState<Date>(subDays(new Date(), 30));
  const [dateTo, setDateTo] = useState<Date>(new Date());
  const [priority, setPriority] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [productFilter, setProductFilter] = useState<string>('all');
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const createdAt = order.created_at ? parseISO(order.created_at) : null;
      if (createdAt && !isWithinInterval(createdAt, { start: startOfDay(dateFrom), end: endOfDay(dateTo) })) return false;
      if (priority !== 'all' && order.priority !== priority) return false;
      if (statusFilter !== 'all') {
        const isCompleted = order.status === 'finished' || order.status === 'shipped';
        const isCancelled = order.status === 'cancelled';
        const isInProgress = !isCompleted && !isCancelled && order.status !== 'waiting_for_rm';
        if (statusFilter === 'completed' && !isCompleted) return false;
        if (statusFilter === 'in_progress' && !isInProgress) return false;
        if (statusFilter === 'pending' && order.status !== 'waiting_for_rm') return false;
        if (statusFilter === 'cancelled' && !isCancelled) return false;
      }
      if (productFilter !== 'all') {
        const orderProductIds = orderItems.filter(oi => oi.order_id === order.id).map(oi => oi.product_id);
        if (!orderProductIds.includes(productFilter)) return false;
      }
      return true;
    });
  }, [orders, dateFrom, dateTo, priority, statusFilter, productFilter, orderItems]);

  // Filtered order items based on filtered orders
  const filteredItems = useMemo(() => {
    const ids = new Set(filteredOrders.map(o => o.id));
    return orderItems.filter(oi => ids.has(oi.order_id));
  }, [filteredOrders, orderItems]);

  // Maps
  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  const customerMap = useMemo(() => {
    const m = new Map<string, any>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  const orderCustomerMap = useMemo(() => {
    const m = new Map<string, string>();
    filteredOrders.forEach(o => { if (o.customer_id) m.set(o.id, o.customer_id); });
    return m;
  }, [filteredOrders]);

  // Chart A: Orders Created vs Completed over time
  const createdVsCompleted = useMemo(() => {
    const dayMap = new Map<string, { date: string; created: number; completed: number }>();
    filteredOrders.forEach(order => {
      if (order.created_at) {
        const day = format(parseISO(order.created_at), 'MMM dd');
        if (!dayMap.has(day)) dayMap.set(day, { date: day, created: 0, completed: 0 });
        dayMap.get(day)!.created++;
      }
      const isCompleted = order.status === 'finished' || order.status === 'shipped';
      if (isCompleted && order.updated_at) {
        const day = format(parseISO(order.updated_at), 'MMM dd');
        if (!dayMap.has(day)) dayMap.set(day, { date: day, created: 0, completed: 0 });
        dayMap.get(day)!.completed++;
      }
    });
    return Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [filteredOrders]);

  // Chart B: Completed per period
  const completedPerPeriod = useMemo(() => {
    const completed = filteredOrders.filter(o => o.status === 'finished' || o.status === 'shipped');
    const weekMap = new Map<string, number>();
    completed.forEach(order => {
      if (order.updated_at) {
        const week = format(parseISO(order.updated_at), 'wo \'week\'');
        weekMap.set(week, (weekMap.get(week) || 0) + 1);
      }
    });
    return Array.from(weekMap.entries()).map(([period, count]) => ({ period, count }));
  }, [filteredOrders]);

  // Chart C: Status distribution
  const statusDistribution = useMemo(() => {
    let pending = 0, inProgress = 0, completed = 0, cancelled = 0;
    filteredOrders.forEach(order => {
      const isCompleted = order.status === 'finished' || order.status === 'shipped';
      if (isCompleted) completed++;
      else if (order.status === 'cancelled') cancelled++;
      else if (order.status === 'waiting_for_rm') pending++;
      else inProgress++;
    });
    return [
      { name: 'Pending', value: pending, color: CHART_COLORS.pending },
      { name: 'In Progress', value: inProgress, color: CHART_COLORS.inProgress },
      { name: 'Completed', value: completed, color: CHART_COLORS.completed },
      { name: 'Cancelled', value: cancelled, color: CHART_COLORS.cancelled },
    ].filter(d => d.value > 0);
  }, [filteredOrders]);

  // On-Time Rate
  const onTimeRate = useMemo(() => {
    const completed = filteredOrders.filter(o => o.status === 'finished' || o.status === 'shipped');
    if (completed.length === 0) return 0;
    const onTime = completed.filter(o => {
      if (!o.estimated_fulfillment_time || !o.updated_at) return false;
      return parseISO(o.updated_at) <= parseISO(o.estimated_fulfillment_time);
    }).length;
    return Math.round((onTime / completed.length) * 100);
  }, [filteredOrders]);

  // Avg Lead Time
  const avgLeadTimeData = useMemo(() => {
    const completed = filteredOrders.filter(o =>
      (o.status === 'finished' || o.status === 'shipped') && o.created_at && o.updated_at
    );
    const monthMap = new Map<string, { total: number; count: number }>();
    completed.forEach(order => {
      const days = differenceInDays(parseISO(order.updated_at!), parseISO(order.created_at!));
      const month = format(parseISO(order.updated_at!), 'MMM yyyy');
      if (!monthMap.has(month)) monthMap.set(month, { total: 0, count: 0 });
      const entry = monthMap.get(month)!;
      entry.total += days;
      entry.count++;
    });
    return Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      avgDays: Math.round(data.total / data.count * 10) / 10,
    }));
  }, [filteredOrders]);

  // Cancelled count
  const cancelledCount = useMemo(() => {
    return filteredOrders.filter(o => o.status === 'cancelled').length;
  }, [filteredOrders]);

  // Top countries
  const topCountries = useMemo(() => {
    const agg = new Map<string, { qty: number; orderIds: Set<string>; products: Map<string, number> }>();
    filteredItems.forEach(i => {
      const custId = orderCustomerMap.get(i.order_id);
      if (!custId) return;
      const cust = customerMap.get(custId);
      const country = cust?.country || 'Unknown';
      const e = agg.get(country) || { qty: 0, orderIds: new Set(), products: new Map() };
      e.qty += i.quantity || 0;
      e.orderIds.add(i.order_id);
      e.products.set(i.product_id, (e.products.get(i.product_id) || 0) + (i.quantity || 0));
      agg.set(country, e);
    });
    return Array.from(agg.entries())
      .map(([country, { qty, orderIds, products: prodMap }]) => {
        const info = getCountryByCode(country) || getCountryByName(country);
        return {
          country,
          flag: info?.flag || '🌍',
          displayName: info?.name || country,
          quantity: qty,
          orders: orderIds.size,
          products: Array.from(prodMap.entries())
            .map(([pid, q]) => ({ name: productMap.get(pid)?.name || 'Unknown', quantity: q }))
            .sort((a, b) => b.quantity - a.quantity),
        };
      })
      .sort((a, b) => b.quantity - a.quantity);
  }, [filteredItems, orderCustomerMap, customerMap, productMap]);

  // Top customers
  const topCustomers = useMemo(() => {
    const agg = new Map<string, { qty: number; orderIds: Set<string>; products: Map<string, number> }>();
    filteredItems.forEach(i => {
      const custId = orderCustomerMap.get(i.order_id);
      if (!custId) return;
      const e = agg.get(custId) || { qty: 0, orderIds: new Set(), products: new Map() };
      e.qty += i.quantity || 0;
      e.orderIds.add(i.order_id);
      e.products.set(i.product_id, (e.products.get(i.product_id) || 0) + (i.quantity || 0));
      agg.set(custId, e);
    });
    return Array.from(agg.entries())
      .map(([custId, { qty, orderIds, products: prodMap }]) => {
        const cust = customerMap.get(custId);
        return {
          id: custId,
          name: cust?.name || 'Unknown',
          code: cust?.code || '',
          country: cust?.country || '',
          quantity: qty,
          orders: orderIds.size,
          products: Array.from(prodMap.entries())
            .map(([pid, q]) => ({ name: productMap.get(pid)?.name || 'Unknown', quantity: q }))
            .sort((a, b) => b.quantity - a.quantity),
        };
      })
      .sort((a, b) => b.quantity - a.quantity);
  }, [filteredItems, orderCustomerMap, customerMap, productMap]);

  const toggleCountry = (c: string) => {
    setExpandedCountries(prev => {
      const next = new Set(prev);
      next.has(c) ? next.delete(c) : next.add(c);
      return next;
    });
  };

  const toggleCustomer = (id: string) => {
    setExpandedCustomers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

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
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
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
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
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
              <label className="text-xs font-medium text-muted-foreground">Priority</label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
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

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">On-Time Completion Rate</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{onTimeRate}%</div>
            <p className="text-xs text-muted-foreground mt-1">Completed before estimated fulfillment time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Total Orders</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">{filteredOrders.length}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Completed</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">
              {filteredOrders.filter(o => o.status === 'finished' || o.status === 'shipped').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cancelled</CardTitle>
            <XCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">{cancelledCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* A: Created vs Completed */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders Created vs Completed</CardTitle>
            <CardDescription>Daily order creation and completion trend</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {createdVsCompleted.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={createdVsCompleted}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Line type="monotone" dataKey="created" stroke={CHART_COLORS.created} name="Created" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="completed" stroke={CHART_COLORS.completed} name="Completed" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No data for selected range</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* B: Completed per Period */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders Completed per Period</CardTitle>
            <CardDescription>Weekly completion count</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {completedPerPeriod.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={completedPerPeriod}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" fill={CHART_COLORS.completed} name="Completed" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No completed orders in range</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* C: Status Distribution Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Orders by Status</CardTitle>
            <CardDescription>Current status distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {statusDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value" nameKey="name">
                      {statusDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No orders in range</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* E: Average Lead Time */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Average Order Lead Time</CardTitle>
            <CardDescription>Average days from creation to completion</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              {avgLeadTimeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={avgLeadTimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" d" />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} days`, 'Avg Lead Time']} />
                    <Line type="monotone" dataKey="avgDays" stroke={CHART_COLORS.created} name="Avg Days" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No completed orders with dates</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Countries & Top Customers */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Top Ordering Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No country data for selected range</p>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-1">
                  {topCountries.map((c, idx) => (
                    <Collapsible key={c.country} open={expandedCountries.has(c.country)} onOpenChange={() => toggleCountry(c.country)}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-muted/50 cursor-pointer">
                          <span className="text-sm font-mono text-muted-foreground w-6 text-right">#{idx + 1}</span>
                          <span className="text-xl">{c.flag}</span>
                          <span className="flex-1 text-sm font-medium text-left truncate">{c.displayName}</span>
                          <Badge variant="secondary">{c.quantity.toLocaleString()} units</Badge>
                          <span className="text-xs text-muted-foreground">{c.orders} orders</span>
                          {expandedCountries.has(c.country) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="ml-14 mb-2 space-y-1 border-l-2 border-muted pl-3">
                          {c.products.map(p => (
                            <div key={p.name} className="flex items-center justify-between py-1 text-sm">
                              <span className="text-muted-foreground truncate">{p.name}</span>
                              <span className="font-medium tabular-nums">{p.quantity.toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Top Ordering Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No customer data for selected range</p>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-1">
                  {topCustomers.map((c, idx) => {
                    const countryInfo = c.country ? (getCountryByCode(c.country) || getCountryByName(c.country)) : null;
                    return (
                      <Collapsible key={c.id} open={expandedCustomers.has(c.id)} onOpenChange={() => toggleCustomer(c.id)}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-muted/50 cursor-pointer">
                            <span className="text-sm font-mono text-muted-foreground w-6 text-right">#{idx + 1}</span>
                            {countryInfo && <span className="text-lg">{countryInfo.flag}</span>}
                            <div className="flex-1 text-left">
                              <span className="text-sm font-medium truncate block">{c.name}</span>
                              {c.code && <span className="text-xs text-muted-foreground">{c.code}</span>}
                            </div>
                            <Badge variant="secondary">{c.quantity.toLocaleString()} units</Badge>
                            <span className="text-xs text-muted-foreground">{c.orders} orders</span>
                            {expandedCustomers.has(c.id) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="ml-14 mb-2 space-y-1 border-l-2 border-muted pl-3">
                            {c.products.map(p => (
                              <div key={p.name} className="flex items-center justify-between py-1 text-sm">
                                <span className="text-muted-foreground truncate">{p.name}</span>
                                <span className="font-medium tabular-nums">{p.quantity.toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
