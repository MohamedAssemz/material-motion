import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Edit, Package, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { z } from 'zod';

interface Product {
  id: string;
  sku: string;
  name: string;
}

interface ExtraProduct {
  id: string;
  product_id: string;
  quantity: number;
  created_at: string;
  updated_at: string;
  product: Product;
}

const extraProductSchema = z.object({
  product_id: z.string().min(1, 'Product is required'),
  quantity: z.number().min(0, 'Quantity must be at least 0').max(10000, 'Quantity too large'),
});

export default function ExtraProducts() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [extraProducts, setExtraProducts] = useState<ExtraProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ExtraProduct | null>(null);
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: 0,
  });

  const canManage = hasRole('manufacture_lead') || hasRole('admin');

  useEffect(() => {
    if (!canManage) {
      navigate('/');
      return;
    }

    fetchData();

    const channel = supabase
      .channel('extra-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_products' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canManage, navigate]);

  const fetchData = async () => {
    try {
      const [productsRes, extraProductsRes] = await Promise.all([
        supabase.from('products').select('id, sku, name').order('sku'),
        supabase.from('extra_products').select('*, product:products(id, sku, name)').order('created_at', { ascending: false }),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (extraProductsRes.error) throw extraProductsRes.error;

      setProducts(productsRes.data || []);
      setExtraProducts(extraProductsRes.data as any || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validation = extraProductSchema.safeParse(formData);
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    try {
      if (editingItem) {
        const { error } = await supabase
          .from('extra_products')
          .update({ quantity: formData.quantity })
          .eq('id', editingItem.id);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Extra product updated successfully',
        });
      } else {
        // Check if product already exists
        const existing = extraProducts.find(ep => ep.product_id === formData.product_id);
        
        if (existing) {
          const { error } = await supabase
            .from('extra_products')
            .update({ quantity: existing.quantity + formData.quantity })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('extra_products')
            .insert(formData);

          if (error) throw error;
        }

        toast({
          title: 'Success',
          description: 'Extra product added successfully',
        });
      }

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const resetForm = () => {
    setFormData({
      product_id: '',
      quantity: 0,
    });
    setEditingItem(null);
  };

  const openEditDialog = (item: ExtraProduct) => {
    setEditingItem(item);
    setFormData({
      product_id: item.product_id,
      quantity: item.quantity,
    });
    setDialogOpen(true);
  };

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
            <Package className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Extra Products</h1>
              <p className="text-sm text-muted-foreground">Manage surplus inventory for future orders</p>
            </div>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Extra Product
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingItem ? 'Edit Extra Product' : 'Add Extra Product'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="product">Product *</Label>
                  <Select
                    value={formData.product_id}
                    onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                    disabled={!!editingItem}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.sku} - {product.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">
                    {editingItem ? 'Update' : 'Add'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Surplus Inventory</CardTitle>
          </CardHeader>
          <CardContent>
            {extraProducts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No extra products in inventory</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Available Quantity</TableHead>
                    <TableHead>Last Updated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {extraProducts.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.product.sku}</TableCell>
                      <TableCell>{item.product.name}</TableCell>
                      <TableCell>
                        <span className={item.quantity > 0 ? 'text-green-600 font-semibold' : 'text-muted-foreground'}>
                          {item.quantity}
                        </span>
                      </TableCell>
                      <TableCell>{format(new Date(item.updated_at), 'PPP')}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(item)}
                        >
                          <Edit className="h-4 w-4" />
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
    </div>
  );
}
