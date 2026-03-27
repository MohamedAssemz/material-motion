import type { Language } from '@/lib/translations';

/** Returns the display name for a product based on current language */
export function getProductDisplayName(
  product: { name_en?: string; name_ar?: string | null } | null | undefined,
  language: Language
): string {
  if (!product) return 'Unknown';
  if (language === 'ar' && product.name_ar) return product.name_ar;
  return product.name_en || 'Unknown';
}

/** Returns the display color for a product based on current language */
export function getProductDisplayColor(
  product: { color_en?: string | null; color_ar?: string | null } | null | undefined,
  language: Language
): string {
  if (!product) return '';
  if (language === 'ar' && product.color_ar) return product.color_ar;
  return product.color_en || '';
}

/** Returns the display description for a product based on current language */
export function getProductDisplayDescription(
  product: { description_en?: string | null; description_ar?: string | null } | null | undefined,
  language: Language
): string {
  if (!product) return '';
  if (language === 'ar' && product.description_ar) return product.description_ar;
  return product.description_en || '';
}

/** Returns the display name for a brand based on current language */
export function getBrandDisplayName(
  brand: { name_en?: string; name_ar?: string | null } | null | undefined,
  language: Language
): string {
  if (!brand) return '';
  if (language === 'ar' && brand.name_ar) return brand.name_ar;
  return brand.name_en || '';
}
