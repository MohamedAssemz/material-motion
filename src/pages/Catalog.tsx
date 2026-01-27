import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Search, Loader2, Tag, Palette, X, Trash2, Edit } from 'lucide-react';
import { ProductCard } from '@/components/catalog/ProductCard';
import { ProductDetailDialog } from '@/components/catalog/ProductDetailDialog';
import { ProductFormDialog } from '@/components/catalog/ProductFormDialog';
import { SIZE_OPTIONS } from '@/lib/catalogConstants';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Category {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  product_count?: number;
}

interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
  product_count?: number;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  size: string | null;
  color: string | null;
  country: string | null;
  needs_packing: boolean | null;
  brand_id: string | null;
  created_at: string | null;
  brand?: { id: string; name: string } | null;
  categories?: { category: { id: string; name: string } }[];
  images?: { id: string; image_url: string; is_main: boolean | null; sort_order: number | null }[];
  potential_customers?: { customer: { id: string; name: string; code: string | null } }[];
}

export default function Catalog() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [selectedSize, setSelectedSize] = useState<string>('all');
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  
  // Dialogs
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  
  // Category/Brand management dialogs
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [brandDialogOpen, setBrandDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '' });
  const [brandForm, setBrandForm] = useState({ name: '', logo_url: '' });
  const [savingCategory, setSavingCategory] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);

  const canManage = hasRole('admin');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, categoriesRes, brandsRes] = await Promise.all([
        supabase.from('products').select(`
          *,
          brand:brands(id, name),
          categories:product_categories(category:categories(id, name)),
          images:product_images(id, image_url, is_main, sort_order),
          potential_customers:product_potential_customers(customer:customers(id, name, code))
        `).order('created_at', { ascending: false }),
        supabase.from('categories').select('*').order('name'),
        supabase.from('brands').select('*').order('name'),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (brandsRes.error) throw brandsRes.error;

      // Get product counts for categories and brands
      const productCategoryCount = new Map<string, number>();
      const productBrandCount = new Map<string, number>();
      
      (productsRes.data || []).forEach(p => {
        if (p.brand_id) {
          productBrandCount.set(p.brand_id, (productBrandCount.get(p.brand_id) || 0) + 1);
        }
        p.categories?.forEach((c: any) => {
          if (c.category?.id) {
            productCategoryCount.set(c.category.id, (productCategoryCount.get(c.category.id) || 0) + 1);
          }
        });
      });

      setProducts(productsRes.data || []);
      setCategories((categoriesRes.data || []).map(c => ({
        ...c,
        product_count: productCategoryCount.get(c.id) || 0,
      })));
      setBrands((brandsRes.data || []).map(b => ({
        ...b,
        product_count: productBrandCount.get(b.id) || 0,
      })));
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

  // Get unique countries from products
  const uniqueCountries = useMemo(() => {
    const countries = new Set<string>();
    products.forEach(p => {
      if (p.country) countries.add(p.country);
    });
    return Array.from(countries).sort();
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch = 
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term) ||
          (product.description?.toLowerCase().includes(term) ?? false);
        if (!matchesSearch) return false;
      }

      // Category filter
      if (selectedCategory !== 'all') {
        const hasCategory = product.categories?.some(c => c.category?.id === selectedCategory);
        if (!hasCategory) return false;
      }

      // Brand filter
      if (selectedBrand !== 'all') {
        if (product.brand_id !== selectedBrand) return false;
      }

      // Size filter
      if (selectedSize !== 'all') {
        if (product.size !== selectedSize) return false;
      }

      // Country filter
      if (selectedCountry !== 'all') {
        if (product.country !== selectedCountry) return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedBrand, selectedSize, selectedCountry]);

  const handleProductClick = (product: Product) => {
    setSelectedProduct(product);
    setDetailOpen(true);
  };

  const handleEditProduct = async (product: Product) => {
    // Prepare the product for editing
    const categoryIds = product.categories?.map(c => c.category?.id).filter(Boolean) || [];
    const customerIds = product.potential_customers?.map(c => c.customer?.id).filter(Boolean) || [];
    const images = product.images?.map(img => ({
      id: img.id,
      image_url: img.image_url,
      is_main: img.is_main ?? false,
      sort_order: img.sort_order ?? 0,
    })) || [];

    setEditingProduct({
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description || '',
      size: product.size || '',
      color: product.color || '',
      brand_id: product.brand_id || '',
      country: product.country || '',
      needs_packing: product.needs_packing ?? true,
      category_ids: categoryIds,
      customer_ids: customerIds,
      images,
    });
    setProductFormOpen(true);
    setDetailOpen(false);
  };

  // Category CRUD
  const handleSaveCategory = async () => {
    if (!categoryForm.name.trim()) return;
    setSavingCategory(true);
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({ name: categoryForm.name.trim(), description: categoryForm.description.trim() || null })
          .eq('id', editingCategory.id);
        if (error) throw error;
        toast({ title: 'Category updated' });
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({ name: categoryForm.name.trim(), description: categoryForm.description.trim() || null });
        if (error) throw error;
        toast({ title: 'Category created' });
      }
      setCategoryDialogOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', description: '' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure you want to delete this category?')) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Category deleted' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  // Brand CRUD
  const handleSaveBrand = async () => {
    if (!brandForm.name.trim()) return;
    setSavingBrand(true);
    try {
      if (editingBrand) {
        const { error } = await supabase
          .from('brands')
          .update({ name: brandForm.name.trim(), logo_url: brandForm.logo_url.trim() || null })
          .eq('id', editingBrand.id);
        if (error) throw error;
        toast({ title: 'Brand updated' });
      } else {
        const { error } = await supabase
          .from('brands')
          .insert({ name: brandForm.name.trim(), logo_url: brandForm.logo_url.trim() || null });
        if (error) throw error;
        toast({ title: 'Brand created' });
      }
      setBrandDialogOpen(false);
      setEditingBrand(null);
      setBrandForm({ name: '', logo_url: '' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSavingBrand(false);
    }
  };

  const handleDeleteBrand = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;
    try {
      const { error } = await supabase.from('brands').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Brand deleted' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('all');
    setSelectedBrand('all');
    setSelectedSize('all');
    setSelectedCountry('all');
  };

  const hasActiveFilters = searchTerm || selectedCategory !== 'all' || selectedBrand !== 'all' || selectedSize !== 'all' || selectedCountry !== 'all';

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
            <p className="text-muted-foreground">Manage products, categories, and brands</p>
          </div>
        </div>
        
        {canManage && (
          <Button onClick={() => { setEditingProduct(null); setProductFormOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        )}
      </div>

      <Tabs defaultValue="products" className="w-full">
        <TabsList>
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
          {canManage && <TabsTrigger value="categories">Categories ({categories.length})</TabsTrigger>}
          {canManage && <TabsTrigger value="brands">Brands ({brands.length})</TabsTrigger>}
        </TabsList>

        {/* Products Tab */}
        <TabsContent value="products" className="space-y-4">
          {/* Search and Filters */}
          <Card className="p-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search products by name, SKU, or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters} size="sm">
                    <X className="mr-1 h-4 w-4" />
                    Clear filters
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedBrand} onValueChange={setSelectedBrand}>
                  <SelectTrigger>
                    <SelectValue placeholder="Brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Brands</SelectItem>
                    {brands.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sizes</SelectItem>
                    {SIZE_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                  <SelectTrigger>
                    <SelectValue placeholder="Country" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Countries</SelectItem>
                    {uniqueCountries.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Products Grid */}
          {filteredProducts.length === 0 ? (
            <Card className="p-12 text-center">
              <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {products.length === 0 ? 'No products yet' : 'No products match your filters'}
              </h3>
              <p className="text-muted-foreground">
                {products.length === 0 && canManage 
                  ? 'Get started by adding your first product' 
                  : hasActiveFilters 
                    ? 'Try adjusting your filters' 
                    : 'Products will appear here once added'}
              </p>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onClick={() => handleProductClick(product)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* Categories Tab (Admin only) */}
        {canManage && (
          <TabsContent value="categories" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">Manage product categories</p>
              <Button onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', description: '' }); setCategoryDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Category
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No categories yet. Add your first category to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    categories.map((category) => (
                      <TableRow key={category.id}>
                        <TableCell className="font-medium">{category.name}</TableCell>
                        <TableCell className="text-muted-foreground">{category.description || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{category.product_count || 0}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(category.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingCategory(category);
                                setCategoryForm({ name: category.name, description: category.description || '' });
                                setCategoryDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteCategory(category.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}

        {/* Brands Tab (Admin only) */}
        {canManage && (
          <TabsContent value="brands" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-muted-foreground">Manage product brands</p>
              <Button onClick={() => { setEditingBrand(null); setBrandForm({ name: '', logo_url: '' }); setBrandDialogOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Brand
              </Button>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Logo</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Products</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {brands.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No brands yet. Add your first brand to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    brands.map((brand) => (
                      <TableRow key={brand.id}>
                        <TableCell>
                          {brand.logo_url ? (
                            <img src={brand.logo_url} alt={brand.name} className="h-8 w-8 object-contain rounded" />
                          ) : (
                            <div className="h-8 w-8 rounded bg-muted flex items-center justify-center">
                              <Palette className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{brand.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{brand.product_count || 0}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(brand.created_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setEditingBrand(brand);
                                setBrandForm({ name: brand.name, logo_url: brand.logo_url || '' });
                                setBrandDialogOpen(true);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteBrand(brand.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Category Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCategory ? 'Edit Category' : 'Add Category'}</DialogTitle>
            <DialogDescription>
              {editingCategory ? 'Update the category details below.' : 'Create a new product category.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="category-name">Name *</Label>
              <Input
                id="category-name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                placeholder="Category name"
              />
            </div>
            <div>
              <Label htmlFor="category-description">Description</Label>
              <Input
                id="category-description"
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCategoryDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCategory} disabled={savingCategory || !categoryForm.name.trim()}>
              {savingCategory && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Brand Dialog */}
      <Dialog open={brandDialogOpen} onOpenChange={setBrandDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingBrand ? 'Edit Brand' : 'Add Brand'}</DialogTitle>
            <DialogDescription>
              {editingBrand ? 'Update the brand details below.' : 'Create a new product brand.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="brand-name">Name *</Label>
              <Input
                id="brand-name"
                value={brandForm.name}
                onChange={(e) => setBrandForm({ ...brandForm, name: e.target.value })}
                placeholder="Brand name"
              />
            </div>
            <div>
              <Label htmlFor="brand-logo">Logo URL</Label>
              <Input
                id="brand-logo"
                value={brandForm.logo_url}
                onChange={(e) => setBrandForm({ ...brandForm, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBrandDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveBrand} disabled={savingBrand || !brandForm.name.trim()}>
              {savingBrand && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingBrand ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product Form Dialog */}
      <ProductFormDialog
        open={productFormOpen}
        onOpenChange={setProductFormOpen}
        product={editingProduct}
        onSuccess={fetchData}
      />

      {/* Product Detail Dialog */}
      <ProductDetailDialog
        product={selectedProduct}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={canManage ? handleEditProduct : undefined}
      />
    </div>
  );
}
