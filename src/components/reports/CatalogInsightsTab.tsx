import { useMemo, useState } from 'react';
import { subMonths, subYears, startOfMonth, isAfter, isBefore, format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { CalendarIcon, ChevronDown, ChevronRight, Package, Users, Globe, ShoppingCart, TrendingUp } from 'lucide-react';
import { getCountryByCode, getCountryByName } from '@/lib/countries';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';

interface Props {
  orders: any[];
  orderItems: any[];
  products: any[];
  customers: any[];
}

type DurationPreset = 'last_month' | 'last_3_months' | 'last_6_months' | 'last_year' | 'custom';

const DURATION_LABELS: Record<DurationPreset, string> = {
  last_month: 'Last Month',
  last_3_months: 'Last 3 Months',
  last_6_months: 'Last 6 Months',
  last_year: 'Last Year',
  custom: 'Custom Date',
};

function getDateRange(preset: DurationPreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  if (preset === 'custom' && customFrom && customTo) {
    return { from: customFrom, to: customTo };
  }
  switch (preset) {
    case 'last_month': return { from: subMonths(startOfMonth(now), 1), to: now };
    case 'last_3_months': return { from: subMonths(now, 3), to: now };
    case 'last_6_months': return { from: subMonths(now, 6), to: now };
    case 'last_year': return { from: subYears(now, 1), to: now };
    default: return { from: subMonths(now, 1), to: now };
  }
}

export function CatalogInsightsTab({ orders, orderItems, products, customers }: Props) {
  const [duration, setDuration] = useState<DurationPreset>('last_month');
  const [customFrom, setCustomFrom] = useState<Date>();
  const [customTo, setCustomTo] = useState<Date>();
  const [expandedCountries, setExpandedCountries] = useState<Set<string>>(new Set());
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());

  const { from, to } = getDateRange(duration, customFrom, customTo);

  // Filter orders by date range
  const filteredOrderIds = useMemo(() => {
    return new Set(
      orders
        .filter(o => {
          const d = new Date(o.created_at);
          return isAfter(d, from) && isBefore(d, to);
        })
        .map(o => o.id)
    );
  }, [orders, from, to]);

  // Build order->customer map
  const orderCustomerMap = useMemo(() => {
    const m = new Map<string, string>();
    orders.forEach(o => { if (o.customer_id) m.set(o.id, o.customer_id); });
    return m;
  }, [orders]);

  // Customer map
  const customerMap = useMemo(() => {
    const m = new Map<string, any>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  // Product map
  const productMap = useMemo(() => {
    const m = new Map<string, any>();
    products.forEach(p => m.set(p.id, p));
    return m;
  }, [products]);

  // Filtered order items
  const filteredItems = useMemo(() => {
    return orderItems.filter(oi => filteredOrderIds.has(oi.order_id));
  }, [orderItems, filteredOrderIds]);

  // KPIs
  const kpis = useMemo(() => {
    const productIds = new Set(filteredItems.map(i => i.product_id));
    const totalUnits = filteredItems.reduce((s, i) => s + (i.quantity || 0), 0);
    const customerIds = new Set<string>();
    const countrySet = new Set<string>();
    filteredItems.forEach(i => {
      const custId = orderCustomerMap.get(i.order_id);
      if (custId) {
        customerIds.add(custId);
        const cust = customerMap.get(custId);
        if (cust?.country) countrySet.add(cust.country);
      }
    });
    return { uniqueProducts: productIds.size, totalUnits, uniqueCustomers: customerIds.size, uniqueCountries: countrySet.size };
  }, [filteredItems, orderCustomerMap, customerMap]);

  // Top selling products
  const topProducts = useMemo(() => {
    const agg = new Map<string, { qty: number; orderIds: Set<string> }>();
    filteredItems.forEach(i => {
      const e = agg.get(i.product_id) || { qty: 0, orderIds: new Set() };
      e.qty += i.quantity || 0;
      e.orderIds.add(i.order_id);
      agg.set(i.product_id, e);
    });
    return Array.from(agg.entries())
      .map(([pid, { qty, orderIds }]) => ({
        id: pid,
        name: productMap.get(pid)?.name || 'Unknown',
        quantity: qty,
        orders: orderIds.size,
      }))
      .sort((a, b) => b.quantity - a.quantity);
  }, [filteredItems, productMap]);

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

  const chartData = topProducts.slice(0, 10).map(p => ({
    name: p.name.length > 20 ? p.name.slice(0, 18) + '…' : p.name,
    quantity: p.quantity,
  }));

  const chartConfig = {
    quantity: { label: 'Quantity', color: 'hsl(var(--primary))' },
  };

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
      {/* Duration Filter */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-sm font-medium text-muted-foreground">Time Period</label>
          <Select value={duration} onValueChange={(v) => setDuration(v as DurationPreset)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DURATION_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {duration === 'custom' && (
          <>
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">From</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[160px] justify-start text-left font-normal', !customFrom && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customFrom ? format(customFrom, 'PP') : 'Start'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium text-muted-foreground">To</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[160px] justify-start text-left font-normal', !customTo && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {customTo ? format(customTo, 'PP') : 'End'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground pb-2">
          {format(from, 'MMM d, yyyy')} — {format(to, 'MMM d, yyyy')}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><Package className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{kpis.uniqueProducts}</p>
              <p className="text-xs text-muted-foreground">Unique Products</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><ShoppingCart className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{kpis.totalUnits.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Total Units</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><Users className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{kpis.uniqueCustomers}</p>
              <p className="text-xs text-muted-foreground">Unique Customers</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2"><Globe className="h-5 w-5 text-primary" /></div>
            <div>
              <p className="text-2xl font-bold">{kpis.uniqueCountries}</p>
              <p className="text-xs text-muted-foreground">Unique Countries</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Selling Products */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Top Selling Products
          </CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[300px] w-full">
              <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 12 }} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="quantity" fill="var(--color-quantity)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No product data for this period</p>
          )}

          {topProducts.length > 0 && (
            <ScrollArea className="mt-4 max-h-[300px]">
              <div className="space-y-1">
                {topProducts.map((p, idx) => (
                  <div key={p.id} className="flex items-center gap-3 py-2 px-3 rounded-md hover:bg-muted/50">
                    <span className="text-sm font-mono text-muted-foreground w-6 text-right">#{idx + 1}</span>
                    <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
                    <Badge variant="secondary">{p.quantity.toLocaleString()} units</Badge>
                    <span className="text-xs text-muted-foreground">{p.orders} orders</span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Top Ordering Countries */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Top Ordering Countries
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCountries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No country data for this period</p>
            ) : (
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-1">
                  {topCountries.map((c, idx) => (
                    <Collapsible key={c.country} open={expandedCountries.has(c.country)} onOpenChange={() => toggleCountry(c.country)}>
                      <CollapsibleTrigger className="w-full">
                        <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-muted/50 cursor-pointer">
                          <span className="text-sm font-mono text-muted-foreground w-6 text-right">#{idx + 1}</span>
                          <span className="text-xl">{c.flag}</span>
                          <span className="flex-1 text-sm font-medium text-left truncate">{c.displayName}</span>
                          <Badge variant="secondary">{c.quantity.toLocaleString()}</Badge>
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

        {/* Top Ordering Customers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Top Ordering Customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topCustomers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No customer data for this period</p>
            ) : (
              <ScrollArea className="max-h-[500px]">
                <div className="space-y-1">
                  {topCustomers.map((c, idx) => {
                    const countryInfo = c.country ? (getCountryByCode(c.country) || getCountryByName(c.country)) : null;
                    return (
                      <Collapsible key={c.id} open={expandedCustomers.has(c.id)} onOpenChange={() => toggleCustomer(c.id)}>
                        <CollapsibleTrigger className="w-full">
                          <div className="flex items-center gap-3 py-2.5 px-3 rounded-md hover:bg-muted/50 cursor-pointer">
                            <span className="text-sm font-mono text-muted-foreground w-6 text-right">#{idx + 1}</span>
                            {countryInfo && <span className="text-lg">{countryInfo.flag}</span>}
                            <div className="flex-1 text-left min-w-0">
                              <p className="text-sm font-medium truncate">{c.name}</p>
                              {c.code && <p className="text-xs text-muted-foreground">{c.code}</p>}
                            </div>
                            <Badge variant="secondary">{c.quantity.toLocaleString()}</Badge>
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
