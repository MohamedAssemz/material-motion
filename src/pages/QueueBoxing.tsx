import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Box, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { format } from 'date-fns';

interface Order {
  id: string;
  order_number: string;
  created_at: string;
  status: string;
  ready_for_boxing_count: number;
  boxing_count: number;
  ready_for_shipment_count: number;
  shipped_count: number;
  extra_boxing_count: number;
  total_units: number;
}

type StatusFilter = 'all' | 'ready_for_boxing' | 'in_boxing' | 'ready_for_shipment' | 'shipped' | 'extra';
type TabStatus = 'active' | 'completed';

export default function QueueBoxing() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [activeTab, setActiveTab] = useState<TabStatus>('active');

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('boxing-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_batches' }, () => {
        fetchOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      // Get all order_batches
      const { data: batchesData, error: batchError } = await supabase
        .from('order_batches')
        .select('order_id, current_state, quantity')
        .eq('is_terminated', false);

      if (batchError) throw batchError;

      // Fetch extra_batches in boxing state (reserved)
      const { data: extraBatchesData, error: extraError } = await supabase
        .from('extra_batches')
        .select('order_id, current_state, quantity')
        .eq('current_state', 'extra_boxing')
        .eq('inventory_state', 'RESERVED')
        .not('order_id', 'is', null);

      if (extraError) throw extraError;

      // Get unique order IDs that have boxing-related batches (for active orders)
      // OR any batches at all (for completed orders that went through this phase)
      const activeBoxingOrderIds = new Set<string>();
      const allOrderIds = new Set<string>();
      
      batchesData?.forEach(b => {
        if (b.order_id) {
          allOrderIds.add(b.order_id);
          if (['ready_for_boxing', 'in_boxing', 'ready_for_shipment', 'shipped'].includes(b.current_state)) {
            activeBoxingOrderIds.add(b.order_id);
          }
        }
      });
      extraBatchesData?.forEach(b => {
        if (b.order_id) {
          activeBoxingOrderIds.add(b.order_id);
          allOrderIds.add(b.order_id);
        }
      });
      
      if (allOrderIds.size === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Get order details for all orders that have batches
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, created_at, status')
        .in('id', Array.from(allOrderIds));

      if (ordersError) throw ordersError;

      // Fetch order items to get total units
      const { data: orderItemsData } = await supabase
        .from('order_items')
        .select('order_id, quantity')
        .in('order_id', Array.from(allOrderIds));

      const orderUnitCounts = new Map<string, number>();
      orderItemsData?.forEach(item => {
        orderUnitCounts.set(
          item.order_id,
          (orderUnitCounts.get(item.order_id) || 0) + item.quantity
        );
      });

      // Get shipment counts per order
      const { data: shipmentsData } = await supabase
        .from('shipments')
        .select('order_id')
        .in('order_id', Array.from(allOrderIds));

      const shipmentCounts = new Map<string, number>();
      (shipmentsData || []).forEach((s: any) => {
        shipmentCounts.set(s.order_id, (shipmentCounts.get(s.order_id) || 0) + 1);
      });

      const ordersWithCounts = (ordersData || []).map((order: any) => {
        const orderBatches = batchesData?.filter(b => b.order_id === order.id) || [];
        const extraBatches = extraBatchesData?.filter(b => b.order_id === order.id) || [];

        const shippedCount = orderBatches
          .filter((b: any) => b.current_state === 'shipped')
          .reduce((sum: number, b: any) => sum + b.quantity, 0);

        const totalUnits = orderUnitCounts.get(order.id) || 0;
        const isCompleted = order.status === 'completed' || (totalUnits > 0 && shippedCount >= totalUnits);

        return {
          id: order.id,
          order_number: order.order_number,
          created_at: order.created_at,
          status: order.status,
          ready_for_boxing_count: orderBatches
            .filter((b: any) => b.current_state === 'ready_for_boxing')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          boxing_count: orderBatches
            .filter((b: any) => b.current_state === 'in_boxing')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          ready_for_shipment_count: orderBatches
            .filter((b: any) => b.current_state === 'ready_for_shipment')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          shipped_count: shippedCount,
          extra_boxing_count: extraBatches
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          total_units: totalUnits,
          _isCompleted: isCompleted,
          _hasActiveBoxing: activeBoxingOrderIds.has(order.id),
        };
      }).filter((order: any) => 
        // Include if has active boxing items OR is completed
        order._hasActiveBoxing || order._isCompleted
      );

      setOrders(ordersWithCounts);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const isOrderCompleted = (order: Order) => {
    return order.status === 'completed' || 
           (order.total_units > 0 && order.shipped_count >= order.total_units);
  };

  const activeOrders = useMemo(() => 
    orders.filter(o => !isOrderCompleted(o) && o.status === 'in_progress'), 
    [orders]
  );

  const completedOrders = useMemo(() => 
    orders.filter(o => isOrderCompleted(o)), 
    [orders]
  );

  const applyStatusFilter = (ordersList: Order[]) => {
    if (statusFilter === 'all') {
      return ordersList;
    }

    return ordersList.filter(order => {
      switch (statusFilter) {
        case 'ready_for_boxing':
          return order.ready_for_boxing_count > 0;
        case 'in_boxing':
          return order.boxing_count > 0;
        case 'ready_for_shipment':
          return order.ready_for_shipment_count > 0;
        case 'shipped':
          return order.shipped_count > 0;
        case 'extra':
          return order.extra_boxing_count > 0;
        default:
          return true;
      }
    });
  };

  const filteredActiveOrders = useMemo(() => 
    applyStatusFilter(activeOrders), 
    [activeOrders, statusFilter]
  );

  const filteredCompletedOrders = useMemo(() => 
    applyStatusFilter(completedOrders), 
    [completedOrders, statusFilter]
  );

  const renderTable = (ordersList: Order[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order Number</TableHead>
          <TableHead>Ready for Boxing</TableHead>
          <TableHead>In Boxing</TableHead>
          <TableHead>Extra Items</TableHead>
          <TableHead>Ready for Shipment</TableHead>
          <TableHead>Shipped</TableHead>
          <TableHead>Created Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordersList.map((order) => (
          <TableRow 
            key={order.id}
            className="cursor-pointer hover:bg-muted/50"
            onClick={() => navigate(`/orders/${order.id}/boxing`)}
          >
            <TableCell className="font-medium">{order.order_number}</TableCell>
            <TableCell>
              {order.ready_for_boxing_count > 0 && (
                <Badge className="bg-orange-500">{order.ready_for_boxing_count} items</Badge>
              )}
            </TableCell>
            <TableCell>
              {order.boxing_count > 0 && (
                <Badge className="bg-cyan-500">{order.boxing_count} items</Badge>
              )}
            </TableCell>
            <TableCell>
              {order.extra_boxing_count > 0 && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  <Package className="h-3 w-3 mr-1" />
                  {order.extra_boxing_count} extra
                </Badge>
              )}
            </TableCell>
            <TableCell>
              {order.ready_for_shipment_count > 0 && (
                <Badge className="bg-green-500">{order.ready_for_shipment_count} items</Badge>
              )}
            </TableCell>
            <TableCell>
              {order.shipped_count > 0 && (
                <Badge variant="secondary">{order.shipped_count} items</Badge>
              )}
            </TableCell>
            <TableCell>{format(new Date(order.created_at), 'PPP')}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Box className="h-8 w-8" />
          Boxing Queue
        </h1>
        <p className="text-muted-foreground">Orders awaiting boxing materials or in boxing</p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)} className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="active" className="gap-2">
              Active
              <Badge variant="secondary" className="ml-1">{activeOrders.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="completed" className="gap-2">
              Completed
              <Badge variant="secondary" className="ml-1">{completedOrders.length}</Badge>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Status:</Label>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="ready_for_boxing">Ready for Boxing</SelectItem>
                <SelectItem value="in_boxing">In Boxing</SelectItem>
                <SelectItem value="ready_for_shipment">Ready for Shipment</SelectItem>
                <SelectItem value="shipped">Has Shipped Items</SelectItem>
                <SelectItem value="extra">Has Extra Items</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="active">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredActiveOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active orders in boxing queue
                </div>
              ) : (
                renderTable(filteredActiveOrders)
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="completed">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : filteredCompletedOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No completed orders with boxing history
                </div>
              ) : (
                renderTable(filteredCompletedOrders)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
