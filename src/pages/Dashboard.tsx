import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NotificationBell } from '@/components/NotificationBell';
import { 
  Factory, 
  Package, 
  Box, 
  ClipboardCheck, 
  TrendingUp, 
  Users, 
  LogOut,
  Plus,
  AlertCircle
} from 'lucide-react';
import { Link } from 'react-router-dom';

interface Stats {
  totalOrders: number;
  waitingForRM: number;
  inManufacturing: number;
  inPackaging: number;
  inBoxing: number;
  finished: number;
}

interface QueueCounts {
  manufacturing: { waiting: number; inProgress: number };
  packaging: { waiting: number; inProgress: number };
  boxing: { waiting: number; inProgress: number };
}

export default function Dashboard() {
  const { user, userRoles, signOut } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    waitingForRM: 0,
    inManufacturing: 0,
    inPackaging: 0,
    inBoxing: 0,
    finished: 0,
  });
  const [queueCounts, setQueueCounts] = useState<QueueCounts>({
    manufacturing: { waiting: 0, inProgress: 0 },
    packaging: { waiting: 0, inProgress: 0 },
    boxing: { waiting: 0, inProgress: 0 },
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();

    // Subscribe to realtime updates
    const ordersChannel = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchStats();
      })
      .subscribe();

    const unitsChannel = supabase
      .channel('dashboard-units')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(unitsChannel);
    };
  }, []);

  const fetchStats = async () => {
    try {
      const [ordersRes, unitsRes] = await Promise.all([
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        supabase.from('units').select('state'),
      ]);

      const unitsByState = unitsRes.data?.reduce((acc, unit) => {
        acc[unit.state] = (acc[unit.state] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      setStats({
        totalOrders: ordersRes.count || 0,
        waitingForRM: unitsByState.waiting_for_rm || 0,
        inManufacturing: unitsByState.in_manufacturing || 0,
        inPackaging: unitsByState.in_packaging || 0,
        inBoxing: unitsByState.in_boxing || 0,
        finished: unitsByState.finished || 0,
      });

      setQueueCounts({
        manufacturing: {
          waiting: unitsByState.waiting_for_rm || 0,
          inProgress: unitsByState.in_manufacturing || 0,
        },
        packaging: {
          waiting: unitsByState.waiting_for_packaging_material || 0,
          inProgress: unitsByState.in_packaging || 0,
        },
        boxing: {
          waiting: unitsByState.waiting_for_boxing_material || 0,
          inProgress: unitsByState.in_boxing || 0,
        },
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const roleDisplayNames: Record<string, string> = {
    manufacture_lead: 'Manufacturing Lead',
    manufacturer: 'Manufacturer',
    packaging_manager: 'Packaging Manager',
    packer: 'Packer',
    boxing_manager: 'Boxing Manager',
    boxer: 'Boxer',
    qc: 'Quality Control',
    admin: 'Administrator',
    viewer: 'Viewer',
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Factory className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Manufacturing Fulfillment</h1>
              <p className="text-sm text-muted-foreground">Production Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <NotificationBell />
            <div className="text-right">
              <p className="text-sm font-medium">{user?.email}</p>
              <div className="flex gap-1 justify-end mt-1">
                {userRoles.map((role) => (
                  <Badge key={role} variant="secondary" className="text-xs">
                    {roleDisplayNames[role] || role}
                  </Badge>
                ))}
              </div>
            </div>
            <Button variant="outline" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        {/* Quick Actions */}
        {userRoles.includes('manufacture_lead') || userRoles.includes('admin') ? (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5" />
                Quick Actions
              </CardTitle>
              <CardDescription>Create and manage orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button asChild>
                  <Link to="/orders/create">
                    <Plus className="mr-2 h-4 w-4" />
                    Create New Order
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/orders">View All Orders</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Stats Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <p className="text-xs text-muted-foreground">Active production orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Waiting for RM</CardTitle>
              <AlertCircle className="h-4 w-4 text-attention" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-attention">{stats.waitingForRM}</div>
              <p className="text-xs text-muted-foreground">Units awaiting materials</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Manufacturing</CardTitle>
              <Factory className="h-4 w-4 text-in-progress" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-in-progress">{stats.inManufacturing}</div>
              <p className="text-xs text-muted-foreground">Units in production</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Packaging</CardTitle>
              <Package className="h-4 w-4 text-in-progress" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-in-progress">{stats.inPackaging}</div>
              <p className="text-xs text-muted-foreground">Units being packaged</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Boxing</CardTitle>
              <Box className="h-4 w-4 text-in-progress" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-in-progress">{stats.inBoxing}</div>
              <p className="text-xs text-muted-foreground">Units being boxed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Finished</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-completed" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-completed">{stats.finished}</div>
              <p className="text-xs text-muted-foreground">Completed units</p>
            </CardContent>
          </Card>
        </div>

        {/* Role-specific sections */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>My Queues</CardTitle>
              <CardDescription>Work items assigned to your role</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(userRoles.includes('manufacturer') || userRoles.includes('manufacture_lead')) && (
                  <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
                    <CardContent className="p-4">
                      <Link to="/queues/manufacturing" className="block">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Factory className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            <span className="font-semibold">Manufacturing Queue</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-background/80 p-2 rounded">
                            <p className="text-muted-foreground">Waiting for RM</p>
                            <p className="text-xl font-bold text-yellow-600">{queueCounts.manufacturing.waiting}</p>
                          </div>
                          <div className="bg-background/80 p-2 rounded">
                            <p className="text-muted-foreground">In Progress</p>
                            <p className="text-xl font-bold text-blue-600">{queueCounts.manufacturing.inProgress}</p>
                          </div>
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                )}
                {(userRoles.includes('packer') || userRoles.includes('packaging_manager')) && (
                  <Card className="border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/20">
                    <CardContent className="p-4">
                      <Link to="/queues/packaging" className="block">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                            <span className="font-semibold">Packaging Queue</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-background/80 p-2 rounded">
                            <p className="text-muted-foreground">Waiting for PM</p>
                            <p className="text-xl font-bold text-orange-600">{queueCounts.packaging.waiting}</p>
                          </div>
                          <div className="bg-background/80 p-2 rounded">
                            <p className="text-muted-foreground">In Progress</p>
                            <p className="text-xl font-bold text-indigo-600">{queueCounts.packaging.inProgress}</p>
                          </div>
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                )}
                {(userRoles.includes('boxer') || userRoles.includes('boxing_manager')) && (
                  <Card className="border-cyan-200 bg-cyan-50/50 dark:border-cyan-800 dark:bg-cyan-950/20">
                    <CardContent className="p-4">
                      <Link to="/queues/boxing" className="block">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Box className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                            <span className="font-semibold">Boxing Queue</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="bg-background/80 p-2 rounded">
                            <p className="text-muted-foreground">Waiting for BM</p>
                            <p className="text-xl font-bold text-orange-600">{queueCounts.boxing.waiting}</p>
                          </div>
                          <div className="bg-background/80 p-2 rounded">
                            <p className="text-muted-foreground">In Progress</p>
                            <p className="text-xl font-bold text-cyan-600">{queueCounts.boxing.inProgress}</p>
                          </div>
                        </div>
                      </Link>
                    </CardContent>
                  </Card>
                )}
              </div>
            </CardContent>
          </Card>

          {(userRoles.includes('admin') || userRoles.includes('manufacture_lead')) && (
            <Card>
              <CardHeader>
                <CardTitle>Management</CardTitle>
                <CardDescription>Administrative functions</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/products">
                    <Package className="mr-2 h-4 w-4" />
                    Manage Products
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/extra-products">
                    <Package className="mr-2 h-4 w-4" />
                    Extra Products Inventory
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/customers">
                    <Users className="mr-2 h-4 w-4" />
                    Manage Customers
                  </Link>
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link to="/batch">
                    <ClipboardCheck className="mr-2 h-4 w-4" />
                    Batch Lookup
                  </Link>
                </Button>
                {userRoles.includes('admin') && (
                  <>
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link to="/users">
                        <Users className="mr-2 h-4 w-4" />
                        Manage Users & Roles
                      </Link>
                    </Button>
                    <Button variant="outline" className="w-full justify-start" asChild>
                      <Link to="/machines">
                        <Factory className="mr-2 h-4 w-4" />
                        Manage Machines
                      </Link>
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
