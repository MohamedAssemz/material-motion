import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface Machine {
  id: string;
  name: string;
  type: string;
}

interface BatchData {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  machine_id: string | null;
  needs_boxing?: boolean;
}

interface ProductionRateSectionProps {
  batches: BatchData[];
  machineType: 'manufacturing' | 'finishing' | 'packaging' | 'boxing';
  machineColumnName: 'manufacturing_machine_id' | 'finishing_machine_id' | 'packaging_machine_id' | 'boxing_machine_id';
  onAssigned: () => void;
}

export function ProductionRateSection({
  batches,
  machineType,
  machineColumnName,
  onAssigned,
}: ProductionRateSectionProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [assignments, setAssignments] = useState<Map<string, string>>(new Map());
  const [assigning, setAssigning] = useState<string | null>(null);

  useEffect(() => {
    fetchMachines();
  }, [machineType]);

  const fetchMachines = async () => {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .eq('type', machineType)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setMachines(data || []);
    } catch (error) {
      console.error('Error fetching machines:', error);
    }
  };

  const handleAssign = async (batchId: string) => {
    const machineId = assignments.get(batchId);
    if (!machineId) {
      toast.error('Please select a machine');
      return;
    }

    setAssigning(batchId);
    try {
      const { error } = await supabase
        .from('order_batches')
        .update({ [machineColumnName]: machineId })
        .eq('id', batchId);

      if (error) throw error;

      toast.success('Machine assigned successfully');
      setAssignments(prev => {
        const newMap = new Map(prev);
        newMap.delete(batchId);
        return newMap;
      });
      onAssigned();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAssigning(null);
    }
  };

  if (batches.length === 0 || machines.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-primary/20">
        <Settings className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-primary">
          Production Rate
        </h3>
        <span className="text-xs text-muted-foreground ml-auto">
          Assign machines to track production
        </span>
      </div>

      {batches.map(batch => {
        const machine = machines.find(m => m.id === batch.machine_id);
        const selectedMachineId = assignments.get(batch.id) || batch.machine_id || '';
        
        return (
          <Card key={batch.id} className="border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{batch.product_name}</p>
                    {batch.machine_id ? (
                      <Badge variant="secondary" className="bg-completed/20 text-completed">
                        {machine?.name || 'Assigned'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-attention text-attention">
                        Unassigned
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{batch.product_sku} · Qty: {batch.quantity}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedMachineId}
                    onValueChange={(val) => setAssignments(prev => new Map(prev).set(batch.id, val))}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Select machine" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => handleAssign(batch.id)}
                    disabled={!assignments.get(batch.id) || assigning === batch.id || assignments.get(batch.id) === batch.machine_id}
                  >
                    {assigning === batch.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Assign'
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
