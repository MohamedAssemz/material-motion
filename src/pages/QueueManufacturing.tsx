import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Factory, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
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
  manufacturing_count: number;
  extra_manufacturing_count: number;
}

export default function QueueManufacturing() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      // Fetch orders with order_batches in active manufacturing state only (not pending_rm)
      const { data: orderBatchesData, error: batchError } = await supabase
        .from('order_batches')
        .select('order_id, current_state, quantity')
        .eq('current_state', 'in_manufacturing')
        .eq('is_terminated', false);

      if (batchError) throw batchError;

      // Fetch orders with reserved extra_batches in extra_manufacturing state
      const { data: extraBatchesData, error: extraError } = await supabase
        .from('extra_batches')
        .select('order_id, current_state, quantity')
        .eq('current_state', 'extra_manufacturing')
        .eq('inventory_state', 'RESERVED')
        .not('order_id', 'is', null);

      if (extraError) throw extraError;

      // Combine order IDs from both sources
      const orderBatchOrderIds = orderBatchesData?.map(b => b.order_id).filter(Boolean) || [];
      const extraBatchOrderIds = extraBatchesData?.map(b => b.order_id).filter(Boolean) || [];
      const allOrderIds = [...new Set([...orderBatchOrderIds, ...extraBatchOrderIds])];

      if (allOrderIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Fetch order details - only orders that are in_progress (started)
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, created_at')
        .in('id', allOrderIds)
        .eq('status', 'in_progress');

      if (ordersError) throw ordersError;

      const ordersWithCounts = (ordersData || []).map((order: any) => {
        const orderBatches = orderBatchesData?.filter(b => b.order_id === order.id) || [];
        const extraBatches = extraBatchesData?.filter(b => b.order_id === order.id) || [];

        return {
          id: order.id,
          order_number: order.order_number,
          created_at: order.created_at,
          waiting_for_rm_count: 0, // No longer shown in queue
          manufacturing_count: orderBatches
            .filter((b: any) => b.current_state === 'in_manufacturing')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          extra_manufacturing_count: extraBatches
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
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

      <Card>
        <CardHeader>
          <CardTitle>Active Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders in manufacturing queue
            </div>
          ) : (
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
                {orders.map((order) => (
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
