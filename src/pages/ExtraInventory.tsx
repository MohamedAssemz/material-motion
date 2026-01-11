import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Package, Loader2, Box, Printer } from 'lucide-react';
import { format } from 'date-fns';
import { ExtraBoxSelectionDialog } from '@/components/ExtraBoxSelectionDialog';

interface Product {
  id: string;
  sku: string;
  name: string;
}

interface ExtraBatch {
  id: string;
  product_id: string;
  quantity: number;
  current_state: string;
  inventory_state: string;
  created_at: string;
  box_id: string | null;
  qr_code_data: string | null;
  product: Product;
  box?: {
    id: string;
    box_code: string;
  } | null;
}

const EXTRA_STATE_LABELS: Record<string, string> = {
  extra_manufacturing: 'Extra Manufacturing',
  extra_finishing: 'Extra Finishing',
  extra_packaging: 'Extra Packaging',
  extra_boxing: 'Extra Boxing',
};

const EXTRA_STATE_COLORS: Record<string, string> = {
  extra_manufacturing: 'bg-blue-500 text-white',
  extra_finishing: 'bg-purple-500 text-white',
  extra_packaging: 'bg-orange-500 text-white',
  extra_boxing: 'bg-cyan-500 text-white',
};

export default function ExtraInventory() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [batches, setBatches] = useState<ExtraBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [selectedBatchForBox, setSelectedBatchForBox] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    product_id: '',
    quantity: 1,
    current_state: 'extra_manufacturing',
  });

  const canManage = hasRole('manufacture_lead') || hasRole('admin');

  useEffect(() => {
    if (!canManage) {
      navigate('/');
      return;
    }
    fetchData();

    const channel = supabase
      .channel('extra-batches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_batches' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canManage, navigate]);

  const fetchData = async () => {
    try {
      const [productsRes, batchesRes] = await Promise.all([
        supabase.from('products').select('id, sku, name').order('sku'),
        supabase
          .from('extra_batches')
          .select(`
            id,
            product_id,
            quantity,
            current_state,
            inventory_state,
            created_at,
            box_id,
            qr_code_data,
            product:products(id, sku, name)
          `)
          .order('created_at', { ascending: false }),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (batchesRes.error) throw batchesRes.error;

      // Fetch box info for batches with box_id from extra_boxes
      const boxIds = batchesRes.data?.filter(b => b.box_id).map(b => b.box_id) || [];
      let boxMap = new Map();
      
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase
          .from('extra_boxes')
          .select('id, box_code')
          .in('id', boxIds);
        
        boxesData?.forEach(box => boxMap.set(box.id, box));
      }

      const batchesWithBoxes = batchesRes.data?.map(batch => ({
        ...batch,
        product: batch.product as unknown as Product,
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
      })) || [];

      setProducts(productsRes.data || []);
      setBatches(batchesWithBoxes);
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

  const handleCreateExtraBatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.product_id || formData.quantity < 1) {
      toast({
        title: 'Validation Error',
        description: 'Please select a product and enter a valid quantity',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { data: qrCode } = await supabase.rpc('generate_extra_batch_code');

      const { error } = await supabase.from('extra_batches').insert({
        product_id: formData.product_id,
        quantity: formData.quantity,
        current_state: formData.current_state,
        inventory_state: 'AVAILABLE',
        qr_code_data: qrCode || `EB-${Date.now()}`,
        created_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Extra inventory batch created',
      });

      setDialogOpen(false);
      setFormData({ product_id: '', quantity: 1, current_state: 'extra_manufacturing' });
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleAssignBox = async (boxId: string) => {
    if (!selectedBatchForBox) return;

    const batch = batches.find(b => b.id === selectedBatchForBox);
    if (!batch) return;

    try {
      // Update batch with box_id
      const { error: batchError } = await supabase
        .from('extra_batches')
        .update({ box_id: boxId })
        .eq('id', selectedBatchForBox);

      if (batchError) throw batchError;

      // Get current box data to update items_list
      const { data: boxData } = await supabase
        .from('extra_boxes')
        .select('items_list')
        .eq('id', boxId)
        .single();

      const currentItems = Array.isArray(boxData?.items_list) ? boxData.items_list : [];
      
      // Add new item to the list
      const newItem = {
        product_id: batch.product_id,
        product_name: batch.product.name,
        product_sku: batch.product.sku,
        quantity: batch.quantity,
        batch_id: batch.id,
      };

      const updatedItems = [...currentItems, newItem];

      // Update box with new items_list
      const { error: boxError } = await supabase
        .from('extra_boxes')
        .update({ 
          items_list: updatedItems,
          content_type: 'EXTRA'
        })
        .eq('id', boxId);

      if (boxError) throw boxError;

      toast({
        title: 'Success',
        description: 'Box assigned to batch',
      });
      setSelectedBatchForBox(null);
      setBoxDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getInventoryStateColor = (state: string) => {
    switch (state) {
      case 'AVAILABLE': return 'text-green-600 border-green-600';
      case 'RESERVED': return 'text-amber-600 border-amber-600';
      default: return '';
    }
  };

  const availableBatches = batches.filter(b => b.inventory_state === 'AVAILABLE');
  const reservedBatches = batches.filter(b => b.inventory_state === 'RESERVED');

  const totalAvailable = availableBatches.reduce((sum, b) => sum + b.quantity, 0);

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
            <Package className="h-6 w-6 text-amber-500" />
            <div>
              <h1 className="text-xl font-bold">Extra Inventory</h1>
              <p className="text-sm text-muted-foreground">Batch-based surplus inventory tracking</p>
            </div>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Extra Batch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Extra Inventory Batch</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateExtraBatch} className="space-y-4">
                <div>
                  <Label>Product *</Label>
                  <Select
                    value={formData.product_id}
                    onValueChange={(value) => setFormData({ ...formData, product_id: value })}
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
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    required
                  />
                </div>
                <div>
                  <Label>Current State</Label>
                  <Select
                    value={formData.current_state}
                    onValueChange={(value) => setFormData({ ...formData, current_state: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="extra_manufacturing">Extra Manufacturing</SelectItem>
                      <SelectItem value="extra_finishing">Extra Finishing</SelectItem>
                      <SelectItem value="extra_packaging">Extra Packaging</SelectItem>
                      <SelectItem value="extra_boxing">Extra Boxing</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Current production state of these extra units
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">Create Batch</Button>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Available Units</p>
                  <p className="text-2xl font-bold text-green-600">{totalAvailable}</p>
                </div>
                <Package className="h-8 w-8 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Available Batches</p>
                  <p className="text-2xl font-bold">{availableBatches.length}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Reserved</p>
                  <p className="text-2xl font-bold text-amber-600">{reservedBatches.length}</p>
                </div>
                <Package className="h-8 w-8 text-amber-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Batches Table */}
        <Card>
          <CardHeader>
            <CardTitle>Extra Inventory Batches</CardTitle>
          </CardHeader>
          <CardContent>
            {batches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No extra inventory batches</p>
                <p className="text-sm">Create batches when overproduction occurs</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>QR Code</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Current State</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Box</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono font-medium">{batch.qr_code_data || '-'}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{batch.product.name}</p>
                          <p className="text-xs text-muted-foreground">{batch.product.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">{batch.quantity}</TableCell>
                      <TableCell>
                        <Badge className={EXTRA_STATE_COLORS[batch.current_state] || 'bg-gray-500'}>
                          {EXTRA_STATE_LABELS[batch.current_state] || batch.current_state}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getInventoryStateColor(batch.inventory_state)}>
                          {batch.inventory_state}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {batch.box ? (
                          <div className="flex items-center gap-1">
                            <Box className="h-4 w-4 text-muted-foreground" />
                            <span className="font-mono text-sm">{batch.box.box_code}</span>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedBatchForBox(batch.id);
                              setBoxDialogOpen(true);
                            }}
                            disabled={batch.inventory_state === 'RESERVED'}
                          >
                            <Box className="h-4 w-4 mr-1" />
                            Assign
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>{format(new Date(batch.created_at), 'PP')}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm">
                          <Printer className="h-4 w-4" />
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

      <ExtraBoxSelectionDialog
        open={boxDialogOpen}
        onOpenChange={setBoxDialogOpen}
        onConfirm={handleAssignBox}
        title="Assign Extra Box"
      />
    </div>
  );
}
