import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Package, Edit, Check, X, BarChart3, Loader2, Globe } from 'lucide-react';
import { useState, useEffect } from 'react';
import { ProductCardData } from './ProductCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { getProductDisplayDescription } from '@/lib/catalogHelpers';
import { supabase } from '@/integrations/supabase/client';
import { getCountryByCode } from '@/lib/countries';

interface ProductPotentialCustomer {
  customer: {
    id: string;
    name: string;
    code: string | null;
    country?: string | null;
  } | null;
}

interface ExtendedProductData extends ProductCardData {
  potential_customers?: ProductPotentialCustomer[];
  created_at?: string | null;
  minimum_quantity?: number | null;
}

interface ProductDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: ExtendedProductData | null;
  onEdit?: (product: any) => void;
}

export function ProductDetailDialog({ 
  open, 
  onOpenChange, 
  product, 
  onEdit,
}: ProductDetailDialogProps) {
  const { t, language } = useLanguage();
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [totalOrdered, setTotalOrdered] = useState<number | null>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);
  
  useEffect(() => {
    if (open && product) {
      setSelectedImageIndex(0);
      fetchInsights(product.id);
    }
  }, [open, product?.id]);

  const fetchInsights = async (productId: string) => {
    setLoadingInsights(true);
    try {
      const { data, error } = await supabase
        .from('order_items')
        .select('quantity')
        .eq('product_id', productId);
      
      if (error) throw error;
      const total = (data || []).reduce((sum, item) => sum + item.quantity, 0);
      setTotalOrdered(total);
    } catch {
      setTotalOrdered(null);
    } finally {
      setLoadingInsights(false);
    }
  };

  if (!product) return null;

  const mainImageIndex = product.images?.findIndex(img => img.is_main) ?? 0;
  const currentImage = product.images?.[selectedImageIndex] || product.images?.[mainImageIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <DialogTitle className="text-xl" dir={language === 'ar' ? 'rtl' : 'ltr'}>
              {language === 'ar' ? (product.name_ar || product.name_en) : product.name_en}
            </DialogTitle>
            <p className="text-sm font-mono text-muted-foreground">{product.sku}</p>
          </div>
          {onEdit && (
            <Button variant="outline" size="sm" className="mt-2 shrink-0" onClick={() => onEdit(product)}>
              <Edit className="h-4 w-4 me-2" />
              {t('catalog.edit')}
            </Button>
          )}
        </DialogHeader>
        
        <ScrollArea className="flex-1 overflow-auto">
          <div className="grid gap-6 md:grid-cols-2 pb-4">
            {/* Image Gallery */}
            <div className="space-y-3">
              <AspectRatio ratio={1} className="bg-muted rounded-lg overflow-hidden">
                {currentImage ? (
                  <img src={currentImage.image_url} alt={product.name_en} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Package className="h-20 w-20 text-muted-foreground/40" />
                  </div>
                )}
              </AspectRatio>
              {product.images && product.images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {product.images.map((img, index) => (
                    <button
                      key={img.id}
                      onClick={() => setSelectedImageIndex(index)}
                      className={`relative shrink-0 w-16 h-16 rounded-md overflow-hidden border-2 transition-colors ${
                        selectedImageIndex === index ? 'border-primary' : 'border-transparent hover:border-muted-foreground/50'
                      }`}
                    >
                      <img src={img.image_url} alt={`Thumbnail ${index + 1}`} className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Product Details */}
            <div className="space-y-4">
              {/* Bilingual Names - always show both */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 text-start">{t('catalog.english_name')}</h4>
                  <p className="text-sm font-medium text-start">{product.name_en}</p>
                </div>
                <div dir="rtl">
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 text-start">{t('catalog.arabic_name')}</h4>
                  <p className="text-sm font-medium text-start">{product.name_ar || '—'}</p>
                </div>
              </div>

              {/* Bilingual Descriptions */}
              {(product.description_en || product.description_ar) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1 text-start">{t('catalog.english_description')}</h4>
                    <p className="text-sm text-start">{product.description_en || '—'}</p>
                  </div>
                  <div dir="rtl">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1 text-start">{t('catalog.arabic_description')}</h4>
                    <p className="text-sm text-start">{product.description_ar || '—'}</p>
                  </div>
                </div>
              )}

              {/* Bilingual Colors */}
              {(product.color_en || product.color_ar) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1 text-start">{t('catalog.english_color')}</h4>
                    <span className="text-sm font-medium text-start">{product.color_en || '—'}</span>
                  </div>
                  <div dir="rtl">
                    <h4 className="text-sm font-medium text-muted-foreground mb-1 text-start">{t('catalog.arabic_color')}</h4>
                    <span className="text-sm font-medium text-start">{product.color_ar || '—'}</span>
                  </div>
                </div>
              )}

              {/* Sizes as tags */}
              {product.sizes && product.sizes.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('catalog.size')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {product.sizes.map((size) => (
                      <Badge key={size} variant="secondary">{size}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {product.brand && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.brands')}</h4>
                  <span className="text-sm font-medium">
                    {product.brand.name_en}
                    {product.brand.name_ar && ` - ${product.brand.name_ar}`}
                  </span>
                </div>
              )}

              {product.country && (() => {
                const countryData = getCountryByCode(product.country);
                return (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.target_market')}</h4>
                    <span className="text-sm">
                      {countryData ? `${countryData.flag} ${countryData.name}` : product.country}
                    </span>
                  </div>
                );
              })()}

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.packaging_required')}</h4>
                <div className="flex items-center gap-2">
                  {product.needs_packing ? (
                    <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                      <Check className="h-3 w-3 me-1" />{t('common.yes')}
                    </Badge>
                  ) : (
                    <Badge variant="outline"><X className="h-3 w-3 me-1" />{t('common.no')}</Badge>
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.minimum_quantity')}</h4>
                <span className="text-sm font-medium">{product.minimum_quantity ?? 0}</span>
                <p className="text-xs text-muted-foreground mt-0.5">{t('catalog.minimum_quantity_helper')}</p>
              </div>

              {product.categories && product.categories.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('catalog.categories')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {product.categories.map((pc, idx) => pc.category && (
                      <Badge key={pc.category.id || idx} variant="secondary">
                        {language === 'ar' ? (pc.category.name_ar || pc.category.name_en) : pc.category.name_en}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {product.potential_customers && product.potential_customers.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('catalog.potential_customers')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {product.potential_customers.map((pc, idx) => pc.customer && (
                      <Badge key={pc.customer.id || idx} variant="outline">
                        {pc.customer.name}
                        {pc.customer.code && <span className="ms-1 opacity-60">({pc.customer.code})</span>}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {product.created_at && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.created')}</h4>
                  <span className="text-sm text-muted-foreground">{new Date(product.created_at).toLocaleDateString()}</span>
                </div>
              )}

              {/* Quick Product Insights */}
              <div className="border-t pt-4 mt-4">
                <h4 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  {t('catalog.quick_insights')}
                </h4>
                {loadingInsights ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.loading')}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2">
                    <div className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                      <span className="text-sm text-muted-foreground">{t('catalog.total_ordered')}</span>
                      <span className="text-sm font-semibold">{totalOrdered ?? 0}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
