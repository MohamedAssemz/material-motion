/**
 * Shared utilities for displaying batch/product info with size, color, and bilingual names
 */

export interface ProductDisplayInfo {
  name_en: string;
  name_ar?: string | null;
  sku: string;
  color_en?: string | null;
  color_ar?: string | null;
  needs_packing?: boolean;
}

export interface OrderItemDisplayInfo {
  size?: string | null;
  needs_boxing?: boolean;
  is_special?: boolean;
}

/**
 * Build a display label for a product + order item combination
 * Shows: ProductName (SKU) · Size: XL · Color: Red
 */
export function buildGroupDisplayName(
  product: ProductDisplayInfo,
  orderItem?: OrderItemDisplayInfo | null,
  language: 'en' | 'ar' = 'en'
): { primaryName: string; secondaryName?: string; size?: string; color?: string } {
  const primaryName = language === 'ar' 
    ? (product.name_ar || product.name_en) 
    : product.name_en;
  const secondaryName = language === 'ar' 
    ? (product.name_ar ? product.name_en : undefined)
    : (product.name_ar || undefined);
  
  const color = language === 'ar'
    ? (product.color_ar || product.color_en || undefined)
    : (product.color_en || undefined);

  return {
    primaryName,
    secondaryName: secondaryName || undefined,
    size: orderItem?.size || undefined,
    color: color || undefined,
  };
}

/**
 * Build a concise label string for a group (for use in lists, badges, etc.)
 */
export function buildGroupLabel(
  product: ProductDisplayInfo,
  orderItem?: OrderItemDisplayInfo | null,
  language: 'en' | 'ar' = 'en'
): string {
  const { primaryName, size, color } = buildGroupDisplayName(product, orderItem, language);
  const parts = [primaryName];
  if (size) parts.push(`[${size}]`);
  if (color) parts.push(`- ${color}`);
  return parts.join(' ');
}
