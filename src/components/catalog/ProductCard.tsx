import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Package } from 'lucide-react';

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
  name: string;
}

export interface ProductCardData {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  size: string | null;
  color: string | null;
  country: string | null;
  needs_packing: boolean | null;
  brand?: ProductBrand | null;
  categories?: ProductCategory[];
  images?: ProductImage[];
}

interface ProductCardProps {
  product: ProductCardData;
  onClick: () => void;
}

export function ProductCard({ product, onClick }: ProductCardProps) {
  const mainImage = product.images?.find(img => img.is_main) || product.images?.[0];
  
  return (
    <Card 
      className="group cursor-pointer overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
      onClick={onClick}
    >
      <AspectRatio ratio={1}>
        {mainImage ? (
          <img 
            src={mainImage.image_url} 
            alt={product.name}
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
            {product.name}
          </h3>
          <p className="text-xs font-mono text-muted-foreground">{product.sku}</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {product.size && (
            <span>Size: <span className="font-medium text-foreground">{product.size}</span></span>
          )}
          {product.size && product.color && <span className="text-border">|</span>}
          {product.color && (
            <span>Color: <span className="font-medium text-foreground">{product.color}</span></span>
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
            Brand: <span className="font-medium">{product.brand.name}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
