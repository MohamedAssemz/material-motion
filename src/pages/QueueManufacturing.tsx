import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Factory, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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
  manufacturing_count: number;
  extra_manufacturing_count: number;
  total_units: number;
  shipped_count: number;
}

type TabStatus = 'active' | 'completed';

export default function QueueManufacturing() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabStatus>('active');

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('manufacturing-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => {
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
      // Fetch all order_batches in manufacturing-related states
      const { data: orderBatchesData, error: batchError } = await supabase
        .from('order_batches')
        .select('order_id, current_state, quantity')
        .eq('is_terminated', false);

      if (batchError) throw batchError;

      // Fetch all extra_batches in manufacturing state (reserved)
      const { data: extraBatchesData, error: extraError } = await supabase
        .from('extra_batches')
        .select('order_id, current_state, quantity')
        .eq('current_state', 'extra_manufacturing')
        .eq('inventory_state', 'RESERVED')
        .not('order_id', 'is', null);

      if (extraError) throw extraError;

      // Get unique order IDs that have manufacturing-related batches
      const manufacturingOrderIds = new Set<string>();
      orderBatchesData?.forEach(b => {
        if (b.current_state === 'in_manufacturing' && b.order_id) {
          manufacturingOrderIds.add(b.order_id);
        }
      });
      extraBatchesData?.forEach(b => {
        if (b.order_id) {
          manufacturingOrderIds.add(b.order_id);
        }
      });

      if (manufacturingOrderIds.size === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Fetch order details
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, created_at, status')
        .in('id', Array.from(manufacturingOrderIds));

      if (ordersError) throw ordersError;

      // Fetch order items to get total units
      const { data: orderItemsData } = await supabase
        .from('order_items')
        .select('order_id, quantity')
        .in('order_id', Array.from(manufacturingOrderIds));

      const orderUnitCounts = new Map<string, number>();
      orderItemsData?.forEach(item => {
        orderUnitCounts.set(
          item.order_id,
          (orderUnitCounts.get(item.order_id) || 0) + item.quantity
        );
      });

      const ordersWithCounts = (ordersData || []).map((order: any) => {
        const orderBatches = orderBatchesData?.filter(b => b.order_id === order.id) || [];
        const extraBatches = extraBatchesData?.filter(b => b.order_id === order.id) || [];

        const shippedCount = orderBatches
          .filter((b: any) => b.current_state === 'shipped')
          .reduce((sum: number, b: any) => sum + b.quantity, 0);

        const totalUnits = orderUnitCounts.get(order.id) || 0;

        return {
          id: order.id,
          order_number: order.order_number,
          created_at: order.created_at,
          status: order.status,
          manufacturing_count: orderBatches
            .filter((b: any) => b.current_state === 'in_manufacturing')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          extra_manufacturing_count: extraBatches
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          total_units: totalUnits,
          shipped_count: shippedCount,
        };
      }).filter((order: Order) => 
        order.manufacturing_count > 0 || 
        order.extra_manufacturing_count > 0
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

  const displayedOrders = activeTab === 'active' ? activeOrders : completedOrders;

  const renderTable = (ordersList: Order[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Order Number</TableHead>
          <TableHead>In Manufacturing</TableHead>
          <TableHead>Extra Items</TableHead>
          <TableHead>Created Date</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordersList.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-medium">{order.order_number}</TableCell>
            <TableCell>
              {order.manufacturing_count > 0 && (
                <Badge className="bg-blue-500">{order.manufacturing_count} items</Badge>
              )}
            </TableCell>
            <TableCell>
              {order.extra_manufacturing_count > 0 && (
                <Badge variant="outline" className="border-amber-500 text-amber-600">
                  <Package className="h-3 w-3 mr-1" />
                  {order.extra_manufacturing_count} extra
                </Badge>
              )}
            </TableCell>
            <TableCell>{format(new Date(order.created_at), 'PPP')}</TableCell>
            <TableCell>
              <Button size="sm" onClick={() => navigate(`/orders/${order.id}/manufacturing`)}>
                View Details
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Factory className="h-8 w-8" />
            Manufacturing Queue
          </h1>
          <p className="text-muted-foreground">Orders awaiting raw materials or in manufacturing</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabStatus)} className="space-y-4">
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

        <TabsContent value="active">
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : activeOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active orders in manufacturing queue
                </div>
              ) : (
                renderTable(activeOrders)
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
              ) : completedOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No completed orders with manufacturing history
                </div>
              ) : (
                renderTable(completedOrders)
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
