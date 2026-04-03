import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";
import {
  Plus,
  Play,
  Pencil,
  XCircle,
  Package,
  CheckCircle,
  Truck,
  Activity,
} from "lucide-react";

interface ActivityLog {
  id: string;
  action: string;
  details: Record<string, any> | null;
  created_at: string;
  performed_by: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Plus; color: string }> = {
  created: { label: "Order Created", icon: Plus, color: "text-green-600" },
  started: { label: "Order Started", icon: Play, color: "text-blue-600" },
  edited: { label: "Order Edited", icon: Pencil, color: "text-amber-600" },
  cancelled: { label: "Order Cancelled", icon: XCircle, color: "text-red-600" },
  reserved_extra: { label: "Extra Inventory Reserved", icon: Package, color: "text-purple-600" },
  committed_extra: { label: "Extra Inventory Committed", icon: CheckCircle, color: "text-teal-600" },
  shipment_created: { label: "Shipment Created", icon: Truck, color: "text-indigo-600" },
};

interface OrderActivityLogProps {
  orderId: string;
}

export function OrderActivityLog({ orderId }: OrderActivityLogProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLogs();
  }, [orderId]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("order_activity_logs")
        .select("id, action, details, created_at, performed_by")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch unique performer profiles
      const performerIds = [...new Set((data || []).map((l) => l.performed_by))];
      let profilesMap: Record<string, { full_name: string | null; email: string | null }> = {};

      if (performerIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", performerIds);

        if (profiles) {
          profiles.forEach((p) => {
            profilesMap[p.id] = { full_name: p.full_name, email: p.email };
          });
        }
      }

      setLogs(
        (data || []).map((l) => ({
          ...l,
          details: l.details as Record<string, any> | null,
          profile: profilesMap[l.performed_by],
        }))
      );
    } catch (error) {
      console.error("Error fetching activity logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getPerformerName = (log: ActivityLog) => {
    return log.profile?.full_name || log.profile?.email || "Unknown";
  };

  const getDetailText = (log: ActivityLog): string | null => {
    if (!log.details) return null;

    if (log.action === "edited") {
      const changes: string[] = [];
      if (log.details.eft_changed) changes.push("EFT updated");
      if (log.details.items_added) changes.push(`${log.details.items_added} item(s) added`);
      if (log.details.items_deleted) changes.push(`${log.details.items_deleted} item(s) deleted`);
      if (log.details.items_qty_changed) changes.push(`${log.details.items_qty_changed} item(s) qty changed`);
      return changes.length > 0 ? changes.join(", ") : null;
    }

    if (log.action === "shipment_created" && log.details.shipment_code) {
      return `Shipment: ${log.details.shipment_code}`;
    }

    if (log.action === "reserved_extra" && log.details.total_reserved) {
      return `${log.details.total_reserved} units reserved`;
    }

    if (log.action === "committed_extra") {
      const parts: string[] = [];
      if (log.details.total_released) parts.push(`${log.details.total_released} released`);
      if (log.details.total_requeued) parts.push(`${log.details.total_requeued} requeued`);
      return parts.length > 0 ? parts.join(", ") : null;
    }

    return null;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No activity recorded yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" />
          Activity Log
          <Badge variant="secondary" className="text-xs ml-1">{logs.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {logs.map((log, index) => {
            const config = ACTION_CONFIG[log.action] || {
              label: log.action,
              icon: Activity,
              color: "text-muted-foreground",
            };
            const Icon = config.icon;
            const detailText = getDetailText(log);
            const isLast = index === logs.length - 1;

            return (
              <div key={log.id} className="flex gap-3 relative">
                {/* Timeline line */}
                {!isLast && (
                  <div className="absolute left-4 top-8 bottom-0 w-px bg-border" />
                )}

                {/* Icon */}
                <div className={`shrink-0 h-8 w-8 rounded-full border bg-background flex items-center justify-center ${config.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>

                {/* Content */}
                <div className={`flex-1 ${isLast ? "" : "pb-5"}`}>
                  <p className="text-sm font-medium">{config.label}</p>
                  <p className="text-xs text-muted-foreground">
                    by {getPerformerName(log)} · {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                  </p>
                  {detailText && (
                    <p className="text-xs text-muted-foreground mt-0.5">{detailText}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
