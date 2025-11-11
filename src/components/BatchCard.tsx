import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';

interface BatchInfo {
  product_id: string;
  product_name: string;
  product_sku: string;
  state: UnitState;
  total_quantity: number;
  unit_ids: string[];
  earliest_eta?: string;
  latest_eta?: string;
  has_late_units: boolean;
  lead_time_days?: number;
}

interface BatchCardProps {
  batch: BatchInfo;
  selectedQuantity: number;
  onQuantityChange: (quantity: number) => void;
  canUpdate: boolean;
}

export function BatchCard({ batch, selectedQuantity, onQuantityChange, canUpdate }: BatchCardProps) {
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      'waiting_for_rm': 'bg-yellow-500',
      'manufacturing': 'bg-blue-500',
      'waiting_for_packaging_material': 'bg-orange-500',
      'packaging': 'bg-indigo-500',
      'waiting_for_boxing_material': 'bg-orange-500',
      'boxing': 'bg-cyan-500',
      'waiting_for_receiving': 'bg-amber-500',
      'received': 'bg-teal-500',
      'finished': 'bg-green-500',
    };
    return colors[status] || 'bg-gray-500';
  };

  const handleQuantityChange = (value: string) => {
    const qty = parseInt(value) || 0;
    const clamped = Math.max(0, Math.min(qty, batch.total_quantity));
    onQuantityChange(clamped);
  };

  return (
    <Card className={`transition-all ${selectedQuantity > 0 ? 'ring-2 ring-primary' : ''} ${batch.has_late_units ? 'border-destructive' : ''}`}>
      <CardContent className="p-3">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge className={getStatusColor(batch.state)}>
                {getStateLabel(batch.state)}
              </Badge>
              {batch.has_late_units && (
                <AlertTriangle className="h-3 w-3 text-destructive" />
              )}
            </div>
            <p className="text-sm font-medium">Qty: {batch.total_quantity}</p>
          </div>

          {(batch.earliest_eta || batch.lead_time_days) && (
            <div className="text-xs text-muted-foreground space-y-1">
              {batch.earliest_eta && (
                <div className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span className={batch.has_late_units ? 'text-destructive font-medium' : ''}>
                    ETA: {format(new Date(batch.earliest_eta), 'Pp')}
                    {batch.has_late_units && ' (LATE)'}
                  </span>
                </div>
              )}
              {batch.lead_time_days && (
                <div className="ml-4">
                  Lead time: {batch.lead_time_days} days
                </div>
              )}
            </div>
          )}

          {canUpdate && (
            <div>
              <Label htmlFor={`qty-${batch.product_id}-${batch.state}`} className="text-xs">
                Select Qty
              </Label>
              <Input
                id={`qty-${batch.product_id}-${batch.state}`}
                type="number"
                min="0"
                max={batch.total_quantity}
                value={selectedQuantity || ''}
                onChange={(e) => handleQuantityChange(e.target.value)}
                placeholder="0"
                className="mt-1 h-8"
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
