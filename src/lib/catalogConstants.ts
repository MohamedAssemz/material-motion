// Fixed size options for product dropdown
export const SIZE_OPTIONS = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL',
  '2XL', '3XL', '4XL', '5XL', '6XL'
] as const;

export type ProductSize = typeof SIZE_OPTIONS[number];
