import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Truck, Package } from 'lucide-react';
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

interface OrderWithShipments {
  id: string;
  order_number: string;
  created_at: string;
  customer_name: string | null;
  shipment_count: number;
  total_items: number;
}

export default function Shipments() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderWithShipments[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('shipments-queue')
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
      // Get all orders that have at least one shipment
      const { data: shipments, error } = await supabase
        .from('shipments')
        .select(`
          id,
          order_id,
          orders!inner(id, order_number, created_at, customer:customers(name)),
          shipment_items(quantity)
        `);

      if (error) throw error;

      // Group by order
      const orderMap = new Map<string, OrderWithShipments>();
      
      shipments?.forEach((shipment: any) => {
        const orderId = shipment.order_id;
        if (!orderMap.has(orderId)) {
          orderMap.set(orderId, {
            id: orderId,
            order_number: shipment.orders?.order_number || 'Unknown',
            created_at: shipment.orders?.created_at || '',
            customer_name: shipment.orders?.customer?.name || null,
            shipment_count: 0,
            total_items: 0,
          });
        }
        const order = orderMap.get(orderId)!;
        order.shipment_count += 1;
        order.total_items += shipment.shipment_items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0;
      });

      setOrders(Array.from(orderMap.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ));
    } catch (error) {
      console.error('Error fetching orders with shipments:', error);
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
            <Truck className="h-8 w-8" />
            Shipments
          </h1>
          <p className="text-muted-foreground">Orders with kartonas (shipments)</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Orders with Shipments
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No shipments created yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order Number</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Kartonas</TableHead>
                  <TableHead>Total Items Shipped</TableHead>
                  <TableHead>Created Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell className="font-medium font-mono">{order.order_number}</TableCell>
                    <TableCell>{order.customer_name || 'N/A'}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {order.shipment_count} kartona{order.shipment_count !== 1 ? 's' : ''}
                      </Badge>
                    </TableCell>
                    <TableCell>{order.total_items} items</TableCell>
                    <TableCell>{order.created_at ? format(new Date(order.created_at), 'PPP') : 'N/A'}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => navigate(`/orders/${order.id}/shipments`)}>
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
