import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface Unit {
  id: string;
  serial_no: string | null;
  state: string;
  created_at: string;
  product: {
    name: string;
    sku: string;
  };
  stage_eta: Array<{
    stage: string;
    eta: string;
    lead_time_days: number | null;
  }>;
}

interface UnitCardProps {
  unit: Unit;
  isSelected: boolean;
  onSelect: (unitId: string) => void;
  isLate: boolean;
  canUpdate: boolean;
}

export function UnitCard({ unit, isSelected, onSelect, isLate, canUpdate }: UnitCardProps) {
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

  const currentEta = unit.stage_eta.find(eta => eta.stage === unit.state);

  return (
    <Card className={`transition-all ${isSelected ? 'ring-2 ring-primary' : ''} ${isLate ? 'border-destructive' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {canUpdate && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onSelect(unit.id)}
            />
          )}
          
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold">
                  {unit.serial_no || `Unit ${unit.id.slice(0, 8)}`}
                </h3>
                {isLate && (
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                )}
              </div>
              <Badge className={getStatusColor(unit.state)}>
                {unit.state.replace(/_/g, ' ').toUpperCase()}
              </Badge>
            </div>
            
            <div className="text-sm text-muted-foreground">
              <p>{unit.product.name} ({unit.product.sku})</p>
              <p>Created: {format(new Date(unit.created_at), 'PPp')}</p>
              {currentEta && (
                <div className="space-y-1 mt-1">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span className={isLate ? 'text-destructive font-medium' : ''}>
                      ETA: {format(new Date(currentEta.eta), 'PPp')}
                      {isLate && ' (LATE)'}
                    </span>
                  </div>
                  {currentEta.lead_time_days && (
                    <div className="text-xs ml-4">
                      Lead time: {currentEta.lead_time_days} days
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
