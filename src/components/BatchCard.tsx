import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';

export interface BatchInfo {
  id: string;
  batch_code: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  state: UnitState;
  total_quantity: number;
  earliest_eta?: string;
  has_late_units: boolean;
  lead_time_days?: number;
  needs_packing?: boolean; // Product-level: whether this product needs packaging phase
  needs_boxing?: boolean;  // Order-item-level: whether this item needs boxing phase
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
      'in_manufacturing': 'bg-blue-500',
      'ready_for_finishing': 'bg-blue-300',
      'in_finishing': 'bg-purple-500',
      'ready_for_packaging': 'bg-orange-500',
      'in_packaging': 'bg-indigo-500',
      'ready_for_boxing': 'bg-cyan-300',
      'in_boxing': 'bg-cyan-500',
      'ready_for_shipment': 'bg-teal-300',
      'shipped': 'bg-green-500',
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

          <p className="text-xs text-muted-foreground font-mono">{batch.batch_code}</p>

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
              <Label htmlFor={`qty-${batch.id}`} className="text-xs">
                Select Qty
              </Label>
              <Input
                id={`qty-${batch.id}`}
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