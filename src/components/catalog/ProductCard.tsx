import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Package, MoreVertical, Eye, Trash2, Copy } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getProductDisplayName, getProductDisplayColor, getBrandDisplayName } from '@/lib/catalogHelpers';
import { getSizeRangeLabel } from '@/lib/catalogConstants';

interface ProductCategory {
  category: {
    id: string;
    name: string;
  } | null;
}

interface ProductImage {
  id: string;
  image_url: string;
  is_main: boolean | null;
  sort_order: number | null;
}

interface ProductBrand {
  id: string;
  name_en: string;
  name_ar?: string | null;
}

export interface ProductCardData {
  id: string;
  sku: string;
  name_en: string;
  name_ar?: string | null;
  description_en: string | null;
  description_ar?: string | null;
  size_from: string | null;
  size_to?: string | null;
  color_en: string | null;
  color_ar?: string | null;
  country: string | null;
  needs_packing: boolean | null;
  brand?: ProductBrand | null;
  categories?: ProductCategory[];
  images?: ProductImage[];
}

interface ProductCardProps {
  product: ProductCardData;
  onClick: () => void;
  onView?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  showMenu?: boolean;
}

export function ProductCard({ 
  product, 
  onClick, 
  onView, 
  onDelete, 
  onDuplicate,
  showMenu = false 
}: ProductCardProps) {
  const { t, language } = useLanguage();
  const mainImage = product.images?.find(img => img.is_main) || product.images?.[0];
  const displayName = getProductDisplayName(product, language);
  const displayColor = getProductDisplayColor(product, language);
  const sizeLabel = getSizeRangeLabel(product.size_from, product.size_to || null);
  
  return (
    <Card 
      className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50 relative"
      onClick={onClick}
    >
      {showMenu && (
        <div className="absolute top-2 end-2 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button 
                variant="secondary" 
                size="icon" 
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onView}>
                <Eye className="me-2 h-4 w-4" />
                {t('catalog.view')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="me-2 h-4 w-4" />
                {t('catalog.duplicate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="me-2 h-4 w-4" />
                {t('common.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      
      <AspectRatio ratio={1}>
        {mainImage ? (
          <img 
            src={mainImage.image_url} 
            alt={displayName}
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Package className="h-16 w-16 text-muted-foreground/40" />
          </div>
        )}
      </AspectRatio>
      
      <CardContent className="p-4 space-y-2">
        <div>
          <h3 className="font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
            {displayName}
          </h3>
          <p className="text-xs font-mono text-muted-foreground">{product.sku}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {sizeLabel && (
            <span>{t('catalog.size')}: <span className="font-medium text-foreground">{sizeLabel}</span></span>
          )}
          {sizeLabel && displayColor && <span className="text-border">|</span>}
          {displayColor && (
            <span>{t('catalog.color')}: <span className="font-medium text-foreground">{displayColor}</span></span>
          )}
        </div>
        
        {product.categories && product.categories.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {product.categories.slice(0, 3).map((pc, idx) => pc.category && (
              <Badge key={pc.category.id || idx} variant="secondary" className="text-xs">
                {pc.category.name}
              </Badge>
            ))}
            {product.categories.filter(pc => pc.category).length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{product.categories.filter(pc => pc.category).length - 3}
              </Badge>
            )}
          </div>
        )}
        
        {product.brand && (
          <p className="text-xs text-muted-foreground">
            {t('catalog.brands')}: <span className="font-medium">{getBrandDisplayName(product.brand, language)}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
