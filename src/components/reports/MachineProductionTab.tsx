import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend } from "recharts";
import { CalendarIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { format, subDays, startOfDay, isWithinInterval, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

/* ─── types ─── */
interface FlatRecord {
  machine_id: string;
  type: string;
  quantity: number;
  date: string; // ISO
}
interface Machine {
  id: string;
  name: string;
  type: string;
}

type DurationPreset = "today" | "week" | "30days" | "90days" | "custom";

const DURATION_LABELS: Record<DurationPreset, string> = {
  today: "Today",
  week: "This Week",
  "30days": "Last 30 Days",
  "90days": "Last 90 Days",
  custom: "Custom Range",
};

const MACHINE_TYPE_COLORS: Record<string, string> = {
  manufacturing: "hsl(214, 95%, 36%)",
  finishing: "hsl(270, 60%, 50%)",
  packaging: "hsl(240, 50%, 55%)",
  boxing: "hsl(190, 80%, 40%)",
};

const MACHINE_TYPE_BADGE: Record<string, string> = {
  manufacturing: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  finishing: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  packaging: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  boxing: "bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300",
};

const PHASE_COLUMNS = [
  { col: "manufacturing_machine_id", type: "manufacturing" },
  { col: "finishing_machine_id", type: "finishing" },
  { col: "packaging_machine_id", type: "packaging" },
  { col: "boxing_machine_id", type: "boxing" },
] as const;

function flattenBatches(batches: any[], dateField: string): FlatRecord[] {
  const results: FlatRecord[] = [];
  for (const b of batches) {
    for (const { col, type } of PHASE_COLUMNS) {
      const machineId = b[col];
      // Skip machine assignments for batches that were retrieved from extra inventory at this phase
      if (machineId && b.from_extra_state !== `extra_${type}`) {
        results.push({ machine_id: machineId, type, quantity: b.quantity || 1, date: b[dateField] });
      }
    }
  }
  return results;
}

function getDateRange(preset: DurationPreset, customFrom?: Date, customTo?: Date): { from: Date; to: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: now };
    case "week":
      return { from: startOfDay(subDays(now, 7)), to: now };
    case "30days":
      return { from: startOfDay(subDays(now, 30)), to: now };
    case "90days":
      return { from: startOfDay(subDays(now, 90)), to: now };
    case "custom":
      return { from: customFrom || startOfDay(subDays(now, 30)), to: customTo || now };
  }
}

