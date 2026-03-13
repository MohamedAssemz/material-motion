import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ArrowLeft, Plus, Search, AlertCircle, Download, Filter, CalendarIcon, X, Package } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, isWithinInterval, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { TablePagination } from "@/components/TablePagination";

type OrderStatus = "pending" | "in_progress" | "completed" | "cancelled";
type TabStatus = "pending" | "completed" | "cancelled";

interface Order {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  estimated_fulfillment_time: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
  unit_count?: number;
  shipped_count?: number;
  computed_status?: OrderStatus;
  customer?: {
    name: string;
  } | null;
  extra_count?: number;
}

interface OrderItem {
  id: string;
  order_id: string;
  quantity: number;
  product: {
    name: string;
    sku: string;
  };
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export default function Orders() {
  const { hasRole } = useAuth();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<Map<string, OrderItem[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<TabStatus>("pending");

  // Filters
  const [dateRange, setDateRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [eftRange, setEftRange] = useState<DateRange>({ from: undefined, to: undefined });
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel("orders-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, () => {
        fetchOrders();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_batches" }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const { data: ordersData, error } = await supabase
        .from("orders")
        .select("*, customer:customers(name)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const { data: itemsData } = await supabase
        .from("order_items")
        .select("id, order_id, quantity, deducted_to_extra, product:products(name, sku)")
        .in("order_id", ordersData?.map((o) => o.id) || []);

      const itemsMap = new Map<string, OrderItem[]>();
      const orderUnitCounts = new Map<string, number>();
      const extraCountsByOrder = new Map<string, number>();
      (itemsData || []).forEach((item: any) => {
        const existing = itemsMap.get(item.order_id) || [];
        existing.push(item);
        itemsMap.set(item.order_id, existing);

        orderUnitCounts.set(item.order_id, (orderUnitCounts.get(item.order_id) || 0) + item.quantity);

        extraCountsByOrder.set(
          item.order_id,
          (extraCountsByOrder.get(item.order_id) || 0) + (item.deducted_to_extra || 0),
        );
      });
      setOrderItems(itemsMap);

      const creatorIds = ordersData?.map((o) => o.created_by).filter(Boolean) || [];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", creatorIds);

      const profilesMap = new Map(profilesData?.map((p) => [p.id, p]) || []);

      const ordersWithStatus = [];

      for (const order of ordersData || []) {
        const { data: batches } = await (
          supabase.from("order_batches").select("current_state, quantity").eq("order_id", order.id) as any
        ).eq("is_terminated", false);

        const batchTotalCount = batches?.reduce((sum, b) => sum + b.quantity, 0) || 0;
        const shippedCount =
          batches?.filter((b) => b.current_state === "shipped").reduce((sum, b) => sum + b.quantity, 0) || 0;
        const inProgressCount =
          batches?.filter((b) => b.current_state !== "shipped").reduce((sum, b) => sum + b.quantity, 0) || 0;

        const unitCount = orderUnitCounts.get(order.id) || 0;

        let computed_status: OrderStatus = "pending";
        if (order.status === "cancelled") {
          computed_status = "cancelled";
        } else if (order.status === "completed" || (unitCount > 0 && shippedCount >= unitCount)) {
          computed_status = "completed";
        } else if (order.status === "in_progress") {
          computed_status = "in_progress";
        }

        ordersWithStatus.push({
          ...order,
          profiles: order.created_by ? profilesMap.get(order.created_by) : null,
          unit_count: unitCount,
          shipped_count: shippedCount,
          computed_status,
          extra_count: extraCountsByOrder.get(order.id) || 0,
        });
      }

      setOrders(ordersWithStatus);
    } catch (error) {
      console.error("Error fetching orders:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesOrder = order.order_number.toLowerCase().includes(term);
        const matchesCustomer = order.customer?.name?.toLowerCase().includes(term);
        const items = orderItems.get(order.id) || [];
        const matchesItem = items.some(
          (item) => item.product?.name?.toLowerCase().includes(term) || item.product?.sku?.toLowerCase().includes(term),
        );
        if (!matchesOrder && !matchesCustomer && !matchesItem) {
          return false;
        }
      }

      if (activeTab === "pending") {
        if (order.computed_status !== "pending" && order.computed_status !== "in_progress") {
          return false;
        }
      } else if (activeTab === "completed") {
        if (order.computed_status !== "completed") {
          return false;
        }
      } else if (activeTab === "cancelled") {
        if (order.computed_status !== "cancelled") {
          return false;
        }
      }

      if (dateRange.from || dateRange.to) {
        const orderDate = parseISO(order.created_at);
        if (dateRange.from && dateRange.to) {
          if (!isWithinInterval(orderDate, { start: dateRange.from, end: dateRange.to })) {
            return false;
          }
        } else if (dateRange.from && orderDate < dateRange.from) {
          return false;
        } else if (dateRange.to && orderDate > dateRange.to) {
          return false;
        }
      }

      if (minQty && order.unit_count !== undefined && order.unit_count < parseInt(minQty)) {
        return false;
      }
      if (maxQty && order.unit_count !== undefined && order.unit_count > parseInt(maxQty)) {
        return false;
      }

      if (eftRange.from || eftRange.to) {
        if (!order.estimated_fulfillment_time) return false;
        const eftDate = parseISO(order.estimated_fulfillment_time);
        if (eftRange.from && eftRange.to) {
          if (!isWithinInterval(eftDate, { start: eftRange.from, end: eftRange.to })) {
            return false;
          }
        } else if (eftRange.from && eftDate < eftRange.from) {
          return false;
        } else if (eftRange.to && eftDate > eftRange.to) {
          return false;
        }
      }

      if (priorityFilter !== "all" && order.priority !== priorityFilter) {
        return false;
      }

      return true;
    });
  }, [orders, orderItems, searchTerm, activeTab, dateRange, minQty, maxQty, eftRange, priorityFilter]);

  const filteredCount = filteredOrders.length;
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, dateRange, minQty, maxQty, eftRange, priorityFilter]);

  const clearFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setMinQty("");
    setMaxQty("");
    setEftRange({ from: undefined, to: undefined });
    setPriorityFilter("all");
  };

  const hasActiveFilters =
    dateRange.from || dateRange.to || minQty || maxQty || eftRange.from || eftRange.to || priorityFilter !== "all";

  const exportOrders = () => {
    const headers = [
      "Order Number",
      "Customer",
      "Priority",
      "Status",
      "Total Items",
      "Shipped",
      "Added to Extra",
      "Created At",
      "EFT",
      "Notes",
      "Item SKU",
      "Item Name",
      "Item Quantity",
    ];
    const rows: string[][] = [];

    filteredOrders.forEach((order) => {
      const items = orderItems.get(order.id) || [];
      if (items.length === 0) {
        rows.push([
          order.order_number,
          order.customer?.name || "",
          order.priority,
          order.computed_status || "",
          String(order.unit_count || 0),
          String(order.shipped_count || 0),
          String(order.extra_count || 0),
          format(new Date(order.created_at), "yyyy-MM-dd HH:mm"),
          order.estimated_fulfillment_time ? format(new Date(order.estimated_fulfillment_time), "yyyy-MM-dd") : "",
          order.notes || "",
          "",
          "",
          "",
        ]);
      } else {
        items.forEach((item, idx) => {
          rows.push([
            idx === 0 ? order.order_number : "",
            idx === 0 ? order.customer?.name || "" : "",
            idx === 0 ? order.priority : "",
            idx === 0 ? order.computed_status || "" : "",
            idx === 0 ? String(order.unit_count || 0) : "",
            idx === 0 ? String(order.shipped_count || 0) : "",
            idx === 0 ? String(order.extra_count || 0) : "",
            idx === 0 ? format(new Date(order.created_at), "yyyy-MM-dd HH:mm") : "",
            idx === 0 && order.estimated_fulfillment_time
              ? format(new Date(order.estimated_fulfillment_time), "yyyy-MM-dd")
              : "",
            idx === 0 ? order.notes || "" : "",
            item.product?.sku || "",
            item.product?.name || "",
            String(item.quantity),
          ]);
        });
      }
    });

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `orders-${activeTab}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  const tabCounts = useMemo(
    () => ({
      pending: orders.filter((o) => o.computed_status === "pending" || o.computed_status === "in_progress").length,
      completed: orders.filter((o) => o.computed_status === "completed").length,
      cancelled: orders.filter((o) => o.computed_status === "cancelled").length,
    }),
    [orders],
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild></Button>
              <div>
                <h1 className="text-2xl font-bold">{t("orders.title")}</h1>
                <p className="text-sm text-muted-foreground">{t("orders.view_manage")}</p>
              </div>
            </div>
            {hasRole("admin") && (
              <Button asChild>
                <Link to="/orders/create">
                  <Plus className="mr-2 h-4 w-4" />
                  {t("orders.create")}
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)} className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="pending" className="gap-2">
                {t("status.pending")}
                <Badge variant="secondary" className="ml-1">
                  {tabCounts.pending}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completed" className="gap-2">
                {t("status.completed")}
                <Badge variant="secondary" className="ml-1">
                  {tabCounts.completed}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="cancelled" className="gap-2">
                {t("status.cancelled")}
                <Badge variant="secondary" className="ml-1">
                  {tabCounts.cancelled}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("orders.search_orders")}
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button
                variant={showFilters ? "default" : "outline"}
                size="icon"
                onClick={() => setShowFilters(!showFilters)}
                className={hasActiveFilters ? "border-primary" : ""}
              >
                <Filter className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={exportOrders}>
                <Download className="h-4 w-4 mr-2" />
                {t("common.export")}
              </Button>
            </div>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-medium">{t("orders.filters")}</h3>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      <X className="h-4 w-4 mr-1" />
                      {t("orders.clear_all")}
                    </Button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Created Date Range */}
                  <div className="space-y-2">
                    <Label>{t("orders.created_date")}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {dateRange.from
                            ? dateRange.to
                              ? `${format(dateRange.from, "MMM d")} - ${format(dateRange.to, "MMM d")}`
                              : format(dateRange.from, "MMM d, yyyy")
                            : t("orders.pick_dates")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={{ from: dateRange.from, to: dateRange.to }}
                          onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Quantity Range */}
                  <div className="space-y-2">
                    <Label>{t("orders.items_quantity")}</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder={t("orders.min")}
                        value={minQty}
                        onChange={(e) => setMinQty(e.target.value)}
                        className="w-full"
                      />
                      <Input
                        type="number"
                        placeholder={t("orders.max")}
                        value={maxQty}
                        onChange={(e) => setMaxQty(e.target.value)}
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* EFT Range */}
                  <div className="space-y-2">
                    <Label>{t("orders.eft_date")}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-full justify-start text-left font-normal">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {eftRange.from
                            ? eftRange.to
                              ? `${format(eftRange.from, "MMM d")} - ${format(eftRange.to, "MMM d")}`
                              : format(eftRange.from, "MMM d, yyyy")
                            : t("orders.pick_dates")}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="range"
                          selected={{ from: eftRange.from, to: eftRange.to }}
                          onSelect={(range) => setEftRange({ from: range?.from, to: range?.to })}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Priority */}
                  <div className="space-y-2">
                    <Label>{t("common.priority")}</Label>
                    <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder={t("orders.all_priorities")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("orders.all_priorities")}</SelectItem>
                        <SelectItem value="high">{t("priority.high")}</SelectItem>
                        <SelectItem value="normal">{t("priority.medium")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Table Content */}
          {["pending", "completed", "cancelled"].map((tab) => (
            <TabsContent key={tab} value={tab}>
              <Card>
                <CardHeader>
                  <CardTitle className="capitalize">
                    {t(`status.${tab === "pending" ? "pending" : tab}`)} {t("orders.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t("orders.order_number")}</TableHead>
                            <TableHead>{t("common.customer")}</TableHead>
                            {tab === "pending" && <TableHead>{t("common.status")}</TableHead>}
                            <TableHead>{t("common.units")}</TableHead>
                            <TableHead>{t("orders.eft")}</TableHead>
                            <TableHead>{t("table.created")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedOrders.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={tab === "pending" ? 6 : 5}
                                className="text-center text-muted-foreground"
                              >
                                {t("orders.no_orders")}
                              </TableCell>
                            </TableRow>
                          ) : (
                            paginatedOrders.map((order) => (
                              <TableRow
                                key={order.id}
                                className={cn(
                                  "cursor-pointer hover:bg-muted/50",
                                  order.priority === "high" && "bg-destructive/5",
                                )}
                                onClick={() => navigate(`/orders/${order.id}`)}
                              >
                                <TableCell className="font-medium">
                                  <div className="flex items-center gap-2">
                                    {order.priority === "high" && <AlertCircle className="h-4 w-4 text-destructive" />}
                                    <span className="text-primary hover:underline">{order.order_number}</span>
                                    {(order.extra_count || 0) > 0 && (
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Package className="h-4 w-4 text-orange-500" />
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            <p>
                                              {order.extra_count} {t("orders.items_to_extra")}
                                            </p>
                                          </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>{order.customer?.name || "-"}</TableCell>
                                {tab === "pending" && (
                                  <TableCell>
                                    <Badge variant={order.computed_status === "in_progress" ? "default" : "outline"}>
                                      {order.computed_status === "in_progress"
                                        ? t("status.in_progress")
                                        : t("status.pending")}
                                    </Badge>
                                  </TableCell>
                                )}
                                <TableCell>
                                  {order.computed_status === "completed"
                                    ? order.unit_count
                                    : `${order.shipped_count || 0}/${order.unit_count}`}
                                </TableCell>
                                <TableCell>
                                  {order.estimated_fulfillment_time
                                    ? format(new Date(order.estimated_fulfillment_time), "MMM d, yyyy")
                                    : "-"}
                                </TableCell>
                                <TableCell>{format(new Date(order.created_at), "MMM d, yyyy")}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                      <TablePagination
                        currentPage={currentPage}
                        totalItems={filteredCount}
                        pageSize={PAGE_SIZE}
                        onPageChange={setCurrentPage}
                      />
                    </>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
