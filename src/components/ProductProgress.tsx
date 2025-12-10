import { Progress } from '@/components/ui/progress';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';

interface StateCount {
  state: UnitState;
  count: number;
}

interface ProductProgressProps {
  totalUnits: number;
  stateCounts: StateCount[];
}

const STATE_COLORS: Record<string, string> = {
  'waiting_for_rm': 'bg-yellow-500',
  'in_manufacturing': 'bg-blue-500',
  'manufactured': 'bg-blue-400',
  'waiting_for_pm': 'bg-orange-500',
  'in_packaging': 'bg-indigo-500',
  'packaged': 'bg-indigo-400',
  'waiting_for_bm': 'bg-orange-500',
  'in_boxing': 'bg-cyan-500',
  'boxed': 'bg-cyan-400',
  'qced': 'bg-teal-500',
  'finished': 'bg-green-500',
};

export function ProductProgress({ totalUnits, stateCounts }: ProductProgressProps) {
  return (
    <div className="space-y-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {stateCounts.map((sc, idx) => {
          const percentage = (sc.count / totalUnits) * 100;
          const colorClass = STATE_COLORS[sc.state] || 'bg-gray-500';
          
          return (
            <div
              key={`${sc.state}-${idx}`}
              className={`${colorClass} transition-all`}
              style={{ width: `${percentage}%` }}
              title={`${getStateLabel(sc.state)}: ${sc.count}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {stateCounts.map((sc, idx) => (
          <div key={`label-${sc.state}-${idx}`} className="flex items-center gap-1">
            <div className={`h-2 w-2 rounded-full ${STATE_COLORS[sc.state] || 'bg-gray-500'}`} />
            <span className="text-muted-foreground">
              {getStateLabel(sc.state)}: {sc.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
