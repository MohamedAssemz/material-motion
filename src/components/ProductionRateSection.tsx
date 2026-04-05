import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NumericInput } from "@/components/ui/numeric-input";
import { Settings, Loader2, PackageX, ChevronDown, ChevronRight, CalendarIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

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
  production_date: string | null;
  needs_boxing?: boolean;
  order_item_id: string | null;
  isExtraBatch?: boolean;
  size?: string | null;
}

interface MachineGroup {
  machineId: string;
  machineName: string;
  qty: number;
  dates: string[];
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
  size?: string | null;
}

interface ProductionRateSectionProps {
  batches: BatchData[];
  machineType: "manufacturing" | "finishing" | "packaging" | "boxing";
  machineColumnName: "manufacturing_machine_id" | "finishing_machine_id" | "packaging_machine_id" | "boxing_machine_id";
  onAssigned: () => void;
  canManage?: boolean;
}

export function ProductionRateSection({
  batches,
  machineType,
  machineColumnName,
  onAssigned,
  canManage = true,
}: ProductionRateSectionProps) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachines, setSelectedMachines] = useState<Map<string, string>>(new Map());
  const [qtyInputs, setQtyInputs] = useState<Map<string, number>>(new Map());
  const [dateInputs, setDateInputs] = useState<Map<string, Date>>(new Map());
  const [assigning, setAssigning] = useState<string | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchMachines = async () => {
      try {
        const { data, error } = await supabase
          .from("machines")
          .select("*")
          .eq("type", machineType)
          .eq("is_active", true)
          .order("name");
        if (error) throw error;
        setMachines(data || []);
      } catch (error) {
        console.error("Error fetching machines:", error);
      }
    };
    fetchMachines();
  }, [machineType]);

  const groups: OrderItemGroup[] = useMemo(() => {
    const groupMap = new Map<string, OrderItemGroup>();

    batches.forEach((batch) => {
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
          size: batch.size,
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

    // Build assignedByMachine for each group with dates
    groupMap.forEach((group) => {
      const machineMap = new Map<string, { qty: number; dates: Set<string> }>();
      batches
        .filter((b) => (b.order_item_id || b.product_id) === group.groupKey && b.machine_id)
        .forEach((b) => {
          const existing = machineMap.get(b.machine_id!) || { qty: 0, dates: new Set<string>() };
          existing.qty += b.quantity;
          if (b.production_date) {
            existing.dates.add(b.production_date);
          }
          machineMap.set(b.machine_id!, existing);
        });

      group.assignedByMachine = Array.from(machineMap.entries()).map(([machineId, data]) => ({
        machineId,
        machineName: machines.find((m) => m.id === machineId)?.name || "Unknown",
        qty: data.qty,
        dates: Array.from(data.dates).sort(),
      }));
    });

    return Array.from(groupMap.values()).sort((a, b) => {
      if (a.unassignedQty > 0 && b.unassignedQty === 0) return -1;
      if (a.unassignedQty === 0 && b.unassignedQty > 0) return 1;
      return a.product_name.localeCompare(b.product_name);
    });
  }, [batches, machines]);

  useEffect(() => {
    const newOpen = new Set<string>();
    groups.forEach((g) => {
      if (g.unassignedQty > 0) newOpen.add(g.groupKey);
    });
    setOpenGroups((prev) => {
      const merged = new Set(prev);
      newOpen.forEach((k) => merged.add(k));
      return merged;
    });
  }, [groups]);

  const handleAssign = async (group: OrderItemGroup) => {
    const machineId = selectedMachines.get(group.groupKey);
    if (!machineId) {
      toast.error("Please select a machine");
      return;
    }

    const requestedQty = qtyInputs.get(group.groupKey) ?? group.unassignedQty;
    if (requestedQty <= 0 || requestedQty > group.unassignedQty) {
      toast.error(`Quantity must be between 1 and ${group.unassignedQty}`);
      return;
    }

    const selectedDate = dateInputs.get(group.groupKey) || new Date();
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    setAssigning(group.groupKey);
    try {
      const extraBatchIds: string[] = [];
      const orderBatchIds: string[] = [];
      group.unassignedBatchIds.forEach((batchId) => {
        const batch = batches.find((b) => b.id === batchId);
        if (batch?.isExtraBatch) {
          extraBatchIds.push(batchId);
        } else {
          orderBatchIds.push(batchId);
        }
      });

      let remainingQty = requestedQty;

      if (orderBatchIds.length > 0 && remainingQty > 0) {
        const orderQty = Math.min(
          remainingQty,
          orderBatchIds.reduce((sum, bid) => {
            const b = batches.find((x) => x.id === bid);
            return sum + (b?.quantity || 0);
          }, 0),
        );
        const { error } = await supabase.rpc("assign_machine_to_batches", {
          p_batch_ids: orderBatchIds,
          p_machine_id: machineId,
          p_machine_column: machineColumnName,
          p_requested_qty: orderQty,
          p_production_date: dateStr,
        });
        if (error) throw error;
        remainingQty -= orderQty;
      }

      if (extraBatchIds.length > 0 && remainingQty > 0) {
        for (const ebId of extraBatchIds) {
          if (remainingQty <= 0) break;
          const { error } = await supabase
            .from("extra_batches")
            .update({ [machineColumnName]: machineId, production_date: dateStr })
            .eq("id", ebId);
          if (error) throw error;
          const b = batches.find((x) => x.id === ebId);
          remainingQty -= b?.quantity || 0;
        }
      }

      toast.success("Machine assigned successfully");
      setSelectedMachines((prev) => {
        const m = new Map(prev);
        m.delete(group.groupKey);
        return m;
      });
      setQtyInputs((prev) => {
        const m = new Map(prev);
        m.delete(group.groupKey);
        return m;
      });
      setDateInputs((prev) => {
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

  const hasNoBoxingItems = machineType === "boxing" && groups.some((g) => !g.needs_boxing);
  if (batches.length === 0 || (machines.length === 0 && !hasNoBoxingItems)) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-primary/20">
        <Settings className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-primary">Production Rate</h3>
        <span className="text-xs text-muted-foreground ml-auto">Assign machines to track production</span>
      </div>

      {groups.map((group) => {
        if (machineType === "boxing" && !group.needs_boxing) {
          return (
            <Card key={group.groupKey} className="border-muted bg-muted/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{group.product_name}{group.size ? ` - ${group.size}` : ''}</p>
                      <Badge variant="secondary" className="bg-muted text-muted-foreground">
                        <PackageX className="h-3 w-3 mr-1" />
                        No Boxing
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {group.product_sku} · Qty: {group.totalQty}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        }

        const isOpen = openGroups.has(group.groupKey);
        const hasAssignments = group.assignedByMachine.length > 0;
        const selectedMachine = selectedMachines.get(group.groupKey) || "";
        const qtyValue = qtyInputs.get(group.groupKey) ?? group.unassignedQty;
        const selectedDate = dateInputs.get(group.groupKey) || new Date();

        return (
          <Collapsible
            key={group.groupKey}
            open={isOpen}
            onOpenChange={(open) => {
              setOpenGroups((prev) => {
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
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 hover:bg-primary/30">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{group.product_name}{group.size ? ` - ${group.size}` : ''}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{group.product_sku}</p>
                    <p className="text-sm text-muted-foreground">
                      Total: {group.totalQty}
                      {group.unassignedQty > 0 && (
                        <span className="text-attention ml-2">· {group.unassignedQty} unassigned</span>
                      )}
                    </p>
                  </div>

                  {group.unassignedQty > 0 && canManage && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <NumericInput
                        min={1}
                        max={group.unassignedQty}
                        value={qtyValue || undefined}
                        onValueChange={(val) => {
                          setQtyInputs((prev) => new Map(prev).set(group.groupKey, val ?? 0));
                        }}
                        className="w-20 h-9"
                      />
                      <Select
                        value={selectedMachine}
                        onValueChange={(val) => setSelectedMachines((prev) => new Map(prev).set(group.groupKey, val))}
                      >
                        <SelectTrigger className="w-40 h-9">
                          <SelectValue placeholder="Select machine" />
                        </SelectTrigger>
                        <SelectContent>
                          {machines.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-9 gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5" />
                            <span className="text-xs">{format(selectedDate, "dd/MM/yyyy")}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={selectedDate}
                            onSelect={(date) => {
                              if (date) setDateInputs((prev) => new Map(prev).set(group.groupKey, date));
                            }}
                            initialFocus
                            className={cn("p-3 pointer-events-auto")}
                          />
                        </PopoverContent>
                      </Popover>
                      <Button
                        size="sm"
                        onClick={() => handleAssign(group)}
                        disabled={!selectedMachine || assigning === group.groupKey}
                      >
                        {assigning === group.groupKey ? <Loader2 className="h-4 w-4 animate-spin" /> : "Assign"}
                      </Button>
                    </div>
                  )}

                  {group.unassignedQty > 0 && !canManage && (
                    <Badge variant="outline" className="text-attention">
                      {group.unassignedQty} unassigned
                    </Badge>
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
                      {group.assignedByMachine.map((mg) => (
                        <div key={mg.machineId} className="flex items-center justify-between py-1.5 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{mg.machineName}</span>
                            {mg.dates.length > 0 && (
                              <span className="text-xs text-muted-foreground/70">
                                · {mg.dates.map(d => format(new Date(d + 'T00:00:00'), "dd/MM/yyyy")).join(", ")}
                              </span>
                            )}
                          </div>
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
