import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';
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

  // Group batches by product
  const groupedByProduct = new Map<string, {
    product_id: string;
    product_name: string;
    product_sku: string;
    batches: BatchData[];
    totalQty: number;
    assignedQty: number;
    needs_boxing?: boolean;
  }>();

  batches.forEach(batch => {
    const key = `${batch.product_id}-${batch.needs_boxing ?? true}`;
    if (!groupedByProduct.has(key)) {
      groupedByProduct.set(key, {
        product_id: batch.product_id,
        product_name: batch.product_name,
        product_sku: batch.product_sku,
        batches: [],
        totalQty: 0,
        assignedQty: 0,
        needs_boxing: batch.needs_boxing,
      });
    }
    const group = groupedByProduct.get(key)!;
    group.batches.push(batch);
    group.totalQty += batch.quantity;
    if (batch.machine_id) {
      group.assignedQty += batch.quantity;
    }
  });

  const groups = Array.from(groupedByProduct.values());

  if (batches.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-blue-200 dark:border-blue-900">
        <Settings className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-semibold text-blue-700 dark:text-blue-400">
          Production Rate
        </h3>
      </div>

      {machines.length === 0 ? (
        <Card className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4 text-center text-muted-foreground">
            <p>No {machineType} machines configured.</p>
            <p className="text-sm">Add machines in the Machines page.</p>
          </CardContent>
        </Card>
      ) : (
        groups.map(group => (
          <Card key={`${group.product_id}-${group.needs_boxing}`} className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{group.product_name}</p>
                    {group.needs_boxing !== undefined && (
                      group.needs_boxing ? (
                        <Badge variant="outline" className="text-xs bg-primary/10">Boxing</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">No Boxing</Badge>
                      )
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{group.totalQty} total</Badge>
                  {group.assignedQty === group.totalQty ? (
                    <Badge className="bg-green-600 hover:bg-green-700 text-white">All assigned</Badge>
                  ) : group.assignedQty > 0 ? (
                    <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">{group.assignedQty} assigned</Badge>
                  ) : (
                    <Badge variant="outline" className="border-yellow-500 text-yellow-600">Unassigned</Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {group.batches.map(batch => {
                  const assignedMachine = machines.find(m => m.id === batch.machine_id);
                  
                  return (
                    <div key={batch.id} className="flex items-center justify-between p-2 bg-background/50 rounded border">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">{batch.quantity} units</Badge>
                        {assignedMachine ? (
                          <Badge className="bg-green-600 text-white text-xs">{assignedMachine.name}</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs border-yellow-500 text-yellow-600">Unassigned</Badge>
                        )}
                      </div>
                      {!batch.machine_id && (
                        <div className="flex items-center gap-2">
                          <Select
                            value={assignments.get(batch.id) || ''}
                            onValueChange={(val) => setAssignments(prev => new Map(prev).set(batch.id, val))}
                          >
                            <SelectTrigger className="w-32 h-8">
                              <SelectValue placeholder="Machine" />
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
                            disabled={!assignments.get(batch.id) || assigning === batch.id}
                          >
                            Assign
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
