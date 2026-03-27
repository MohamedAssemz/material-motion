import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { SIZE_OPTIONS } from '@/lib/catalogConstants';
import { ProductImageUpload } from './ProductImageUpload';
import { CountrySelect } from './CountrySelect';
import { SearchableSelect } from '@/components/ui/searchable-select';

// Categories selector with search
function CategoriesSelector({ 
  categories, 
  selectedIds, 
  onToggle,
  t,
}: { 
  categories: { id: string; name: string }[]; 
  selectedIds: string[]; 
  onToggle: (id: string) => void;
  t: (key: string) => string;
}) {
  const [search, setSearch] = useState('');
  
  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    return categories.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [categories, search]);

  return (
    <div>
      <Label className="mb-2 block">{t('catalog.categories')}</Label>
      <div className="border rounded-lg">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('catalog.search_categories')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-32 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="col-span-full text-sm text-muted-foreground text-center py-2">
              {search ? t('catalog.no_categories_match') : t('catalog.no_categories_available')}
            </p>
          ) : (
            filtered.map(category => (
              <label 
                key={category.id} 
                className="flex items-center gap-2 cursor-pointer text-sm"
              >
                <Checkbox
                  checked={selectedIds.includes(category.id)}
                  onCheckedChange={() => onToggle(category.id)}
                />
                {category.name}
              </label>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface Category {
  id: string;
  name: string;
}

interface Brand {
  id: string;
  name_en: string;
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

export interface ProductFormData {
  id?: string;
  sku: string;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  sizes: string[];
  color_en: string;
  color_ar: string;
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
  isDuplicating?: boolean;
  originalProduct?: ProductFormData | null;
}

const initialFormData: ProductFormData = {
  sku: '',
  name_en: '',
  name_ar: '',
  description_en: '',
  description_ar: '',
  sizes: [],
  color_en: '',
  color_ar: '',
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
  onSuccess,
  isDuplicating = false,
  originalProduct = null,
}: ProductFormDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<ProductFormData>(initialFormData);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [previewSku, setPreviewSku] = useState<string>('');

  // Generate preview SKU for new products
  useEffect(() => {
    if (open && !product?.id) {
      setPreviewSku(generateSKU());
    }
  }, [open, product?.id]);

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
        supabase.from('brands').select('id, name_en').order('name_en'),
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

  // Check if duplicate product has been modified
  const hasChangesFromOriginal = (): boolean => {
    if (!isDuplicating || !originalProduct) return true;
    
    return (
      formData.name_en !== originalProduct.name_en ||
      formData.description_en !== originalProduct.description_en ||
      JSON.stringify([...formData.sizes].sort()) !== JSON.stringify([...originalProduct.sizes].sort()) ||
      formData.color_en !== originalProduct.color_en ||
      formData.brand_id !== originalProduct.brand_id ||
      formData.country !== originalProduct.country ||
      formData.needs_packing !== originalProduct.needs_packing ||
      JSON.stringify([...formData.category_ids].sort()) !== JSON.stringify([...originalProduct.category_ids].sort()) ||
      JSON.stringify([...formData.customer_ids].sort()) !== JSON.stringify([...originalProduct.customer_ids].sort()) ||
      formData.images.length !== originalProduct.images.length ||
      formData.images.some((img, i) => img.image_url !== originalProduct.images[i]?.image_url)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name_en.trim()) {
      toast({
        title: t('toast.error'),
        description: t('catalog.name_required'),
        variant: 'destructive',
      });
      return;
    }

    // Check for duplicate validation
    if (isDuplicating && !hasChangesFromOriginal()) {
      toast({
        title: t('catalog.no_changes'),
        description: t('catalog.no_changes_desc'),
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    
    try {
      const sku = formData.id ? formData.sku : previewSku;
      
      const productData = {
        sku,
        name_en: formData.name_en.trim(),
        name_ar: formData.name_ar.trim() || null,
        description_en: formData.description_en.trim() || null,
        description_ar: formData.description_ar.trim() || null,
        sizes: formData.sizes.length > 0 ? formData.sizes : [],
        color_en: formData.color_en.trim() || null,
        color_ar: formData.color_ar.trim() || null,
        brand_id: formData.brand_id || null,
        country: formData.country.trim() || null,
        needs_packing: formData.needs_packing,
      };

      let productId = formData.id;

      if (productId) {
        const { error } = await supabase
          .from('products')
          .update(productData)
          .eq('id', productId);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('products')
          .insert(productData)
          .select('id')
          .single();

        if (error) throw error;
        productId = data.id;
      }

      // Update categories
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

      // Update customers
      await supabase
        .from('product_customers')
        .delete()
        .eq('product_id', productId);

      if (formData.customer_ids.length > 0) {
        await supabase.from('product_customers').insert(
          formData.customer_ids.map(customerId => ({
            product_id: productId,
            customer_id: customerId,
          }))
        );
      }

      // Update images
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
        title: t('toast.success'),
        description: product?.id ? t('catalog.product_updated') : t('catalog.product_created'),
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

  const toggleSize = (size: string) => {
    setFormData(prev => ({
      ...prev,
      sizes: prev.sizes.includes(size)
        ? prev.sizes.filter(s => s !== size)
        : [...prev.sizes, size],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {isDuplicating ? t('catalog.duplicate_product') : product?.id ? t('catalog.edit_product') : t('catalog.add_new_product')}
          </DialogTitle>
          {/* SKU Display */}
          <div className="flex items-center gap-2 pt-2">
            <span className="text-sm text-muted-foreground">SKU:</span>
            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">
              {product?.id ? formData.sku : previewSku}
            </code>
            {!product?.id && (
              <span className="text-xs text-muted-foreground">{t('catalog.auto_generated')}</span>
            )}
          </div>
        </DialogHeader>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto pr-4 space-y-6 pb-4">
                {/* Names: EN left, AR right */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="name_en">{t('catalog.english_name')} *</Label>
                    <Input
                      id="name_en"
                      value={formData.name_en}
                      onChange={(e) => setFormData(prev => ({ ...prev, name_en: e.target.value }))}
                      placeholder={t('catalog.enter_name')}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="name_ar">{t('catalog.arabic_name')}</Label>
                    <Input
                      id="name_ar"
                      value={formData.name_ar}
                      onChange={(e) => setFormData(prev => ({ ...prev, name_ar: e.target.value }))}
                      placeholder="الاسم بالعربية"
                      dir="rtl"
                    />
                  </div>
                </div>

                {/* Descriptions: EN left, AR right */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="description_en">{t('catalog.english_description')}</Label>
                    <Textarea
                      id="description_en"
                      value={formData.description_en}
                      onChange={(e) => setFormData(prev => ({ ...prev, description_en: e.target.value }))}
                      placeholder={t('catalog.product_desc')}
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label htmlFor="description_ar">{t('catalog.arabic_description')}</Label>
                    <Textarea
                      id="description_ar"
                      value={formData.description_ar}
                      onChange={(e) => setFormData(prev => ({ ...prev, description_ar: e.target.value }))}
                      placeholder="الوصف بالعربية"
                      rows={2}
                      dir="rtl"
                    />
                  </div>
                </div>

                {/* Colors: EN left, AR right (before sizes) */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="color_en">{t('catalog.english_color')}</Label>
                    <Input
                      id="color_en"
                      value={formData.color_en}
                      onChange={(e) => setFormData(prev => ({ ...prev, color_en: e.target.value }))}
                      placeholder="e.g. Red, Blue"
                    />
                  </div>
                  <div>
                    <Label htmlFor="color_ar">{t('catalog.arabic_color')}</Label>
                    <Input
                      id="color_ar"
                      value={formData.color_ar}
                      onChange={(e) => setFormData(prev => ({ ...prev, color_ar: e.target.value }))}
                      placeholder="مثال: أحمر، أزرق"
                      dir="rtl"
                    />
                  </div>
                </div>

                {/* Sizes: multi-select checkboxes */}
                <div>
                  <Label className="mb-2 block">{t('catalog.size')}</Label>
                  <div className="border rounded-lg p-3">
                    <div className="flex flex-wrap gap-3">
                      {SIZE_OPTIONS.map(size => (
                        <label 
                          key={size} 
                          className="flex items-center gap-1.5 cursor-pointer text-sm"
                        >
                          <Checkbox
                            checked={formData.sizes.includes(size)}
                            onCheckedChange={() => toggleSize(size)}
                          />
                          {size}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Brand & Country */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="brand">{t('catalog.brands')}</Label>
                    <SearchableSelect
                      options={brands.map(b => ({ value: b.id, label: b.name_en }))}
                      value={formData.brand_id || null}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, brand_id: value || '' }))}
                      placeholder={t('catalog.select_brand')}
                      searchPlaceholder={t('catalog.search_brands')}
                      emptyText={t('catalog.no_brands_found')}
                    />
                  </div>

                  <div>
                    <Label htmlFor="country">{t('catalog.country')}</Label>
                    <CountrySelect
                      value={formData.country}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
                      placeholder={t('catalog.select_market')}
                    />
                  </div>
                </div>

                {/* Needs Packing Toggle */}
                <div className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <Label htmlFor="needs_packing" className="font-medium">{t('catalog.needs_packaging')}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t('catalog.needs_packaging_desc')}
                    </p>
                  </div>
                  <Switch
                    id="needs_packing"
                    checked={formData.needs_packing}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, needs_packing: checked }))}
                  />
                </div>

                {/* Categories */}
                <CategoriesSelector
                  categories={categories}
                  selectedIds={formData.category_ids}
                  onToggle={toggleCategory}
                  t={t}
                />

                {/* Potential Customers */}
                <div>
                  <Label className="mb-2 block">{t('catalog.potential_customers')}</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 border rounded-lg">
                    {customers.length === 0 ? (
                      <p className="col-span-full text-sm text-muted-foreground">{t('catalog.no_customers')}</p>
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
                  <Label className="mb-2 block">{t('catalog.product_images')}</Label>
                  <ProductImageUpload
                    images={formData.images}
                    onChange={(images) => setFormData(prev => ({ ...prev, images }))}
                    productId={formData.id}
                  />
                </div>
            </div>

            <div className="flex-shrink-0 flex gap-2 pt-4 border-t mt-4">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {isDuplicating ? t('catalog.create_duplicate') : product?.id ? t('catalog.update_product') : t('catalog.create_product')}
              </Button>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
