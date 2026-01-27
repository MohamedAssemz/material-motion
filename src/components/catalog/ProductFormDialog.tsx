import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SIZE_OPTIONS } from '@/lib/catalogConstants';
import { ProductImageUpload } from './ProductImageUpload';

interface Category {
  id: string;
  name: string;
}

interface Brand {
  id: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
  code: string | null;
}

interface ProductImage {
  id?: string;
  image_url: string;
  is_main: boolean;
  sort_order: number;
}

interface ProductFormData {
  id?: string;
  sku: string;
  name: string;
  description: string;
  size: string;
  color: string;
  brand_id: string;
  country: string;
  needs_packing: boolean;
  category_ids: string[];
  customer_ids: string[];
  images: ProductImage[];
}

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: ProductFormData | null;
  onSuccess: () => void;
}

const initialFormData: ProductFormData = {
  sku: '',
  name: '',
  description: '',
  size: '',
  color: '',
  brand_id: '',
  country: '',
  needs_packing: true,
  category_ids: [],
  customer_ids: [],
  images: [],
};

export function ProductFormDialog({ 
  open, 
  onOpenChange, 
  product, 
  onSuccess 
}: ProductFormDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);

  // Fetch lookup data
  useEffect(() => {
    if (open) {
      fetchLookupData();
    }
  }, [open]);

  // Load product data when editing
  useEffect(() => {
    if (product) {
      setFormData(product);
    } else {
      setFormData(initialFormData);
    }
  }, [product]);

  const fetchLookupData = async () => {
    setLoading(true);
    try {
      const [categoriesRes, brandsRes, customersRes] = await Promise.all([
        supabase.from('categories').select('id, name').order('name'),
        supabase.from('brands').select('id, name').order('name'),
        supabase.from('customers').select('id, name, code').order('name'),
      ]);

      setCategories(categoriesRes.data || []);
      setBrands(brandsRes.data || []);
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error fetching lookup data:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateSKU = () => {
    const timestamp = Date.now().toString(36).toUpperCase();
    return `SKU-${timestamp}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Product name is required',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    
    try {
      const sku = formData.sku || generateSKU();
      
      // Prepare product data
      const productData = {
        sku,
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        size: formData.size || null,
        color: formData.color.trim() || null,
        brand_id: formData.brand_id || null,
        country: formData.country.trim() || null,
        needs_packing: formData.needs_packing,
      };

      let productId = formData.id;

      if (productId) {
        // Update existing product
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId);

        if (error) throw error;
      } else {
        // Create new product
        const { data, error } = await supabase
          .from('products')
          .insert(productData)
          .select('id')
          .single();

        if (error) throw error;
        productId = data.id;
      }

      // Update categories (delete all, then insert new)
      await supabase
        .from('product_categories')
        .delete()
        .eq('product_id', productId);

      if (formData.category_ids.length > 0) {
        await supabase.from('product_categories').insert(
          formData.category_ids.map(categoryId => ({
            product_id: productId,
            category_id: categoryId,
          }))
        );
      }

      // Update potential customers - use product_id column
      // First delete existing entries for this product
      await supabase
        .from('product_potential_customers')
        .delete()
        .eq('product_id', productId);

      if (formData.customer_ids.length > 0) {
        // Note: The table still has parent_product_id as required
        // Using product_id as placeholder for parent_product_id
        await supabase.from('product_potential_customers').insert(
          formData.customer_ids.map(customerId => ({
            product_id: productId,
            parent_product_id: productId,
            customer_id: customerId,
          }))
        );
      }

      // Update images (delete existing, insert new)
      await supabase
        .from('product_images')
        .delete()
        .eq('product_id', productId);

      if (formData.images.length > 0) {
        await supabase.from('product_images').insert(
          formData.images.map((img, index) => ({
            product_id: productId,
            image_url: img.image_url,
            is_main: img.is_main,
            sort_order: index,
          }))
        );
      }

      toast({
        title: 'Success',
        description: product?.id ? 'Product updated successfully' : 'Product created successfully',
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Save error:', error);
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (categoryId: string) => {
    setFormData(prev => ({
      ...prev,
      category_ids: prev.category_ids.includes(categoryId)
        ? prev.category_ids.filter(id => id !== categoryId)
        : [...prev.category_ids, categoryId],
    }));
  };

  const toggleCustomer = (customerId: string) => {
    setFormData(prev => ({
      ...prev,
      customer_ids: prev.customer_ids.includes(customerId)
        ? prev.customer_ids.filter(id => id !== customerId)
        : [...prev.customer_ids, customerId],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {product?.id ? 'Edit Product' : 'Add New Product'}
          </DialogTitle>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1 pr-4">
              <div className="space-y-6 pb-4">
                {/* Basic Info */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label htmlFor="name">Product Name *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter product name"
                      required
                    />
                  </div>
                  
                  <div className="sm:col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Product description"
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="size">Size</Label>
                    <Select
                      value={formData.size}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, size: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select size" />
                      </SelectTrigger>
                      <SelectContent>
                        {SIZE_OPTIONS.map(size => (
                          <SelectItem key={size} value={size}>{size}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="color">Color</Label>
                    <Input
                      id="color"
                      value={formData.color}
                      onChange={(e) => setFormData(prev => ({ ...prev, color: e.target.value }))}
                      placeholder="e.g., Blue, Red"
                    />
                  </div>

                  <div>
                    <Label htmlFor="brand">Brand</Label>
                    <Select
                      value={formData.brand_id}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, brand_id: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select brand" />
                      </SelectTrigger>
                      <SelectContent>
                        {brands.map(brand => (
                          <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={formData.country}
                      onChange={(e) => setFormData(prev => ({ ...prev, country: e.target.value }))}
                      placeholder="Target market"
                    />
                  </div>
                </div>

                {/* Needs Packing Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label htmlFor="needs_packing" className="font-medium">Needs Packaging</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable if this product requires packing phase
                    </p>
                  </div>
                  <Switch
                    id="needs_packing"
                    checked={formData.needs_packing}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, needs_packing: checked }))}
                  />
                </div>

                {/* Categories */}
                <div>
                  <Label className="mb-2 block">Categories</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg">
                    {categories.length === 0 ? (
                      <p className="col-span-full text-sm text-muted-foreground">No categories available</p>
                    ) : (
                      categories.map(category => (
                        <label 
                          key={category.id} 
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={formData.category_ids.includes(category.id)}
                            onCheckedChange={() => toggleCategory(category.id)}
                          />
                          {category.name}
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Potential Customers */}
                <div>
                  <Label className="mb-2 block">Potential Customers</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg">
                    {customers.length === 0 ? (
                      <p className="col-span-full text-sm text-muted-foreground">No customers available</p>
                    ) : (
                      customers.map(customer => (
                        <label 
                          key={customer.id} 
                          className="flex items-center gap-2 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={formData.customer_ids.includes(customer.id)}
                            onCheckedChange={() => toggleCustomer(customer.id)}
                          />
                          <span className="truncate">
                            {customer.name}
                            {customer.code && <span className="text-muted-foreground ml-1">({customer.code})</span>}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Images */}
                <div>
                  <Label className="mb-2 block">Product Images</Label>
                  <ProductImageUpload
                    images={formData.images}
                    onChange={(images) => setFormData(prev => ({ ...prev, images }))}
                    productId={formData.id}
                  />
                </div>
              </div>
            </ScrollArea>

            <div className="flex gap-2 pt-4 border-t mt-4">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {product?.id ? 'Update Product' : 'Create Product'}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
