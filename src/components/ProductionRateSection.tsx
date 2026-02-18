import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Settings, Loader2, PackageX, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';

interface Machine {
  id: string;
  name: string;
  type: string;
}

export interface BatchData {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  machine_id: string | null;
  needs_boxing?: boolean;
  order_item_id: string | null;
}

interface MachineGroup {
  machineId: string;
  machineName: string;
  qty: number;
}

interface OrderItemGroup {
  groupKey: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  totalQty: number;
  unassignedQty: number;
  unassignedBatchIds: string[];
  assignedByMachine: MachineGroup[];
  needs_boxing: boolean;
  allBatchIds: string[];
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
  const [selectedMachines, setSelectedMachines] = useState<Map<string, string>>(new Map());
  const [qtyInputs, setQtyInputs] = useState<Map<string, number>>(new Map());
  const [assigning, setAssigning] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
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
    fetchMachines();
  }, [machineType]);

  // Group batches by order_item_id (fallback to product_id)
  const groups: OrderItemGroup[] = useMemo(() => {
    const groupMap = new Map<string, OrderItemGroup>();

    batches.forEach(batch => {
      const needsBoxing = batch.needs_boxing ?? true;
      const groupKey = batch.order_item_id || batch.product_id;

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          groupKey,
          product_id: batch.product_id,
          product_name: batch.product_name,
          product_sku: batch.product_sku,
          totalQty: 0,
          unassignedQty: 0,
          unassignedBatchIds: [],
          assignedByMachine: [],
          needs_boxing: needsBoxing,
          allBatchIds: [],
        });
      }

      const group = groupMap.get(groupKey)!;
      group.totalQty += batch.quantity;
      group.allBatchIds.push(batch.id);

      if (!batch.machine_id) {
        group.unassignedQty += batch.quantity;
        group.unassignedBatchIds.push(batch.id);
      }
    });

    // Build assignedByMachine for each group
    groupMap.forEach((group) => {
      const machineMap = new Map<string, { qty: number }>();
      batches
        .filter(b => (b.order_item_id || b.product_id) === group.groupKey && b.machine_id)
        .forEach(b => {
          const existing = machineMap.get(b.machine_id!) || { qty: 0 };
          existing.qty += b.quantity;
          machineMap.set(b.machine_id!, existing);
        });

      group.assignedByMachine = Array.from(machineMap.entries()).map(([machineId, data]) => ({
        machineId,
        machineName: machines.find(m => m.id === machineId)?.name || 'Unknown',
        qty: data.qty,
      }));
    });

    return Array.from(groupMap.values()).sort((a, b) => {
      // Unassigned first
      if (a.unassignedQty > 0 && b.unassignedQty === 0) return -1;
      if (a.unassignedQty === 0 && b.unassignedQty > 0) return 1;
      return a.product_name.localeCompare(b.product_name);
    });
  }, [batches, machines]);

  // Auto-expand groups with unassigned items
  useEffect(() => {
    const newOpen = new Set<string>();
    groups.forEach(g => {
      if (g.unassignedQty > 0) newOpen.add(g.groupKey);
    });
    setOpenGroups(prev => {
      const merged = new Set(prev);
      newOpen.forEach(k => merged.add(k));
      return merged;
    });
  }, [groups]);

  const handleAssign = async (group: OrderItemGroup) => {
    const machineId = selectedMachines.get(group.groupKey);
    if (!machineId) {
      toast.error('Please select a machine');
      return;
    }

    const requestedQty = qtyInputs.get(group.groupKey) ?? group.unassignedQty;
    if (requestedQty <= 0 || requestedQty > group.unassignedQty) {
      toast.error(`Quantity must be between 1 and ${group.unassignedQty}`);
      return;
    }

    setAssigning(group.groupKey);
    try {
      // Get unassigned batches for this group, sorted ascending by quantity
      const unassignedBatches = batches
        .filter(b => group.unassignedBatchIds.includes(b.id))
        .sort((a, b) => a.quantity - b.quantity);

      let remaining = requestedQty;
      const fullyAssignIds: string[] = [];
      let splitBatch: { id: string; assignQty: number; remainderQty: number } | null = null;

      for (const batch of unassignedBatches) {
        if (remaining <= 0) break;

        if (batch.quantity <= remaining) {
          fullyAssignIds.push(batch.id);
          remaining -= batch.quantity;
        } else {
          // Partial split needed
          splitBatch = {
            id: batch.id,
            assignQty: remaining,
            remainderQty: batch.quantity - remaining,
          };
          remaining = 0;
        }
      }

      // Fully assign batches
      if (fullyAssignIds.length > 0) {
        const { error } = await supabase
          .from('order_batches')
          .update({ [machineColumnName]: machineId })
          .in('id', fullyAssignIds);
        if (error) throw error;
      }

      // Handle partial split
      if (splitBatch) {
        // Get the original batch to copy fields
        const originalBatch = batches.find(b => b.id === splitBatch!.id)!;

        // Update original batch with assigned portion
        const { error: updateErr } = await supabase
          .from('order_batches')
          .update({
            quantity: splitBatch.assignQty,
            [machineColumnName]: machineId,
          })
          .eq('id', splitBatch.id);
        if (updateErr) throw updateErr;

        // Get full batch row for the insert
        const { data: fullBatch, error: fetchErr } = await supabase
          .from('order_batches')
          .select('*')
          .eq('id', splitBatch.id)
          .single();
        if (fetchErr) throw fetchErr;

        // Insert remainder batch (no machine)
        const { error: insertErr } = await supabase
          .from('order_batches')
          .insert({
            order_id: fullBatch.order_id,
            product_id: fullBatch.product_id,
            order_item_id: fullBatch.order_item_id,
            current_state: fullBatch.current_state,
            quantity: splitBatch.remainderQty,
            [machineColumnName]: null,
            created_by: fullBatch.created_by,
            eta: fullBatch.eta,
            lead_time_days: fullBatch.lead_time_days,
          });
        if (insertErr) throw insertErr;
      }

      toast.success('Machine assigned successfully');
      setSelectedMachines(prev => {
        const m = new Map(prev);
        m.delete(group.groupKey);
        return m;
      });
      setQtyInputs(prev => {
        const m = new Map(prev);
        m.delete(group.groupKey);
        return m;
      });
      onAssigned();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setAssigning(null);
    }
  };

  const hasNoBoxingItems = machineType === 'boxing' && groups.some(g => !g.needs_boxing);
  if (batches.length === 0 || (machines.length === 0 && !hasNoBoxingItems)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-primary/20">
        <Settings className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-primary">Production Rate</h3>
        <span className="text-xs text-muted-foreground ml-auto">
          Assign machines to track production
        </span>
      </div>

      {groups.map(group => {
        // Static "No Boxing" card
        if (machineType === 'boxing' && !group.needs_boxing) {
          return (
            <Card key={group.groupKey} className="border-muted bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{group.product_name}</p>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        <PackageX className="h-3 w-3 mr-1" />
                        No Boxing
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{group.product_sku} · Qty: {group.totalQty}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }

        const isOpen = openGroups.has(group.groupKey);
        const hasAssignments = group.assignedByMachine.length > 0;
        const selectedMachine = selectedMachines.get(group.groupKey) || '';
        const qtyValue = qtyInputs.get(group.groupKey) ?? group.unassignedQty;

        return (
          <Collapsible
            key={group.groupKey}
            open={isOpen}
            onOpenChange={(open) => {
              setOpenGroups(prev => {
                const next = new Set(prev);
                if (open) next.add(group.groupKey);
                else next.delete(group.groupKey);
                return next;
              });
            }}
          >
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{group.product_name}</p>
                      <Badge variant="secondary">{group.product_sku}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Total: {group.totalQty}
                      {group.unassignedQty > 0 && (
                        <span className="text-attention ml-2">· {group.unassignedQty} unassigned</span>
                      )}
                    </p>
                  </div>

                  {group.unassignedQty > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <Input
                        type="number"
                        min={1}
                        max={group.unassignedQty}
                        value={qtyValue}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 0;
                          setQtyInputs(prev => new Map(prev).set(group.groupKey, val));
                        }}
                        className="w-20 h-9"
                      />
                      <Select
                        value={selectedMachine}
                        onValueChange={(val) => setSelectedMachines(prev => new Map(prev).set(group.groupKey, val))}
                      >
                        <SelectTrigger className="w-40 h-9">
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
                        onClick={() => handleAssign(group)}
                        disabled={!selectedMachine || assigning === group.groupKey}
                      >
                        {assigning === group.groupKey ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Assign'
                        )}
                      </Button>
                    </div>
                  )}

                  {group.unassignedQty === 0 && (
                    <Badge variant="secondary" className="bg-completed/20 text-completed">
                      Fully Assigned
                    </Badge>
                  )}
                </div>

                {/* Collapsible sub-entries */}
                <CollapsibleContent>
                  {hasAssignments ? (
                    <div className="ml-8 space-y-1 pt-1 border-t border-primary/10">
                      {group.assignedByMachine.map(mg => (
                        <div key={mg.machineId} className="flex items-center justify-between py-1.5 text-sm">
                          <span className="text-muted-foreground">{mg.machineName}</span>
                          <Badge variant="outline">{mg.qty}</Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="ml-8 text-sm text-muted-foreground italic pt-1">No assignments yet</p>
                  )}
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        );
      })}
    </div>
  );
}
