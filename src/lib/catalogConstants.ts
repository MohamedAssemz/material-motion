// Fixed size options for product dropdown
export const SIZE_OPTIONS = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL',
  '2XL', '3XL', '4XL', '5XL', '6XL'
] as const;

export type ProductSize = typeof SIZE_OPTIONS[number];

export function getSizeIndex(size: string): number {
  return SIZE_OPTIONS.indexOf(size as ProductSize);
}

export function isValidSizeRange(from: string, to: string): boolean {
  const fromIdx = getSizeIndex(from);
  const toIdx = getSizeIndex(to);
  return fromIdx >= 0 && toIdx >= 0 && fromIdx <= toIdx;
}

export function getSizeRangeLabel(from: string | null, to: string | null): string {
  if (!from && !to) return '';
  if (from && !to) return from;
  if (!from && to) return to;
  if (from === to) return from!;
  return `${from} - ${to}`;
}
