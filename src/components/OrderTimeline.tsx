import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Circle, Clock, AlertTriangle, PlayCircle } from 'lucide-react';
import type { BatchInfo } from './BatchCard';

interface OrderTimelineProps {
  batches: BatchInfo[];
  orderStatus?: string;
}

const STAGES = [
  { key: 'in_manufacturing', label: 'In Manufacturing', icon: Circle },
  { key: 'ready_for_finishing', label: 'Ready for Finishing', icon: CheckCircle },
  { key: 'in_finishing', label: 'In Finishing', icon: Circle },
  { key: 'ready_for_packaging', label: 'Ready for Packaging', icon: CheckCircle },
  { key: 'in_packaging', label: 'In Packaging', icon: Circle },
  { key: 'ready_for_boxing', label: 'Ready for Boxing', icon: CheckCircle },
  { key: 'in_boxing', label: 'In Boxing', icon: Circle },
  { key: 'ready_for_shipment', label: 'Ready for Shipment', icon: CheckCircle },
  { key: 'shipped', label: 'Shipped', icon: CheckCircle },
];

// Stages where items can skip based on product/order_item configuration
const PACKAGING_STAGES = ['ready_for_packaging', 'in_packaging'];
const BOXING_STAGES = ['ready_for_boxing', 'in_boxing'];

export function OrderTimeline({ batches, orderStatus }: OrderTimelineProps) {
  const totalItems = batches.reduce((sum, b) => sum + b.total_quantity, 0);
  
  // Check if order hasn't started
  const isPending = orderStatus === 'pending';

  // Get effective total for a stage
  const getEffectiveTotalForStage = (stageKey: string) => {
    if (PACKAGING_STAGES.includes(stageKey)) {
      return batches.filter(b => b.needs_packing !== false)
        .reduce((sum, b) => sum + b.total_quantity, 0);
    }
    if (BOXING_STAGES.includes(stageKey)) {
      return batches.filter(b => b.needs_boxing !== false)
        .reduce((sum, b) => sum + b.total_quantity, 0);
    }
    return totalItems;
  };

  const getRelevantBatchesForStage = (stageKey: string) => {
    if (PACKAGING_STAGES.includes(stageKey)) {
      return batches.filter(b => b.needs_packing !== false);
    }
    if (BOXING_STAGES.includes(stageKey)) {
      return batches.filter(b => b.needs_boxing !== false);
    }
    return batches;
  };

  const getStageStatus = (stageKey: string) => {
    const relevantBatches = getRelevantBatchesForStage(stageKey);
    const effectiveTotal = getEffectiveTotalForStage(stageKey);
    
    const itemsInStage = relevantBatches
      .filter(b => b.state === stageKey)
      .reduce((sum, b) => sum + b.total_quantity, 0);
    
    const itemsPassedStage = relevantBatches
      .filter(b => {
        const stageIndex = STAGES.findIndex(s => s.key === stageKey);
        const batchStageIndex = STAGES.findIndex(s => s.key === b.state);
        return batchStageIndex > stageIndex;
      })
      .reduce((sum, b) => sum + b.total_quantity, 0);

    const totalPassed = itemsInStage + itemsPassedStage;
    const isLate = relevantBatches.some(b => b.state === stageKey && b.has_late_units);
    const leadTimeDays = relevantBatches.find(b => b.state === stageKey)?.lead_time_days;

    return {
      inProgress: itemsInStage > 0,
      completed: effectiveTotal > 0 && totalPassed === effectiveTotal && itemsInStage === 0,
      total: effectiveTotal,
      current: totalPassed,
      isLate,
      leadTimeDays,
      isApplicable: effectiveTotal > 0,
    };
  };

  if (isPending) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-muted-foreground">
            <PlayCircle className="h-5 w-5" />
            Order Progress
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Clock className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground font-medium">Timeline Inactive</p>
            <p className="text-sm text-muted-foreground mt-1">
              Start the order to begin tracking progress
            </p>
            <div className="mt-4 text-sm">
              <span className="font-medium">{totalItems}</span>
              <span className="text-muted-foreground"> items planned</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-6">
            {STAGES.map((stage) => {
              const status = getStageStatus(stage.key);
              const Icon = stage.icon;
              
              if (!status.isApplicable && (PACKAGING_STAGES.includes(stage.key) || BOXING_STAGES.includes(stage.key))) {
                return (
                  <div key={stage.key} className="relative flex items-start gap-4 opacity-50">
                    <div className="relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2 bg-background border-border text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0 pt-1">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-muted-foreground">{stage.label}</p>
                        <span className="text-sm text-muted-foreground italic">N/A (skipped)</span>
                      </div>
                    </div>
                  </div>
                );
              }
              
              return (
                <div key={stage.key} className="relative flex items-start gap-4">
                  <div className={`
                    relative z-10 flex items-center justify-center w-8 h-8 rounded-full border-2
                    ${status.completed 
                      ? 'bg-primary border-primary text-primary-foreground' 
                      : status.inProgress
                        ? 'bg-background border-primary text-primary'
                        : 'bg-background border-border text-muted-foreground'
                    }
                    ${status.isLate ? 'border-destructive' : ''}
                  `}>
                    <Icon className="h-4 w-4" />
                  </div>
                  
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium ${
                          status.inProgress ? 'text-foreground' : 'text-muted-foreground'
                        }`}>
                          {stage.label}
                        </p>
                        {status.isLate && (
                          <AlertTriangle className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <div className="text-right">
                        <span className="text-sm text-muted-foreground">
                          {status.current}/{status.total} items
                        </span>
                        {status.inProgress && status.leadTimeDays && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Lead time: {status.leadTimeDays} days
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {status.inProgress && (
                      <div className="mt-2 w-full bg-secondary rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full transition-all ${
                            status.isLate ? 'bg-destructive' : 'bg-primary'
                          }`}
                          style={{ width: `${(status.current / status.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
