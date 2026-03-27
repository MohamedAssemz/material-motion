// Fixed size options for product dropdown
export const SIZE_OPTIONS = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL',
  '2XL', '3XL', '4XL', '5XL', '6XL'
] as const;

export type ProductSize = typeof SIZE_OPTIONS[number];

export function getSizesLabel(sizes: string[] | null | undefined): string {
  if (!sizes || sizes.length === 0) return '';
  // Sort by SIZE_OPTIONS order
  const sorted = [...sizes].sort((a, b) => {
    const ai = SIZE_OPTIONS.indexOf(a as ProductSize);
    const bi = SIZE_OPTIONS.indexOf(b as ProductSize);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return sorted.join(', ');
}
