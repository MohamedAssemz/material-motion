import { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArchiveRestore } from 'lucide-react';

interface RetrievedBatch {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  order_item_id?: string | null;
}

interface RetrievedFromExtraSectionProps {
  batches: RetrievedBatch[];
}

export function RetrievedFromExtraSection({ batches }: RetrievedFromExtraSectionProps) {
  const groups = useMemo(() => {
    const map = new Map<string, {
      product_id: string;
      product_name: string;
      product_sku: string;
      totalQty: number;
    }>();

    batches.forEach(b => {
      const key = b.order_item_id || b.product_id;
      const existing = map.get(key);
      if (existing) {
        existing.totalQty += b.quantity;
      } else {
        map.set(key, {
          product_id: b.product_id,
          product_name: b.product_name,
          product_sku: b.product_sku,
          totalQty: b.quantity,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.product_name.localeCompare(b.product_name));
  }, [batches]);

  if (groups.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-purple-300 dark:border-purple-700">
        <ArchiveRestore className="h-4 w-4 text-purple-600 dark:text-purple-400" />
        <h3 className="text-sm font-semibold text-purple-600 dark:text-purple-400">Retrieved from Extra Inventory</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          Items retrieved from surplus stock
        </span>
      </div>

      {groups.map((group, idx) => (
        <Card key={`${group.product_id}-${idx}`} className="border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-950/20">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate">{group.product_name}</p>
                  <Badge variant="secondary">{group.product_sku}</Badge>
                </div>
              </div>
              <Badge variant="outline">{group.totalQty}</Badge>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
