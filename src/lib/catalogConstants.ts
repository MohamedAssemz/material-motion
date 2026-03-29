import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

// Fallback size options (used when DB is unavailable)
export const SIZE_OPTIONS = [
  'XXS', 'XS', 'S', 'M', 'L', 'XL',
  '2XL', '3XL', '4XL', '5XL', '6XL',
  '5cm', '6cm', '7.5cm', '8cm', '10cm', '12cm', '15cm', '20cm',
  'Size 3', 'Size 4', 'Size 5', 'Size 6', 'Size 7', 'Size 8', 'Size 9', 'Size 10',
  'Kids', 'Family', 'One Size',
] as const;

export type ProductSize = string;

export interface SizeOption {
  id: string;
  label: string;
  sort_order: number;
}

export function useDynamicSizes() {
  const [sizes, setSizes] = useState<SizeOption[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSizes = async () => {
    try {
      const { data, error } = await supabase
        .from('product_sizes')
        .select('id, label, sort_order')
        .order('sort_order');
      if (error) throw error;
      setSizes(data || []);
    } catch {
      // Fallback to hardcoded
      setSizes(SIZE_OPTIONS.map((label, i) => ({ id: label, label, sort_order: i })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSizes();
  }, []);

  return { sizes, loading, refetch: fetchSizes };
}

export function getSizesLabel(sizes: string[] | null | undefined, allSizes?: SizeOption[]): string {
  if (!sizes || sizes.length === 0) return '';
  if (allSizes && allSizes.length > 0) {
    const orderMap = new Map(allSizes.map(s => [s.label, s.sort_order]));
    const sorted = [...sizes].sort((a, b) => {
      const ai = orderMap.get(a) ?? 999;
      const bi = orderMap.get(b) ?? 999;
      return ai - bi;
    });
    return sorted.join(', ');
  }
  // Fallback sort
  const sorted = [...sizes].sort((a, b) => {
    const ai = (SIZE_OPTIONS as readonly string[]).indexOf(a);
    const bi = (SIZE_OPTIONS as readonly string[]).indexOf(b);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return sorted.join(', ');
}
