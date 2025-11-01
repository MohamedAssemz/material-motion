import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Box } from 'lucide-react';
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
  waiting_for_bm_count: number;
  boxing_count: number;
}

export default function QueueBoxing() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('boxing-queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, () => {
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
          units!inner(state)
        `)
        .or('state.eq.waiting_for_boxing_material,state.eq.boxing', { foreignTable: 'units' });

      if (error) throw error;

      const ordersWithCounts = (data || []).map((order: any) => ({
        id: order.id,
        order_number: order.order_number,
        created_at: order.created_at,
        waiting_for_bm_count: order.units.filter((u: any) => u.state === 'waiting_for_boxing_material').length,
        boxing_count: order.units.filter((u: any) => u.state === 'boxing').length,
      })).filter((order: Order) => 
        order.waiting_for_bm_count > 0 || order.boxing_count > 0
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
            <Box className="h-8 w-8" />
            Boxing Queue
          </h1>
          <p className="text-muted-foreground">Orders awaiting boxing materials or in boxing</p>
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
              No orders in boxing queue
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Waiting for Materials</TableHead>
                  <TableHead>In Boxing</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium">{order.order_number}</TableCell>
                    <TableCell>
                      {order.waiting_for_bm_count > 0 && (
                        <Badge className="bg-orange-500">{order.waiting_for_bm_count} units</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {order.boxing_count > 0 && (
                        <Badge className="bg-cyan-500">{order.boxing_count} units</Badge>
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
