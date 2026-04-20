import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { formatDistanceToNow, format } from "date-fns";
import {
  Activity,
  Plus,
  Play,
  Pencil,
  XCircle,
  Package,
  CheckCircle,
  Truck,
  Box,
  Factory,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Search,
  History,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AuditLog {
  id: string;
  created_at: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  module: string;
  order_id: string | null;
  metadata: Record<string, any> | null;
}

interface OrderTimelineLogsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
}

const MODULE_STYLES: Record<string, { color: string; label: string }> = {
  orders: { color: "text-amber-600 bg-amber-100 dark:bg-amber-900/30", label: "Orders" },
  manufacturing: { color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30", label: "Manufacturing" },
  finishing: { color: "text-purple-600 bg-purple-100 dark:bg-purple-900/30", label: "Finishing" },
  packaging: { color: "text-pink-600 bg-pink-100 dark:bg-pink-900/30", label: "Packaging" },
  boxing: { color: "text-indigo-600 bg-indigo-100 dark:bg-indigo-900/30", label: "Boxing" },
  shipments: { color: "text-teal-600 bg-teal-100 dark:bg-teal-900/30", label: "Shipments" },
  extra_inventory: { color: "text-violet-600 bg-violet-100 dark:bg-violet-900/30", label: "Extra Inventory" },
  boxes: { color: "text-slate-600 bg-slate-100 dark:bg-slate-900/30", label: "Boxes" },
  catalog: { color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30", label: "Catalog" },
  admin: { color: "text-red-600 bg-red-100 dark:bg-red-900/30", label: "Admin" },
};

const ACTION_ICONS: Record<string, typeof Activity> = {
  "order.created": Plus,
  "order.started": Play,
  "order.edited": Pencil,
  "order.cancelled": XCircle,
  "extra_inventory.committed": CheckCircle,
  "extra_inventory.reserved": Package,
  "extra_inventory.injected": Sparkles,
  "shipment.created": Truck,
  "shipment.sealed": Truck,
  "shipment.reprinted": Truck,
  "batch.start_working": Factory,
  "batch.assigned_to_box": Box,
  "batch.received": Package,
  "batch.moved_to_extra": Sparkles,
  "batch.moved_to_next": CheckCircle,
  "batch.moved_to_ready_for_shipment": Truck,
  "batch.machine_assigned": Factory,
  "box.created": Box,
  "box.force_emptied": Box,
  "box.deleted": Box,
};

function humanizeAction(action: string): string {
  const map: Record<string, string> = {
    "order.created": "Order Created",
    "order.started": "Order Started",
    "order.edited": "Order Edited",
    "order.cancelled": "Order Cancelled",
    "extra_inventory.committed": "Extra Inventory Committed",
    "extra_inventory.reserved": "Extra Inventory Reserved",
    "extra_inventory.injected": "Extra Inventory Injected",
    "shipment.created": "Shipment Created",
    "shipment.sealed": "Shipment Sealed",
    "shipment.reprinted": "Shipment Reprinted",
    "batch.start_working": "Started Working on Batch",
    "batch.assigned_to_box": "Assigned to Box",
    "batch.received": "Batch Received",
    "batch.moved_to_extra": "Moved to Extra",
    "batch.moved_to_next": "Moved to Next Phase",
    "batch.moved_to_ready_for_shipment": "Ready for Shipment",
    "batch.machine_assigned": "Machine Assigned",
  };
  if (map[action]) return map[action];
  // Fallback: humanize slug
  const [, rest] = action.split(".");
  if (!rest) return action;
  return rest
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const PAGE_SIZE = 200;

export function OrderTimelineLogsDrawer({
  open,
  onOpenChange,
  orderId,
}: OrderTimelineLogsDrawerProps) {
  const { t } = useLanguage();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    fetchLogs(0, true);

    const channel = supabase
      .channel(`audit-logs-${orderId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_logs",
          filter: `order_id=eq.${orderId}`,
        },
        (payload) => {
          const newLog = payload.new as AuditLog;
          setLogs((prev) => [newLog, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const fetchLogs = async (offset: number, reset: boolean) => {
    if (reset) setLoading(true);
    else setLoadingMore(true);
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) throw error;
      const list = (data || []) as AuditLog[];
      setHasMore(list.length === PAGE_SIZE);
      setLogs((prev) => (reset ? list : [...prev, ...list]));
    } catch (err) {
      console.error("Failed to fetch audit logs", err);
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (moduleFilter && log.module !== moduleFilter) return false;
      if (!q) return true;
      const hay = [
        log.action,
        log.entity_type,
        log.entity_id ?? "",
        log.module,
        log.user_name ?? "",
        log.user_email ?? "",
        JSON.stringify(log.metadata ?? {}),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [logs, search, moduleFilter]);

  const modulesPresent = useMemo(() => {
    return Array.from(new Set(logs.map((l) => l.module)));
  }, [logs]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl flex flex-col p-0">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t("timeline.logs")}
          </SheetTitle>
          <SheetDescription>{t("timeline.logs_desc")}</SheetDescription>
        </SheetHeader>

        <div className="px-6 py-3 border-b space-y-2">
          <div className="relative">
            <Search className="h-4 w-4 absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("timeline.search_placeholder")}
              className="ps-9"
            />
          </div>
          {modulesPresent.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setModuleFilter(null)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  moduleFilter === null
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background hover:bg-muted"
                }`}
              >
                {t("timeline.all")}
              </button>
              {modulesPresent.map((m) => {
                const style = MODULE_STYLES[m];
                const active = moduleFilter === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModuleFilter(active ? null : m)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted"
                    }`}
                  >
                    {style?.label ?? m}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="flex gap-3">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-3 w-56" />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-12">
                {t("timeline.no_events")}
              </p>
            ) : (
              <TooltipProvider delayDuration={200}>
                <div className="relative">
                  {filtered.map((log, index) => {
                    const moduleStyle =
                      MODULE_STYLES[log.module] ?? MODULE_STYLES.orders;
                    const Icon = ACTION_ICONS[log.action] ?? Activity;
                    const isLast = index === filtered.length - 1;
                    const hasMeta =
                      log.metadata && Object.keys(log.metadata).length > 0;
                    const isOpen = !!expanded[log.id];

                    return (
                      <div key={log.id} className="flex gap-3 relative">
                        {!isLast && (
                          <div className="absolute start-4 top-8 bottom-0 w-px bg-border" />
                        )}
                        <div
                          className={`shrink-0 h-8 w-8 rounded-full border bg-background flex items-center justify-center ${moduleStyle.color}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className={`flex-1 ${isLast ? "" : "pb-5"}`}>
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <p className="text-sm font-medium">
                              {humanizeAction(log.action)}
                            </p>
                            <Badge variant="secondary" className="text-[10px]">
                              {moduleStyle.label}
                            </Badge>
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-muted-foreground cursor-default">
                                {t("timeline.by")}{" "}
                                {log.user_name ||
                                  log.user_email ||
                                  t("timeline.system")}{" "}
                                ·{" "}
                                {formatDistanceToNow(new Date(log.created_at), {
                                  addSuffix: true,
                                })}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              {format(new Date(log.created_at), "PPpp")}
                            </TooltipContent>
                          </Tooltip>
                          {hasMeta && (
                            <Collapsible
                              open={isOpen}
                              onOpenChange={() => toggleExpand(log.id)}
                            >
                              <CollapsibleTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 mt-1 text-xs text-muted-foreground"
                                >
                                  {isOpen ? (
                                    <ChevronDown className="h-3 w-3 me-1" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3 me-1" />
                                  )}
                                  {t("timeline.details")}
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="mt-1.5 rounded-md border bg-muted/40 p-2 space-y-0.5">
                                  {Object.entries(log.metadata!).map(
                                    ([k, v]) => (
                                      <div
                                        key={k}
                                        className="text-xs flex gap-2"
                                      >
                                        <span className="font-medium text-muted-foreground shrink-0">
                                          {k}:
                                        </span>
                                        <span className="break-all">
                                          {typeof v === "object"
                                            ? JSON.stringify(v)
                                            : String(v)}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </TooltipProvider>
            )}

            {hasMore && !loading && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loadingMore}
                  onClick={() => fetchLogs(logs.length, false)}
                >
                  {loadingMore ? t("common.loading") : t("timeline.load_more")}
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
