import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CountrySelect } from '@/components/catalog/CountrySelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ArrowLeft, Plus, Users, Loader2, Search, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { getCountryByCode } from '@/lib/countries';

interface Customer {
  id: string;
  name: string;
  code: string | null;
  country: string | null;
  is_domestic: boolean;
  created_at: string;
}

interface CustomerForm {
  name: string;
  code: string;
  country: string;
  is_domestic: boolean;
}

const emptyForm: CustomerForm = { name: '', code: '', country: '', is_domestic: false };

export default function Customers() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchCustomers();
  }, []);

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

  const openCreateDialog = () => {
    setEditingCustomer(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      code: customer.code || '',
      country: customer.country || '',
      is_domestic: customer.is_domestic,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Customer name is required');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        country: form.country.trim() || null,
        is_domestic: form.is_domestic,
      };

      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update(payload)
          .eq('id', editingCustomer.id);
        if (error) throw error;
        toast.success('Customer updated successfully');
      } else {
        const { error } = await supabase
          .from('customers')
          .insert(payload);
        if (error) throw error;
        toast.success('Customer added successfully');
      }

      setDialogOpen(false);
      setForm(emptyForm);
      setEditingCustomer(null);
      fetchCustomers();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      if (error.code === '23505') {
        toast.error('Customer code already exists');
      } else {
        toast.error('Failed to save customer');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteCustomer) return;
    try {
      const { error } = await supabase
        .from('customers')
        .delete()
        .eq('id', deleteCustomer.id);
      if (error) throw error;
      toast.success('Customer deleted successfully');
      setDeleteCustomer(null);
      fetchCustomers();
    } catch (error: any) {
      console.error('Error deleting customer:', error);
      if (error.code === '23503') {
        toast.error('Cannot delete customer — it is referenced by existing orders');
      } else {
        toast.error('Failed to delete customer');
      }
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
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
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
                        {customer.country && (() => {
                          const info = getCountryByCode(customer.country);
                          return (
                            <span className="text-sm text-muted-foreground">
                              • {info ? `${info.flag} ${info.name}` : customer.country}
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={customer.is_domestic ? 'secondary' : 'outline'}>
                        {customer.is_domestic ? 'Domestic' : 'International'}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(customer)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteCustomer(customer)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Customer Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., ABC Medical"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="code">Customer Code</Label>
              <Input
                id="code"
                value={form.code}
                onChange={(e) => setForm(prev => ({ ...prev, code: e.target.value }))}
                placeholder="e.g., ABC-001"
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <CountrySelect
                value={form.country}
                onValueChange={(val) => setForm(prev => ({ ...prev, country: val === 'all' ? '' : val }))}
                placeholder="Select country"
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="domestic"
                checked={form.is_domestic}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_domestic: checked }))}
              />
              <Label htmlFor="domestic">Domestic Customer (Egypt)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCustomer ? 'Save Changes' : 'Add Customer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteCustomer} onOpenChange={(open) => !open && setDeleteCustomer(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteCustomer?.name}</strong>? This action cannot be undone. Customers linked to existing orders cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
