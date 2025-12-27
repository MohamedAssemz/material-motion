import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { RawMaterialsDialog } from "@/components/RawMaterialsDialog";
import { FlaggedItemsDialog } from "@/components/FlaggedItemsDialog";
import { ShipmentDialog } from "@/components/ShipmentDialog";
import { BoxAssignmentDialog } from "@/components/BoxAssignmentDialog";
import { LeadTimeDialog } from "@/components/LeadTimeDialog";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  AlertTriangle,
  Trash2,
  Printer,
  FileText,
  Factory,
  Sparkles,
  Package,
  Box,
  CheckCircle,
  Clock,
  RotateCcw,
  Truck,
  Plane,
} from "lucide-react";
import {
  getNextState,
  getStateLabel,
  getAllStates,
  isInState,
  isReadyForState,
  type UnitState,
} from "@/lib/stateMachine";

interface Batch {
  id: string;
  batch_code: string;
  current_state: string;
  quantity: number;
  product_id: string;
  order_item_id: string | null;
  eta: string | null;
  lead_time_days: number | null;
  box_id: string | null;
  is_terminated?: boolean;
  is_redo?: boolean;
  is_flagged?: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    needs_packing: boolean;
  };
  box?: {
    id: string;
    box_code: string;
  } | null;
}

interface Order {
  id: string;
  order_number: string;
  status: string;
  priority: string;
  notes: string | null;
  shipping_type: string | null;
  estimated_fulfillment_time: string | null;
  created_at: string;
  created_by: string;
  customer_id: string | null;
  profile: {
    full_name: string;
    email: string;
  };
  customer?: {
    name: string;
    code: string | null;
  };
  batches: Batch[];
}

