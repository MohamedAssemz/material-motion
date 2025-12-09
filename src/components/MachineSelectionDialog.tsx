import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';

interface Machine {
  id: string;
  name: string;
  type: string;
}

interface MachineSelection {
  machineId: string;
  quantity: number;
}

interface MachineSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (selections: MachineSelection[]) => void;
  totalUnits: number;
  machineType: 'manufacturing' | 'packaging';
}

export function MachineSelectionDialog({
  open,
  onOpenChange,
  onConfirm,
  totalUnits,
  machineType,
}: MachineSelectionDialogProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchMachines();
    }
  }, [open, machineType]);

  const fetchMachines = async () => {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .eq('type', machineType)
        .eq('is_active', true);

      if (error) throw error;
      setMachines(data || []);
    } catch (error) {
      console.error('Error fetching machines:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalAssigned = Array.from(selections.values()).reduce((sum, qty) => sum + qty, 0);
  const remaining = totalUnits - totalAssigned;

  const handleQuantityChange = (machineId: string, quantity: number) => {
    setSelections(prev => {
      const newMap = new Map(prev);
      if (quantity > 0) {
        newMap.set(machineId, Math.min(quantity, totalUnits));
      } else {
        newMap.delete(machineId);
      }
      return newMap;
    });
  };

  const handleConfirm = () => {
    const result: MachineSelection[] = [];
    selections.forEach((quantity, machineId) => {
      if (quantity > 0) {
        result.push({ machineId, quantity });
      }
    });
    onConfirm(result);
    setSelections(new Map());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Machine Production Tracking</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : machines.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No {machineType} machines configured.</p>
            <p className="text-sm">Add machines in the admin panel.</p>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="flex justify-between text-sm">
              <span>Total units to assign:</span>
              <span className="font-bold">{totalUnits}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Remaining:</span>
              <span className={remaining > 0 ? 'text-attention font-bold' : 'text-completed font-bold'}>
                {remaining}
              </span>
            </div>

            <div className="space-y-3 border-t pt-4">
              {machines.map(machine => (
                <div key={machine.id} className="flex items-center gap-4">
                  <Label className="flex-1">{machine.name}</Label>
                  <Input
                    type="number"
                    min="0"
                    max={totalUnits}
                    value={selections.get(machine.id) || ''}
                    onChange={(e) => handleQuantityChange(machine.id, parseInt(e.target.value) || 0)}
                    className="w-24"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={handleConfirm} disabled={machines.length === 0}>
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}