import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Box } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  ready_for_boxing_count: number;
  boxing_count: number;
  ready_for_receiving_count: number;
  shipped_count: number;
}

type StatusFilter = 'all' | 'ready_for_boxing' | 'in_boxing' | 'ready_for_receiving' | 'shipped';

export default function QueueBoxing() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      // Get orders with boxing-related batches
      const { data: batchesData, error: batchError } = await supabase
        .from('order_batches')
        .select('order_id, current_state, quantity')
        .in('current_state', ['ready_for_boxing', 'in_boxing', 'ready_for_receiving', 'received'])
        .eq('is_terminated', false);

      if (batchError) throw batchError;

      // Get unique order IDs
      const orderIds = [...new Set(batchesData?.map(b => b.order_id).filter(Boolean) || [])];
      
      if (orderIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Get order details
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, order_number, created_at')
        .in('id', orderIds);

      if (ordersError) throw ordersError;

      // Get shipment counts per order
      const { data: shipmentsData } = await supabase
        .from('shipments')
        .select('order_id')
        .in('order_id', orderIds);

      const shipmentCounts = new Map<string, number>();
      (shipmentsData || []).forEach((s: any) => {
        shipmentCounts.set(s.order_id, (shipmentCounts.get(s.order_id) || 0) + 1);
      });

      const ordersWithCounts = (ordersData || []).map((order: any) => {
        const orderBatches = batchesData?.filter(b => b.order_id === order.id) || [];
        return {
          id: order.id,
          order_number: order.order_number,
          created_at: order.created_at,
          ready_for_boxing_count: orderBatches
            .filter((b: any) => b.current_state === 'ready_for_boxing')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          boxing_count: orderBatches
            .filter((b: any) => b.current_state === 'in_boxing')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          ready_for_receiving_count: orderBatches
            .filter((b: any) => b.current_state === 'ready_for_receiving')
            .reduce((sum: number, b: any) => sum + b.quantity, 0),
          shipped_count: shipmentCounts.get(order.id) || 0,
        };
      });

      setOrders(ordersWithCounts);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') {
      return orders.filter(o => 
        o.ready_for_boxing_count > 0 || 
        o.boxing_count > 0 || 
        o.ready_for_receiving_count > 0 ||
        o.shipped_count > 0
      );
    }

    return orders.filter(order => {
      switch (statusFilter) {
        case 'ready_for_boxing':
          return order.ready_for_boxing_count > 0;
        case 'in_boxing':
          return order.boxing_count > 0;
        case 'ready_for_receiving':
          return order.ready_for_receiving_count > 0;
        case 'shipped':
          return order.shipped_count > 0;
        default:
          return true;
      }
    });
  }, [orders, statusFilter]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Box className="h-8 w-8" />
            Boxing Queue
          </h1>
          <p className="text-muted-foreground">Orders awaiting boxing materials or in boxing</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Active Orders</CardTitle>
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
                  <SelectItem value="ready_for_receiving">Ready for Shipment</SelectItem>
                  <SelectItem value="shipped">Has Shipments</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No orders in boxing queue
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Ready for Boxing</TableHead>
                  <TableHead>In Boxing</TableHead>
                  <TableHead>Ready for Shipment</TableHead>
                  <TableHead>Shipments</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => (
                  <TableRow key={order.id}>
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
                      {order.ready_for_receiving_count > 0 && (
                        <Badge className="bg-green-500">{order.ready_for_receiving_count} items</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.shipped_count > 0 && (
                        <Badge variant="secondary">{order.shipped_count}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(order.created_at), 'PPP')}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => navigate(`/orders/${order.id}/boxing`)}>
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