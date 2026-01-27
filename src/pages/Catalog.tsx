import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Package, Plus, Search, Loader2, Tag, Palette, X } from 'lucide-react';
import { ProductCard } from '@/components/catalog/ProductCard';
import { ProductDetailDialog } from '@/components/catalog/ProductDetailDialog';
import { ProductFormDialog } from '@/components/catalog/ProductFormDialog';
import { CategoryListDialog } from '@/components/catalog/CategoryListDialog';
import { BrandListDialog } from '@/components/catalog/BrandListDialog';
import { CountrySelect } from '@/components/catalog/CountrySelect';
import { SIZE_OPTIONS } from '@/lib/catalogConstants';

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
  
  // Category/Brand list dialogs
  const [categoryListOpen, setCategoryListOpen] = useState(false);
  const [brandListOpen, setBrandListOpen] = useState(false);

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

  // Get unique country codes from products
  const uniqueCountryCodes = useMemo(() => {
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Package className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Product Catalog</h1>
            <p className="text-muted-foreground text-sm">{products.length} products</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setCategoryListOpen(true)}>
                <Tag className="mr-2 h-4 w-4" />
                Categories
                <Badge variant="secondary" className="ml-2">{categories.length}</Badge>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setBrandListOpen(true)}>
                <Palette className="mr-2 h-4 w-4" />
                Brands
                <Badge variant="secondary" className="ml-2">{brands.length}</Badge>
              </Button>
              <Button onClick={() => { setEditingProduct(null); setProductFormOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" />
                Add Product
              </Button>
            </>
          )}
        </div>
      </div>

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

            <CountrySelect
              value={selectedCountry}
              onValueChange={setSelectedCountry}
              placeholder="Country"
              availableCountryCodes={uniqueCountryCodes}
              showAllOption
              allOptionLabel="All Countries"
            />
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

      {/* Category List Dialog */}
      <CategoryListDialog
        open={categoryListOpen}
        onOpenChange={setCategoryListOpen}
        categories={categories}
        onRefresh={fetchData}
      />

      {/* Brand List Dialog */}
      <BrandListDialog
        open={brandListOpen}
        onOpenChange={setBrandListOpen}
        brands={brands}
        onRefresh={fetchData}
      />

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