export function MachineProductionTab() {
  const [allRecords, setAllRecords] = useState<FlatRecord[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [duration, setDuration] = useState<DurationPreset>("30days");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [fromOpen, setFromOpen] = useState(false);
  const [toOpen, setToOpen] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const [orderBatchesRes, extraBatchesRes, machinesRes] = await Promise.all([
        supabase
          .from("order_batches")
          .select(
            "manufacturing_machine_id, finishing_machine_id, packaging_machine_id, boxing_machine_id, quantity, updated_at, from_extra_state",
          ),
        supabase
          .from("extra_batches")
          .select(
            "manufacturing_machine_id, finishing_machine_id, packaging_machine_id, boxing_machine_id, quantity, updated_at",
          ),
        supabase.from("machines").select("id, name, type"),
      ]);
      const flat = [
        ...flattenBatches(orderBatchesRes.data || [], "updated_at"),
        ...flattenBatches(extraBatchesRes.data || [], "updated_at"),
      ];
      setAllRecords(flat);
      setMachines(machinesRes.data || []);
      setLoading(false);
    };
    fetchData();
  }, []);

  const { from: dateFrom, to: dateTo } = useMemo(
    () => getDateRange(duration, customFrom, customTo),
    [duration, customFrom, customTo],
  );

  const machineMap = useMemo(() => new Map(machines.map((m) => [m.id, m])), [machines]);

  const filteredRecords = useMemo(() => {
    return allRecords.filter((r) => {
      const d = parseISO(r.date);
      if (!isWithinInterval(d, { start: dateFrom, end: dateTo })) return false;
      if (typeFilter !== "all" && r.type !== typeFilter) return false;
      return true;
    });
  }, [allRecords, dateFrom, dateTo, typeFilter]);

  /* A: Total units per machine */
  const machineOpsData = useMemo(() => {
    const countMap: Record<string, number> = {};
    filteredRecords.forEach((r) => {
      countMap[r.machine_id] = (countMap[r.machine_id] || 0) + r.quantity;
    });
    return Object.entries(countMap)
      .map(([id, count]) => {
        const m = machineMap.get(id);
        return {
          name: m?.name || "Unknown",
          type: m?.type || "",
          count,
          color: MACHINE_TYPE_COLORS[m?.type || ""] || "hsl(216,12%,60%)",
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [filteredRecords, machineMap]);

  /* B: Daily trend stacked by type */
  const dailyTrendData = useMemo(() => {
    const dayMap: Record<string, Record<string, number>> = {};
    filteredRecords.forEach((r) => {
      const day = format(parseISO(r.date), "yyyy-MM-dd");
      if (!dayMap[day]) dayMap[day] = {};
      dayMap[day][r.type] = (dayMap[day][r.type] || 0) + r.quantity;
    });
    return Object.entries(dayMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, types]) => ({ day: format(parseISO(day), "MMM d"), ...types }))
      .slice(-30);
  }, [filteredRecords]);

  /* C: Units per phase */
  const phaseData = useMemo(() => {
    const phases = ["manufacturing", "finishing", "packaging", "boxing"];
    return phases.map((phase) => {
      let total = 0;
      filteredRecords.forEach((r) => {
        if (r.type === phase) total += r.quantity;
      });
      return { phase: phase.charAt(0).toUpperCase() + phase.slice(1), units: total };
    });
  }, [filteredRecords]);

  /* D: Ranked table with trend */
  const rankedMachines = useMemo(() => {
    const halfDuration = (dateTo.getTime() - dateFrom.getTime()) / 2;
    const midPoint = new Date(dateFrom.getTime() + halfDuration);

    const currentMap: Record<string, number> = {};
    const prevMap: Record<string, number> = {};
    const totalMap: Record<string, number> = {};

    filteredRecords.forEach((r) => {
      totalMap[r.machine_id] = (totalMap[r.machine_id] || 0) + r.quantity;
    });

    allRecords.forEach((r) => {
      if (typeFilter !== "all" && r.type !== typeFilter) return;
      const d = parseISO(r.date);
      if (d >= midPoint && d <= dateTo) {
        currentMap[r.machine_id] = (currentMap[r.machine_id] || 0) + r.quantity;
      } else if (d >= dateFrom && d < midPoint) {
        prevMap[r.machine_id] = (prevMap[r.machine_id] || 0) + r.quantity;
      }
    });

    return Object.entries(totalMap)
      .sort((a, b) => b[1] - a[1])
      .map(([id, total], idx) => {
        const m = machineMap.get(id);
        const curr = currentMap[id] || 0;
        const prev = prevMap[id] || 0;
        const trend = prev === 0 ? (curr > 0 ? "up" : "flat") : curr > prev ? "up" : curr < prev ? "down" : "flat";
        return { rank: idx + 1, id, name: m?.name || "Unknown", type: m?.type || "", total, trend };
      });
  }, [filteredRecords, allRecords, dateFrom, dateTo, typeFilter, machineMap]);

  const machineTypes = useMemo(() => [...new Set(machines.map((m) => m.type))], [machines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  const totalUnits = filteredRecords.reduce((s, r) => s + r.quantity, 0);
  const uniqueMachinesActive = new Set(filteredRecords.map((r) => r.machine_id)).size;

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={duration} onValueChange={(v) => setDuration(v as DurationPreset)}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(DURATION_LABELS) as DurationPreset[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {DURATION_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {duration === "custom" && (
              <>
                <Popover open={fromOpen} onOpenChange={setFromOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("h-9 text-xs", !customFrom && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {customFrom ? format(customFrom, "MMM d, yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customFrom}
                      onSelect={(d) => {
                        setCustomFrom(d);
                        setFromOpen(false);
                      }}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Popover open={toOpen} onOpenChange={setToOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn("h-9 text-xs", !customTo && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                      {customTo ? format(customTo, "MMM d, yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customTo}
                      onSelect={(d) => {
                        setCustomTo(d);
                        setToOpen(false);
                      }}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </>
            )}

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px] h-9">
                <SelectValue placeholder="Machine Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {machineTypes.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto flex gap-4 text-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{totalUnits}</p>
                <p className="text-xs text-muted-foreground">Total Units</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-primary">{uniqueMachinesActive}</p>
                <p className="text-xs text-muted-foreground">Active Machines</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* A: Units per machine (horizontal bar) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Units per Machine</CardTitle>
          <CardDescription>Total units assigned per machine in selected period</CardDescription>
        </CardHeader>
        <CardContent className="h-72">
          {machineOpsData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={machineOpsData} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={120}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "var(--radius)",
                    fontSize: 12,
                  }}
                  formatter={(v) => [v, "Units"]}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={22}>
                  {machineOpsData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">No machine data for selected period</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* B + C: Daily trend + Units per phase */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Production Trend</CardTitle>
            <CardDescription>Units per day, stacked by machine type</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {dailyTrendData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyTrendData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {["manufacturing", "finishing", "packaging", "boxing"].map((type) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      stackId="a"
                      fill={MACHINE_TYPE_COLORS[type]}
                      name={type.charAt(0).toUpperCase() + type.slice(1)}
                      maxBarSize={32}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No data for selected period</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Units per Phase</CardTitle>
            <CardDescription>Total units assigned per production phase</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {phaseData.some((d) => d.units > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={phaseData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="phase" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "var(--radius)",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="units" name="Units" radius={[4, 4, 0, 0]} maxBarSize={48}>
                    {phaseData.map((entry, i) => (
                      <Cell key={i} fill={MACHINE_TYPE_COLORS[entry.phase.toLowerCase()] || "hsl(216,12%,60%)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">No phase data available</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* D: Ranked machine table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Machine Leaderboard</CardTitle>
          <CardDescription>Ranked by total units, with trend vs previous half of period</CardDescription>
        </CardHeader>
        <CardContent>
          {rankedMachines.length > 0 ? (
            <div className="space-y-2">
              {rankedMachines.map((m) => {
                const maxOps = rankedMachines[0]?.total || 1;
                const pct = Math.round((m.total / maxOps) * 100);
                return (
                  <div key={m.id} className="flex items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <span
                      className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-bold shrink-0 ${
                        m.rank === 1 ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {m.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium truncate">{m.name}</span>
                        {m.type && (
                          <span
                            className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${MACHINE_TYPE_BADGE[m.type] || "bg-muted text-muted-foreground"}`}
                          >
                            {m.type}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-semibold w-16 text-right">{m.total} units</span>
                      {m.trend === "up" && <TrendingUp className="h-4 w-4 text-success" />}
                      {m.trend === "down" && <TrendingDown className="h-4 w-4 text-destructive" />}
                      {m.trend === "flat" && <Minus className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No machine data for selected filters</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
