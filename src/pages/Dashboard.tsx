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
  inQC: number;
  finished: number;
}

export default function Dashboard() {
  const { user, userRoles, signOut } = useAuth();
  const [stats, setStats] = useState<Stats>({
    totalOrders: 0,
    waitingForRM: 0,
    inManufacturing: 0,
    inPackaging: 0,
    inBoxing: 0,
    inQC: 0,
    finished: 0,
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
        inManufacturing: (unitsByState.in_manufacturing || 0) + (unitsByState.manufactured || 0),
        inPackaging: (unitsByState.in_packaging || 0) + (unitsByState.packaged || 0) + (unitsByState.waiting_for_pm || 0),
        inBoxing: (unitsByState.in_boxing || 0) + (unitsByState.boxed || 0) + (unitsByState.waiting_for_bm || 0),
        inQC: unitsByState.qced || 0,
        finished: unitsByState.finished || 0,
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
              <CardTitle className="text-sm font-medium">Quality Control</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-in-progress" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-in-progress">{stats.inQC}</div>
              <p className="text-xs text-muted-foreground">Units in QC</p>
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
              <div className="space-y-2">
                {(userRoles.includes('manufacturer') || userRoles.includes('manufacture_lead')) && (
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link to="/queues/manufacturing">
                      <Factory className="mr-2 h-4 w-4" />
                      Manufacturing Queue ({stats.inManufacturing})
                    </Link>
                  </Button>
                )}
                {(userRoles.includes('packer') || userRoles.includes('packaging_manager')) && (
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link to="/queues/packaging">
                      <Package className="mr-2 h-4 w-4" />
                      Packaging Queue ({stats.inPackaging})
                    </Link>
                  </Button>
                )}
                {(userRoles.includes('boxer') || userRoles.includes('boxing_manager')) && (
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link to="/queues/boxing">
                      <Box className="mr-2 h-4 w-4" />
                      Boxing Queue ({stats.inBoxing})
                    </Link>
                  </Button>
                )}
                {userRoles.includes('qc') && (
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link to="/queues/qc">
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      QC Queue ({stats.inQC})
                    </Link>
                  </Button>
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
                {userRoles.includes('admin') && (
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link to="/users">
                      <Users className="mr-2 h-4 w-4" />
                      Manage Users & Roles
                    </Link>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
