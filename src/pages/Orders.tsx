import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Plus, Search, Eye, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Order {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  profiles?: {
    full_name: string | null;
    email: string | null;
  };
  unit_count?: number;
}

export default function Orders() {
  const { hasRole } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('orders-list')
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
      // First get orders
      const { data: ordersData, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get creator profiles separately
      const orderIds = ordersData?.map(o => o.created_by).filter(Boolean) || [];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', orderIds);

      const profilesMap = new Map(profilesData?.map(p => [p.id, p]) || []);

      // Get unit counts for each order
      const ordersWithCounts = await Promise.all(
        (ordersData || []).map(async (order) => {
          const { count } = await supabase
            .from('units')
            .select('*', { count: 'exact', head: true })
            .eq('order_id', order.id);

          return {
            ...order,
            profiles: order.created_by ? profilesMap.get(order.created_by) : null,
            unit_count: count || 0,
          };
        })
      );

      setOrders(ordersWithCounts);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter((order) =>
    order.order_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.status.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Orders</h1>
                <p className="text-sm text-muted-foreground">
                  View and manage production orders
                </p>
              </div>
            </div>
            {(hasRole('manufacture_lead') || hasRole('admin')) && (
              <Button asChild>
                <Link to="/orders/create">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Order
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All Orders</CardTitle>
              <div className="relative w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search orders..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Number</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Units</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground">
                        No orders found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
                      <TableRow key={order.id} className={order.priority === 'high' ? 'bg-destructive/5' : ''}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {order.priority === 'high' && (
                              <AlertCircle className="h-4 w-4 text-destructive" />
                            )}
                            {order.order_number}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={order.priority === 'high' ? 'destructive' : 'secondary'}>
                            {order.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{order.status}</Badge>
                        </TableCell>
                        <TableCell>{order.unit_count}</TableCell>
                        <TableCell>
                          {order.profiles?.full_name || order.profiles?.email || 'Unknown'}
                        </TableCell>
                        <TableCell>
                          {formatDistanceToNow(new Date(order.created_at), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/orders/${order.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              View
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