interface PhaseStats {
  waiting: number;
  inProgress: number;
  completed: number;
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  needs_boxing: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
    needs_packing: boolean;
  };
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [rawMaterialsOpen, setRawMaterialsOpen] = useState(false);
  const [flaggedItemsOpen, setFlaggedItemsOpen] = useState(false);
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [boxAssignDialogOpen, setBoxAssignDialogOpen] = useState(false);
  const [leadTimeDialogOpen, setLeadTimeDialogOpen] = useState(false);

  // Selection states for inline actions
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [activePhase, setActivePhase] = useState<string | null>(null);

  useEffect(() => {
    fetchOrder();

    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "batches", filter: `order_id=eq.${id}` }, () => {
        fetchOrder();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchOrder = async () => {
    try {
      // Fetch order and order_items separately
      const [orderRes, orderItemsRes] = await Promise.all([
        supabase
          .from("orders")
          .select(
            `
            *,
            customer:customers(name, code),
            batches(
              id, batch_code, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, is_terminated, is_redo, is_flagged,
              product:products(id, name, sku, needs_packing)
            )
          `,
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("order_items")
          .select("id, product_id, quantity, needs_boxing, product:products(id, name, sku, needs_packing)")
          .eq("order_id", id),
      ]);

      const { data: orderData, error: orderError } = orderRes;
      if (orderError) throw orderError;
      if (!orderData) {
        setLoading(false);
        return;
      }

      // Fetch box info for batches with box_id
      const boxIds = orderData.batches?.filter((b: any) => b.box_id).map((b: any) => b.box_id) || [];
      let boxMap = new Map();

      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase.from("boxes").select("id, box_code").in("id", boxIds);
        boxesData?.forEach((box) => boxMap.set(box.id, box));
      }

      const batchesWithBoxes =
        orderData.batches?.map((batch: any) => ({
          ...batch,
          product: batch.product,
          box: batch.box_id ? boxMap.get(batch.box_id) : null,
        })) || [];

      const { data: profileData } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", orderData.created_by)
        .maybeSingle();

      // Store order_items as well for the Order Items table
      setOrderItems(orderItemsRes.data || []);
      setOrder({
        ...orderData,
        batches: batchesWithBoxes,
        profile: profileData || { full_name: "Unknown", email: "" },
      } as Order);
    } catch (error) {
      console.error("Error fetching order:", error);
      toast.error("Failed to load order details");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async () => {
    try {
      await supabase.from("batches").delete().eq("order_id", id);
      await supabase.from("order_items").delete().eq("order_id", id);
      await supabase.from("raw_material_versions").delete().eq("order_id", id);
      await supabase.from("notifications").delete().eq("order_id", id);

      const { error } = await supabase.from("orders").delete().eq("id", id);
      if (error) throw error;

      toast.success("Order deleted successfully");
      navigate("/orders");
    } catch (error) {
      console.error("Error deleting order:", error);
      toast.error("Failed to delete order");
    }
  };

  const handlePrintOrder = () => {
    if (!order) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const itemsByProduct = new Map<string, { name: string; sku: string; quantity: number }>();
    order.batches
      .filter((b) => !b.is_terminated)
      .forEach((batch) => {
        const existing = itemsByProduct.get(batch.product_id) || {
          name: batch.product?.name || "Unknown",
          sku: batch.product?.sku || "N/A",
          quantity: 0,
        };
        existing.quantity += batch.quantity;
        itemsByProduct.set(batch.product_id, existing);
      });

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Order ${order.order_number}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
            .header { border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
            .order-number { font-size: 28px; font-weight: bold; }
            .meta { color: #666; margin-top: 5px; }
            .section { margin: 20px 0; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; }
            .high { background: #fee2e2; color: #991b1b; }
            .normal { background: #e0e7ff; color: #3730a3; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="order-number">${order.order_number}</div>
            <div class="meta">
              Customer: ${order.customer?.name || "N/A"} | 
              Priority: <span class="badge ${order.priority}">${order.priority}</span> |
              Shipping: ${order.shipping_type === "international" ? "International" : "Domestic"}
            </div>
            <div class="meta">Created: ${format(new Date(order.created_at), "PPP")}</div>
            ${order.estimated_fulfillment_time ? `<div class="meta">EFT: ${format(new Date(order.estimated_fulfillment_time), "PPP")}</div>` : ""}
          </div>

          <div class="section">
            <div class="section-title">Order Items</div>
            <table>
              <tr><th>Product</th><th>SKU</th><th>Quantity</th></tr>
              ${Array.from(itemsByProduct.values())
                .map(
                  (item) => `
                <tr><td>${item.name}</td><td>${item.sku}</td><td>${item.quantity}</td></tr>
              `,
                )
                .join("")}
            </table>
          </div>

          ${order.notes ? `<div class="section"><div class="section-title">Notes</div><p>${order.notes}</p></div>` : ""}

          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const canUpdate =
    hasRole("manufacture_lead") || hasRole("manufacturer") || hasRole("packer") || hasRole("boxer") || hasRole("admin");
  const canDelete = hasRole("manufacture_lead") || hasRole("admin");

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
        <p className="text-center text-muted-foreground mt-8">Order not found</p>
      </div>
    );
  }

  const activeBatches = order.batches.filter((b) => !b.is_terminated);
  const totalItems = activeBatches.reduce((sum, b) => sum + b.quantity, 0);
  const receivedItems = activeBatches
    .filter((b) => b.current_state === "received")
    .reduce((sum, b) => sum + b.quantity, 0);
  const flaggedCount = activeBatches.filter((b) => b.is_flagged).reduce((sum, b) => sum + b.quantity, 0);
  const redoCount = activeBatches.filter((b) => b.is_redo).reduce((sum, b) => sum + b.quantity, 0);

  // Calculate phase stats
  const getPhaseStats = (inState: string, readyState?: string): PhaseStats => {
    const waiting = readyState
      ? activeBatches.filter((b) => b.current_state === readyState).reduce((sum, b) => sum + b.quantity, 0)
      : 0;
    const inProgress = activeBatches.filter((b) => b.current_state === inState).reduce((sum, b) => sum + b.quantity, 0);
    const stateIndex = getAllStates().indexOf(inState as UnitState);
    const completed = activeBatches
      .filter((b) => getAllStates().indexOf(b.current_state as UnitState) > stateIndex)
      .reduce((sum, b) => sum + b.quantity, 0);
    return { waiting, inProgress, completed };
  };

  const manufacturingStats = getPhaseStats("in_manufacturing", "pending_rm");
  const finishingStats = getPhaseStats("in_finishing", "ready_for_finishing");
  const packagingStats = getPhaseStats("in_packaging", "ready_for_packaging");
  const boxingStats = getPhaseStats("in_boxing", "ready_for_boxing");

  // Items grouped by product for each state
  const getProductsByState = (state: string) => {
    const stateData = new Map<
      string,
      { name: string; sku: string; needsPacking: boolean; quantity: number; batches: Batch[] }
    >();
    activeBatches
      .filter((b) => b.current_state === state)
      .forEach((batch) => {
        if (!stateData.has(batch.product_id)) {
          stateData.set(batch.product_id, {
            name: batch.product?.name || "Unknown",
            sku: batch.product?.sku || "N/A",
            needsPacking: batch.product?.needs_packing ?? true,
            quantity: 0,
            batches: [],
          });
        }
        const item = stateData.get(batch.product_id)!;
        item.quantity += batch.quantity;
        item.batches.push(batch);
      });
    return Array.from(stateData.entries());
  };

  // Boxes by state
  const getBoxesByState = (state: string) => {
    const boxData = new Map<string, { code: string; quantity: number; batches: Batch[] }>();
    activeBatches
      .filter((b) => b.current_state === state && b.box_id && b.box)
      .forEach((batch) => {
        if (!boxData.has(batch.box_id!)) {
          boxData.set(batch.box_id!, {
            code: batch.box?.box_code || "Unknown",
            quantity: 0,
            batches: [],
          });
        }
        const item = boxData.get(batch.box_id!)!;
        item.quantity += batch.quantity;
        item.batches.push(batch);
      });
    return Array.from(boxData.entries());
  };

  const receivedBatches = activeBatches
    .filter((b) => b.current_state === "received")
    .map((b) => ({
      id: b.id,
      batch_code: b.batch_code,
      product_id: b.product_id,
      product_name: b.product?.name || "Unknown",
      product_sku: b.product?.sku || "N/A",
      quantity: b.quantity,
    }));

  // Order state
  const orderState =
    receivedItems === totalItems && totalItems > 0 ? "Fulfilled" : receivedItems > 0 ? "In Progress" : "Pending";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">{order.order_number}</h1>
              {order.priority === "high" && <Badge variant="destructive">High Priority</Badge>}
              <Badge variant={orderState === "Fulfilled" ? "default" : "secondary"}>{orderState}</Badge>
            </div>
            <p className="text-muted-foreground">
              {order.customer?.name || "No Customer"} · Created {format(new Date(order.created_at), "PPP")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrintOrder}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRawMaterialsOpen(true)}>
            <FileText className="h-4 w-4 mr-1" />
            Raw Materials
          </Button>
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Order?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete {order.order_number} and all related data.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteOrder} className="bg-destructive">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Order Summary - Full Width Horizontal Card */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground block mb-1">Order #</span>
              <span className="font-mono font-medium">{order.order_number}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Status</span>
              <Badge variant={orderState === "Fulfilled" ? "default" : "secondary"}>{orderState}</Badge>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Priority</span>
              <Badge variant={order.priority === "high" ? "destructive" : "secondary"} className="text-xs">
                {order.priority}
              </Badge>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">EFT</span>
              <span>{order.estimated_fulfillment_time ? format(new Date(order.estimated_fulfillment_time), "PP") : "N/A"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Customer</span>
              <span>{order.customer?.name || "N/A"}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Shipping</span>
              <span className="flex items-center gap-1">
                {order.shipping_type === "international" ? (
                  <Plane className="h-3 w-3" />
                ) : (
                  <Truck className="h-3 w-3" />
                )}
                {order.shipping_type === "international" ? "International" : "Domestic"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Created</span>
              <span>{format(new Date(order.created_at), "PP")}</span>
            </div>
            <div>
              <span className="text-muted-foreground block mb-1">Created By</span>
              <span className="truncate">{order.profile.full_name}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes & Alerts Row */}
      {(order.notes || flaggedCount > 0 || redoCount > 0) && (
        <div className="flex flex-wrap gap-4">
          {order.notes && (
            <Card className="flex-1 min-w-[200px]">
              <CardContent className="p-4">
                <span className="text-sm font-medium">Notes:</span>
                <p className="text-sm text-muted-foreground mt-1">{order.notes}</p>
              </CardContent>
            </Card>
          )}
          {(flaggedCount > 0 || redoCount > 0) && (
            <Card
              className="border-warning/50 bg-warning/5 cursor-pointer hover:bg-warning/10 transition-colors"
              onClick={() => setFlaggedItemsOpen(true)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  <div>
                    {flaggedCount > 0 && <p className="font-medium">{flaggedCount} Flagged Items</p>}
                    {redoCount > 0 && <p className="font-medium">{redoCount} Redo Required</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Middle Section - Two Cards Side by Side */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Card - Production Timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Production Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  label: "Manufacturing",
                  in: "in_manufacturing",
                  ready: "pending_rm",
                  stats: manufacturingStats,
                  icon: Factory,
                  color: "blue",
                },
                {
                  label: "Finishing",
                  in: "in_finishing",
                  ready: "ready_for_finishing",
                  stats: finishingStats,
                  icon: Sparkles,
                  color: "purple",
                },
                {
                  label: "Packaging",
                  in: "in_packaging",
                  ready: "ready_for_packaging",
                  stats: packagingStats,
                  icon: Package,
                  color: "indigo",
                },
                {
                  label: "Boxing",
                  in: "in_boxing",
                  ready: "ready_for_boxing",
                  stats: boxingStats,
                  icon: Box,
                  color: "cyan",
                },
              ].map((phase, idx) => {
                const Icon = phase.icon;
                const total = phase.stats.waiting + phase.stats.inProgress + phase.stats.completed;
                const progress = totalItems > 0 ? (phase.stats.completed / totalItems) * 100 : 0;

                return (
                  <div key={phase.label} className="flex items-center gap-3">
                    <div
                      className={`flex items-center justify-center w-8 h-8 rounded-full bg-${phase.color}-100 dark:bg-${phase.color}-900/30`}
                    >
                      <Icon className={`h-4 w-4 text-${phase.color}-600 dark:text-${phase.color}-400`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{phase.label}</span>
                        <span className="text-muted-foreground">
                          {phase.stats.waiting > 0 && (
                            <span className="text-warning">{phase.stats.waiting} waiting · </span>
                          )}
                          {phase.stats.inProgress > 0 && (
                            <span className="text-primary">{phase.stats.inProgress} active · </span>
                          )}
                          {phase.stats.completed}/{totalItems} done
                        </span>
                      </div>
                      <div className="h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Fulfilled */}
              <div className="flex items-center gap-3 pt-2 border-t">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30">
                  <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">Fulfilled</span>
                    <span className="text-green-600 font-medium">
                      {receivedItems}/{totalItems}
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(receivedItems / totalItems) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Right Card - Production Phases */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Production Phases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: "Manufacturing",
                href: `/orders/${id}/manufacturing`,
                in: "in_manufacturing",
                ready: "pending_rm",
                icon: Factory,
                color: "blue",
              },
              {
                label: "Finishing",
                href: `/orders/${id}/finishing`,
                in: "in_finishing",
                ready: "ready_for_finishing",
                icon: Sparkles,
                color: "purple",
              },
              {
                label: "Packaging",
                href: `/orders/${id}/packaging`,
                in: "in_packaging",
                ready: "ready_for_packaging",
                icon: Package,
                color: "indigo",
              },
              {
                label: "Boxing",
                href: `/orders/${id}/boxing`,
                in: "in_boxing",
                ready: "ready_for_boxing",
                icon: Box,
                color: "cyan",
              },
            ].map((phase) => {
              const Icon = phase.icon;
              const waiting = activeBatches
                .filter((b) => b.current_state === phase.ready)
                .reduce((sum, b) => sum + b.quantity, 0);
              const inProgress = activeBatches
                .filter((b) => b.current_state === phase.in)
                .reduce((sum, b) => sum + b.quantity, 0);

              return (
                <div
                  key={phase.label}
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:border-primary/50 transition-colors"
                  onClick={() => navigate(phase.href)}
                >
                  <div className={`p-2 rounded-lg bg-${phase.color}-100 dark:bg-${phase.color}-900/30`}>
                    <Icon className={`h-5 w-5 text-${phase.color}-600 dark:text-${phase.color}-400`} />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{phase.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {waiting > 0 && <span className="text-warning">{waiting} waiting</span>}
                      {waiting > 0 && inProgress > 0 && " · "}
                      {inProgress > 0 && <span className="text-primary">{inProgress} in progress</span>}
                      {waiting === 0 && inProgress === 0 && <span>No active items</span>}
                    </p>
                  </div>
                  <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
                </div>
              );
            })}

            {/* Shipments */}
            <div
              className="flex items-center gap-3 p-3 rounded-lg border border-green-200 dark:border-green-800 cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => navigate(`/orders/${id}/shipments`)}
            >
              <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                <Truck className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Shipments</p>
                <p className="text-sm text-muted-foreground">{receivedItems} items fulfilled</p>
              </div>
              <ArrowLeft className="h-4 w-4 rotate-180 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Order Items - Full Width Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center justify-between">
            Order Items
            <Badge variant="secondary">{totalItems} total</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2">Product</th>
                  <th className="text-center py-2">Qty</th>
                  <th className="text-center py-2">Packing</th>
                  <th className="text-center py-2">Boxing</th>
                  <th className="text-right py-2">Progress</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => {
                  // Find batches for this specific order item (not just product)
                  const itemBatches = activeBatches.filter((b) => b.order_item_id === item.id);
                  const totalQty = itemBatches.reduce((sum, b) => sum + b.quantity, 0);
                  const receivedQty = itemBatches
                    .filter((b) => b.current_state === "received")
                    .reduce((sum, b) => sum + b.quantity, 0);
                  const progressPct = totalQty > 0 ? Math.round((receivedQty / totalQty) * 100) : 0;
                  const stateBreakdown = getAllStates()
                    .map((s) => ({
                      state: s,
                      qty: itemBatches.filter((b) => b.current_state === s).reduce((sum, b) => sum + b.quantity, 0),
                    }))
                    .filter((s) => s.qty > 0);

                  return (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="py-3">
                        <p className="font-medium">{item.product?.name || "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">{item.product?.sku || "N/A"}</p>
                      </td>
                      <td className="text-center font-medium">{item.quantity}</td>
                      <td className="text-center">
                        {item.product?.needs_packing ? (
                          <Badge variant="outline" className="text-xs">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            No
                          </Badge>
                        )}
                      </td>
                      <td className="text-center">
                        {item.needs_boxing ? (
                          <Badge variant="outline" className="text-xs bg-primary/10">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            No
                          </Badge>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex flex-col items-end gap-1">
                          <span className="font-medium">{progressPct}%</span>
                          <div className="text-xs text-muted-foreground max-w-[140px] text-right">
                            {stateBreakdown.slice(0, 2).map((s, i) => (
                              <span key={s.state}>
                                {i > 0 && ", "}
                                {s.qty}{" "}
                                {getStateLabel(s.state as UnitState)
                                  .split(" ")
                                  .slice(0, 2)
                                  .join(" ")}
                              </span>
                            ))}
                            {stateBreakdown.length > 2 && <span> +{stateBreakdown.length - 2}</span>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <RawMaterialsDialog open={rawMaterialsOpen} onOpenChange={setRawMaterialsOpen} orderId={id!} />

      <FlaggedItemsDialog
        open={flaggedItemsOpen}
        onOpenChange={setFlaggedItemsOpen}
        orderId={id!}
        batches={activeBatches
          .filter((b) => b.is_flagged || b.is_redo)
          .map((b) => ({
            id: b.id,
            batch_code: b.batch_code,
            product_name: b.product?.name || "Unknown",
            product_sku: b.product?.sku || "N/A",
            quantity: b.quantity,
            current_state: b.current_state,
            is_flagged: b.is_flagged || false,
            is_redo: b.is_redo || false,
          }))}
        onRefresh={fetchOrder}
      />

      <ShipmentDialog
        open={shipmentDialogOpen}
        onOpenChange={setShipmentDialogOpen}
        orderId={id!}
        orderNumber={order.order_number}
        receivedBatches={receivedBatches}
        onRefresh={fetchOrder}
      />
    </div>
  );
}
