import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Users, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface Customer {
  id: string;
  name: string;
  code: string | null;
  country: string | null;
  is_domestic: boolean;
  created_at: string;
}

export default function Customers() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newCustomer, setNewCustomer] = useState({ 
    name: '', 
    code: '', 
    country: '', 
    is_domestic: false 
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasRole('manufacture_lead') && !hasRole('admin')) {
      navigate('/');
      return;
    }
    fetchCustomers();
  }, [hasRole, navigate]);

  const fetchCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('customers')
        .insert({
          name: newCustomer.name.trim(),
          code: newCustomer.code.trim() || null,
          country: newCustomer.country.trim() || null,
          is_domestic: newCustomer.is_domestic,
        });

      if (error) throw error;

      toast.success('Customer added successfully');
      setDialogOpen(false);
      setNewCustomer({ name: '', code: '', country: '', is_domestic: false });
      fetchCustomers();
    } catch (error: any) {
      console.error('Error adding customer:', error);
      if (error.code === '23505') {
        toast.error('Customer code already exists');
      } else {
        toast.error('Failed to add customer');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.country?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Users className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Customers</h1>
              <p className="text-sm text-muted-foreground">Manage customer records</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Customer Name *</Label>
                  <Input
                    id="name"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., ABC Medical"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Customer Code</Label>
                  <Input
                    id="code"
                    value={newCustomer.code}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, code: e.target.value }))}
                    placeholder="e.g., ABC-001"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={newCustomer.country}
                    onChange={(e) => setNewCustomer(prev => ({ ...prev, country: e.target.value }))}
                    placeholder="e.g., Egypt"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="domestic"
                    checked={newCustomer.is_domestic}
                    onCheckedChange={(checked) => setNewCustomer(prev => ({ ...prev, is_domestic: checked }))}
                  />
                  <Label htmlFor="domestic">Domestic Customer (Egypt)</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddCustomer} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Customer'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search customers..."
            className="pl-10"
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Customers ({filteredCustomers.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredCustomers.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                {customers.length === 0 ? 'No customers yet. Add your first customer.' : 'No matching customers found.'}
              </p>
            ) : (
              <div className="space-y-3">
                {filteredCustomers.map(customer => (
                  <div key={customer.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{customer.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {customer.code && (
                          <span className="text-sm text-muted-foreground font-mono">{customer.code}</span>
                        )}
                        {customer.country && (
                          <span className="text-sm text-muted-foreground">• {customer.country}</span>
                        )}
                      </div>
                    </div>
                    <Badge variant={customer.is_domestic ? 'secondary' : 'outline'}>
                      {customer.is_domestic ? 'Domestic' : 'International'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}