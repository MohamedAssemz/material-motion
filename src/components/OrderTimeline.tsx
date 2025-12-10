import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, Circle, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';

interface Unit {
  id: string;
  state: string;
  created_at: string;
  stage_eta: Array<{
    stage: string;
    eta: string;
    lead_time_days: number | null;
  }>;
}

interface Order {
  created_at: string;
  units: Unit[];
}

interface OrderTimelineProps {
  order: Order;
}

const STAGES = [
  { key: 'waiting_for_rm', label: 'Waiting for RM', icon: Clock },
  { key: 'in_manufacturing', label: 'Manufacturing', icon: Circle },
  { key: 'manufactured', label: 'Manufactured', icon: CheckCircle },
  { key: 'waiting_for_pm', label: 'Waiting for PM', icon: Clock },
  { key: 'in_packaging', label: 'Packaging', icon: Circle },
  { key: 'packaged', label: 'Packaged', icon: CheckCircle },
  { key: 'waiting_for_bm', label: 'Waiting for BM', icon: Clock },
  { key: 'in_boxing', label: 'Boxing', icon: Circle },
  { key: 'boxed', label: 'Boxed', icon: CheckCircle },
  { key: 'qced', label: 'QC Complete', icon: CheckCircle },
  { key: 'finished', label: 'Finished', icon: CheckCircle },
];

export function OrderTimeline({ order }: OrderTimelineProps) {
  const getStageStatus = (stageKey: string) => {
    const unitsInStage = order.units.filter(u => u.state === stageKey).length;
    const unitsPassedStage = order.units.filter(u => {
      const stageIndex = STAGES.findIndex(s => s.key === stageKey);
      const unitStageIndex = STAGES.findIndex(s => s.key === u.state);
      return unitStageIndex > stageIndex;
    }).length;

    const totalPassed = unitsInStage + unitsPassedStage;
    const isLate = order.units.some(u => {
      const stageEta = u.stage_eta.find(eta => eta.stage === stageKey);
      return stageEta && new Date(stageEta.eta) < new Date() && u.state === stageKey;
    });

    return {
      inProgress: unitsInStage > 0,
      completed: totalPassed === order.units.length && unitsInStage === 0,
      total: order.units.length,
      current: totalPassed,
      isLate
    };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Order Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
          <div className="space-y-6">
            {STAGES.map((stage, index) => {
              const status = getStageStatus(stage.key);
              const Icon = stage.icon;
              
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
                          {status.current}/{status.total} units
                        </span>
                        {status.inProgress && order.units.some(u => {
                          const stageEta = u.stage_eta.find(eta => eta.stage === stage.key);
                          return stageEta?.lead_time_days;
                        }) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Lead time: {order.units.find(u => {
                              const stageEta = u.stage_eta.find(eta => eta.stage === stage.key);
                              return stageEta?.lead_time_days;
                            })?.stage_eta.find(eta => eta.stage === stage.key)?.lead_time_days} days
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
