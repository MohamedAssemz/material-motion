import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Edit, Loader2, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Customer {
  id: string;
  name: string;
  code: string | null;
}

interface ProductSize {
  id: string;
  size_name: string;
}

interface ProductColor {
  id: string;
  color_name: string;
}

interface ProductVariant {
  id: string;
  sku: string;
  name: string;
  size_id: string | null;
  color_id: string | null;
  size?: ProductSize;
  color?: ProductColor;
}

interface ParentProduct {
  id: string;
  parent_sku: string;
  name: string;
  description: string | null;
  needs_packing: boolean;
  sizes: ProductSize[];
  colors: ProductColor[];
  potential_customers: Customer[];
  variants: ProductVariant[];
}

export default function Catalog() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [parentProducts, setParentProducts] = useState<ParentProduct[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ParentProduct | null>(null);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    needs_packing: true,
  });
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [newSize, setNewSize] = useState('');
  const [newColor, setNewColor] = useState('');

  const canManage = hasRole('admin');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [parentRes, customersRes] = await Promise.all([
        supabase.from('parent_products').select('*').order('parent_sku'),
        supabase.from('customers').select('id, name, code').order('name'),
      ]);

      if (parentRes.error) throw parentRes.error;
      if (customersRes.error) throw customersRes.error;

      setCustomers(customersRes.data || []);

      // Fetch related data for each parent product
      const parentProducts: ParentProduct[] = [];
      for (const parent of parentRes.data || []) {
        const [sizesRes, colorsRes, customersLinkRes, variantsRes] = await Promise.all([
          supabase.from('product_sizes').select('id, size_name').eq('parent_product_id', parent.id),
          supabase.from('product_colors').select('id, color_name').eq('parent_product_id', parent.id),
          supabase.from('product_potential_customers').select('customer_id, customer:customers(id, name, code)').eq('parent_product_id', parent.id),
          supabase.from('products').select('id, sku, name, size_id, color_id').eq('parent_product_id', parent.id),
        ]);

        parentProducts.push({
          ...parent,
          sizes: sizesRes.data || [],
          colors: colorsRes.data || [],
          potential_customers: customersLinkRes.data?.map((c: any) => c.customer).filter(Boolean) || [],
          variants: variantsRes.data || [],
        });
      }

      setParentProducts(parentProducts);
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

  const handleAddSize = () => {
    if (newSize.trim() && !sizes.includes(newSize.trim())) {
      setSizes([...sizes, newSize.trim()]);
      setNewSize('');
    }
  };

  const handleAddColor = () => {
    if (newColor.trim() && !colors.includes(newColor.trim())) {
      setColors([...colors, newColor.trim()]);
      setNewColor('');
    }
  };

  const handleRemoveSize = (size: string) => {
    setSizes(sizes.filter(s => s !== size));
  };

  const handleRemoveColor = (color: string) => {
    setColors(colors.filter(c => c !== color));
  };

  const toggleCustomer = (customerId: string) => {
    const newSet = new Set(selectedCustomerIds);
    if (newSet.has(customerId)) {
      newSet.delete(customerId);
    } else {
      newSet.add(customerId);
    }
    setSelectedCustomerIds(newSet);
  };

  const generateVariantSKU = (parentSku: string, size: string | null, color: string | null): string => {
    let sku = parentSku;
    if (size) sku += `-${size.toUpperCase().replace(/\s+/g, '')}`;
    if (color) sku += `-${color.toUpperCase().replace(/\s+/g, '')}`;
    return sku;
  };

  const generateVariantName = (parentName: string, size: string | null, color: string | null): string => {
    let name = parentName;
    const parts = [];
    if (size) parts.push(size);
    if (color) parts.push(color);
    if (parts.length > 0) name += ` (${parts.join(', ')})`;
    return name;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;

    setSubmitting(true);
    try {
      // Generate parent SKU
      const { data: parentSku } = await supabase.rpc('generate_parent_sku');
      
      // Create parent product
      const { data: parentProduct, error: parentError } = await supabase
        .from('parent_products')
        .insert({
          parent_sku: parentSku || `SKU-${Date.now()}`,
          name: formData.name.trim(),
          description: formData.description.trim() || null,
          needs_packing: formData.needs_packing,
        })
        .select()
        .single();

      if (parentError) throw parentError;

      // Create sizes
      const sizeMap = new Map<string, string>();
      for (const size of sizes) {
        const { data: sizeData } = await supabase
          .from('product_sizes')
          .insert({ parent_product_id: parentProduct.id, size_name: size })
          .select()
          .single();
        if (sizeData) sizeMap.set(size, sizeData.id);
      }

      // Create colors
      const colorMap = new Map<string, string>();
      for (const color of colors) {
        const { data: colorData } = await supabase
          .from('product_colors')
          .insert({ parent_product_id: parentProduct.id, color_name: color })
          .select()
          .single();
        if (colorData) colorMap.set(color, colorData.id);
      }

      // Create potential customers
      for (const customerId of selectedCustomerIds) {
        await supabase
          .from('product_potential_customers')
          .insert({ parent_product_id: parentProduct.id, customer_id: customerId });
      }

      // Generate variants
      const sizeList = sizes.length > 0 ? sizes : [null];
      const colorList = colors.length > 0 ? colors : [null];

      for (const size of sizeList) {
        for (const color of colorList) {
          const variantSku = generateVariantSKU(parentProduct.parent_sku, size, color);
          const variantName = generateVariantName(formData.name.trim(), size, color);

          await supabase.from('products').insert({
            sku: variantSku,
            name: variantName,
            description: formData.description.trim() || null,
            needs_packing: formData.needs_packing,
            parent_product_id: parentProduct.id,
            size_id: size ? sizeMap.get(size) : null,
            color_id: color ? colorMap.get(color) : null,
          });
        }
      }

      toast({
        title: 'Success',
        description: `Created ${formData.name} with ${sizeList.length * colorList.length} variant(s)`,
      });

      setDialogOpen(false);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({ name: '', description: '', needs_packing: true });
    setSizes([]);
    setColors([]);
    setSelectedCustomerIds(new Set());
    setNewSize('');
    setNewColor('');
    setEditingProduct(null);
  };

  const toggleExpanded = (id: string) => {
    const newSet = new Set(expandedProducts);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedProducts(newSet);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Product Catalog</h1>
            <p className="text-muted-foreground">Manage products with sizes, colors, and variants</p>
          </div>
        </div>
        
        {canManage && (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        )}
      </div>

      {/* Products List */}
      <div className="space-y-4">
        {parentProducts.length === 0 ? (
          <Card className="p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No products yet</h3>
            <p className="text-muted-foreground">
              {canManage ? 'Get started by adding your first product' : 'Products will appear here once added'}
            </p>
          </Card>
        ) : (
          parentProducts.map((product) => (
            <Card key={product.id}>
              <Collapsible
                open={expandedProducts.has(product.id)}
                onOpenChange={() => toggleExpanded(product.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-6 w-6">
                            {expandedProducts.has(product.id) ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CardTitle className="text-lg">{product.name}</CardTitle>
                        <Badge variant="outline" className="font-mono">{product.parent_sku}</Badge>
                        {product.needs_packing ? (
                          <Badge variant="secondary" className="text-xs">Needs Packing</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">No Packing</Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1 ml-8">
                        {product.description || 'No description'}
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge>{product.variants.length} variant{product.variants.length !== 1 ? 's' : ''}</Badge>
                    </div>
                  </div>
                  
                  {/* Quick info */}
                  <div className="flex gap-4 mt-3 ml-8 text-sm text-muted-foreground">
                    {product.sizes.length > 0 && (
                      <span>Sizes: {product.sizes.map(s => s.size_name).join(', ')}</span>
                    )}
                    {product.colors.length > 0 && (
                      <span>Colors: {product.colors.map(c => c.color_name).join(', ')}</span>
                    )}
                    {product.potential_customers.length > 0 && (
                      <span>Customers: {product.potential_customers.map(c => c.name).join(', ')}</span>
                    )}
                  </div>
                </CardHeader>
                
                <CollapsibleContent>
                  <CardContent className="pt-0">
                    <div className="ml-8 border-t pt-4">
                      <h4 className="font-medium mb-3">Product Variants (Child SKUs)</h4>
                      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                        {product.variants.map((variant) => (
                          <div key={variant.id} className="p-3 border rounded-lg bg-muted/30">
                            <p className="font-mono text-sm font-medium">{variant.sku}</p>
                            <p className="text-sm text-muted-foreground">{variant.name}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))
        )}
      </div>

      {/* Add Product Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Product</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Classic T-Shirt"
                  required
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Product description..."
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label htmlFor="needs_packing" className="font-medium">Needs Packaging</Label>
                  <p className="text-xs text-muted-foreground">
                    Enable if this product requires the packaging phase
                  </p>
                </div>
                <Switch
                  id="needs_packing"
                  checked={formData.needs_packing}
                  onCheckedChange={(checked) => setFormData({ ...formData, needs_packing: checked })}
                />
              </div>
            </div>

            {/* Sizes */}
            <div className="space-y-2">
              <Label>Sizes (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={newSize}
                  onChange={(e) => setNewSize(e.target.value)}
                  placeholder="e.g., Small, Medium, Large"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSize())}
                />
                <Button type="button" variant="outline" onClick={handleAddSize}>Add</Button>
              </div>
              {sizes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {sizes.map((size) => (
                    <Badge key={size} variant="secondary" className="gap-1">
                      {size}
                      <button type="button" onClick={() => handleRemoveSize(size)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Colors */}
            <div className="space-y-2">
              <Label>Colors (optional)</Label>
              <div className="flex gap-2">
                <Input
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  placeholder="e.g., Red, Blue, Green"
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddColor())}
                />
                <Button type="button" variant="outline" onClick={handleAddColor}>Add</Button>
              </div>
              {colors.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {colors.map((color) => (
                    <Badge key={color} variant="secondary" className="gap-1">
                      {color}
                      <button type="button" onClick={() => handleRemoveColor(color)}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Variant Preview */}
            {(sizes.length > 0 || colors.length > 0) && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm">Variants to be created:</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  {(sizes.length || 1) * (colors.length || 1)} variant(s) will be created
                </p>
              </div>
            )}

            {/* Potential Customers */}
            <div className="space-y-2">
              <Label>Potential Customers (optional)</Label>
              <div className="max-h-40 overflow-y-auto border rounded-lg p-2 space-y-2">
                {customers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-2">No customers available</p>
                ) : (
                  customers.map((customer) => (
                    <div key={customer.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`customer-${customer.id}`}
                        checked={selectedCustomerIds.has(customer.id)}
                        onCheckedChange={() => toggleCustomer(customer.id)}
                      />
                      <Label htmlFor={`customer-${customer.id}`} className="text-sm cursor-pointer">
                        {customer.name}
                        {customer.code && <span className="text-muted-foreground ml-1">({customer.code})</span>}
                      </Label>
                    </div>
                  ))
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !formData.name.trim()}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Product
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
