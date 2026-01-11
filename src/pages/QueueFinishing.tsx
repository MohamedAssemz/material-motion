import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Sparkles } from 'lucide-react';
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
  ready_for_finishing_count: number;
  in_finishing_count: number;
}

export default function QueueFinishing() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('finishing-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => {
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
          order_batches!inner(current_state, quantity)
        `)
        .or('current_state.eq.ready_for_finishing,current_state.eq.in_finishing', { foreignTable: 'order_batches' });

      if (error) throw error;

      const ordersWithCounts = (data || []).map((order: any) => ({
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at,
        ready_for_finishing_count: order.order_batches
          .filter((b: any) => b.current_state === 'ready_for_finishing')
          .reduce((sum: number, b: any) => sum + b.quantity, 0),
        in_finishing_count: order.order_batches
          .filter((b: any) => b.current_state === 'in_finishing')
          .reduce((sum: number, b: any) => sum + b.quantity, 0),
      })).filter((order: Order) => 
        order.ready_for_finishing_count > 0 || order.in_finishing_count > 0
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
            <Sparkles className="h-8 w-8" />
            Finishing Queue
          </h1>
          <p className="text-muted-foreground">Orders awaiting finishing or in finishing</p>
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
              No orders in finishing queue
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Ready for Finishing</TableHead>
                  <TableHead>In Finishing</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>
                      {order.ready_for_finishing_count > 0 && (
                        <Badge className="bg-blue-300">{order.ready_for_finishing_count} items</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.in_finishing_count > 0 && (
                        <Badge className="bg-purple-500">{order.in_finishing_count} items</Badge>
                      )}
                    </TableCell>
                    <TableCell>{format(new Date(order.created_at), 'PPP')}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => navigate(`/orders/${order.id}/finishing`)}>
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