import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Package } from 'lucide-react';
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
  waiting_for_pm_count: number;
  packaging_count: number;
}

export default function QueuePackaging() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('packaging-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'batches' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_number,
          created_at,
          batches!inner(current_state, quantity)
        `)
        .or('current_state.eq.waiting_for_pm,current_state.eq.in_packaging', { foreignTable: 'batches' });

      if (error) throw error;

      const ordersWithCounts = (data || []).map((order: any) => ({
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at,
        waiting_for_pm_count: order.batches
          .filter((b: any) => b.current_state === 'waiting_for_pm')
          .reduce((sum: number, b: any) => sum + b.quantity, 0),
        packaging_count: order.batches
          .filter((b: any) => b.current_state === 'in_packaging')
          .reduce((sum: number, b: any) => sum + b.quantity, 0),
      })).filter((order: Order) => 
        order.waiting_for_pm_count > 0 || order.packaging_count > 0
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
            <Package className="h-8 w-8" />
            Packaging Queue
          </h1>
          <p className="text-muted-foreground">Orders awaiting packaging materials or in packaging</p>
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
              No orders in packaging queue
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Waiting for Materials</TableHead>
                  <TableHead>In Packaging</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>
                      {order.waiting_for_pm_count > 0 && (
                        <Badge className="bg-orange-500">{order.waiting_for_pm_count} items</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.packaging_count > 0 && (
                        <Badge className="bg-indigo-500">{order.packaging_count} items</Badge>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(order.created_at), 'PPP')}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => navigate(`/orders/${order.id}`)}>
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