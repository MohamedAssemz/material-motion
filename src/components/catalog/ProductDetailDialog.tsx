import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Package, Edit, Check, X } from 'lucide-react';
import { useState } from 'react';
import { ProductCardData } from './ProductCard';
import { useLanguage } from '@/contexts/LanguageContext';
import { getProductDisplayName, getProductDisplayColor, getProductDisplayDescription, getBrandDisplayName } from '@/lib/catalogHelpers';
import { getSizeRangeLabel } from '@/lib/catalogConstants';

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
  
  if (!product) return null;

  const displayName = getProductDisplayName(product, language);
  const displayDescription = getProductDisplayDescription(product, language);
  const displayColor = getProductDisplayColor(product, language);
  const sizeLabel = getSizeRangeLabel(product.size_from, product.size_to || null);
  const mainImageIndex = product.images?.findIndex(img => img.is_main) ?? 0;
  const currentImage = product.images?.[selectedImageIndex] || product.images?.[mainImageIndex];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-start justify-between">
          <div>
            <DialogTitle className="text-xl">{displayName}</DialogTitle>
            <p className="text-sm font-mono text-muted-foreground">{product.sku}</p>
          </div>
          {onEdit && (
            <Button variant="outline" size="sm" onClick={() => onEdit(product)}>
              <Edit className="h-4 w-4 me-2" />
              {t('catalog.edit')}
            </Button>
          )}
        </DialogHeader>
        
        <ScrollArea className="flex-1">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Image Gallery */}
            <div className="space-y-3">
              <AspectRatio ratio={1} className="bg-muted rounded-lg overflow-hidden">
                {currentImage ? (
                  <img src={currentImage.image_url} alt={displayName} className="h-full w-full object-cover" />
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
              {/* Bilingual Names */}
              {product.name_ar && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.english_name')}</h4>
                    <p className="text-sm font-medium">{product.name_en}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.arabic_name')}</h4>
                    <p className="text-sm font-medium" dir="rtl">{product.name_ar}</p>
                  </div>
                </div>
              )}

              {displayDescription && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.description')}</h4>
                  <p className="text-sm">{displayDescription}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {sizeLabel && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.size')}</h4>
                    <Badge variant="secondary">{sizeLabel}</Badge>
                  </div>
                )}
                {displayColor && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.color')}</h4>
                    <span className="text-sm font-medium">{displayColor}</span>
                  </div>
                )}
              </div>

              {product.brand && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.brands')}</h4>
                  <span className="text-sm font-medium">{getBrandDisplayName(product.brand, language)}</span>
                </div>
              )}

              {product.country && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">{t('catalog.target_market')}</h4>
                  <span className="text-sm">{product.country}</span>
                </div>
              )}

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

              {product.categories && product.categories.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('catalog.categories')}</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {product.categories.map((pc, idx) => pc.category && (
                      <Badge key={pc.category.id || idx} variant="secondary">{pc.category.name}</Badge>
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
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
