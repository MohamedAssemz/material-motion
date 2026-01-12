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
import { ExtraInventoryDialog } from "@/components/ExtraInventoryDialog";
import { StartOrderDialog } from "@/components/StartOrderDialog";
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
  Play,
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
  qr_code_data: string;
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
  const [extraInventoryOpen, setExtraInventoryOpen] = useState(false);
  const [startOrderOpen, setStartOrderOpen] = useState(false);
  const [selectedExtraPhase, setSelectedExtraPhase] = useState<'manufacturing' | 'finishing' | 'packaging' | 'boxing'>('manufacturing');
  const [extraInventoryCounts, setExtraInventoryCounts] = useState<Record<string, number>>({});

  // Selection states for inline actions
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [activePhase, setActivePhase] = useState<string | null>(null);

  useEffect(() => {
    fetchOrder();
    fetchExtraInventoryCounts();

    const channel = supabase
      .channel(`order-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_batches", filter: `order_id=eq.${id}` }, () => {
        fetchOrder();
      })
      .subscribe();

    const extraChannel = supabase
      .channel('extra-inventory-counts')
      .on("postgres_changes", { event: "*", schema: "public", table: "extra_batches" }, () => {
        fetchExtraInventoryCounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(extraChannel);
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
            customer:customers(name, code)
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

      // Fetch batches separately
      const { data: batchesData, error: batchesError } = await supabase
        .from("order_batches")
        .select("id, qr_code_data, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, is_terminated, is_redo, is_flagged, product:products(id, name, sku, needs_packing)")
        .eq("order_id", id);

      if (batchesError) throw batchesError;

      // Fetch box info for batches with box_id
      const boxIds = batchesData?.filter((b: any) => b.box_id).map((b: any) => b.box_id) || [];
      let boxMap = new Map();

      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase.from("boxes").select("id, box_code").in("id", boxIds);
        boxesData?.forEach((box) => boxMap.set(box.id, box));
      }

      const batchesWithBoxes =
        batchesData?.map((batch: any) => ({
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

  const fetchExtraInventoryCounts = async () => {
    try {
      // State mapping: extra batches in each state are usable for that corresponding phase
      // e.g., extra_manufacturing batches can be used when order is in manufacturing phase
      const states = [
        { phase: 'manufacturing', state: 'extra_manufacturing' },
        { phase: 'finishing', state: 'extra_finishing' },
        { phase: 'packaging', state: 'extra_packaging' },
        { phase: 'boxing', state: 'extra_boxing' },
      ];

      const counts: Record<string, number> = {};

      for (const { phase, state } of states) {
        const { data, error } = await supabase
          .from('extra_batches')
          .select('quantity')
          .eq('inventory_state', 'AVAILABLE')
          .eq('current_state', state);

        if (!error && data) {
          counts[phase] = data.reduce((sum, b) => sum + b.quantity, 0);
        }
      }

      setExtraInventoryCounts(counts);
    } catch (error) {
      console.error('Error fetching extra inventory counts:', error);
    }
  };

  const handleDeleteOrder = async () => {
    try {
      await supabase.from("order_batches").delete().eq("order_id", id);
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
  // Total items = planned order quantity from order_items (not affected by extra inventory reservation)
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const shippedItems = activeBatches
    .filter((b) => b.current_state === "shipped")
    .reduce((sum, b) => sum + b.quantity, 0);
  const flaggedCount = activeBatches.filter((b) => b.is_flagged).reduce((sum, b) => sum + b.quantity, 0);
  const redoCount = activeBatches.filter((b) => b.is_redo).reduce((sum, b) => sum + b.quantity, 0);
  
  // Check if order is pending (all batches in pending_rm state)
  const isPendingOrder = activeBatches.length > 0 && 
    activeBatches.every((b) => b.current_state === "pending_rm");

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

  const shippedBatches = activeBatches
    .filter((b) => b.current_state === "shipped")
    .map((b) => ({
      id: b.id,
      qr_code_data: b.qr_code_data,
      product_id: b.product_id,
      product_name: b.product?.name || "Unknown",
      product_sku: b.product?.sku || "N/A",
      quantity: b.quantity,
    }));

  // Order state
  const orderState =
    shippedItems === totalItems && totalItems > 0 ? "Fulfilled" : shippedItems > 0 ? "In Progress" : "Pending";

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
          {isPendingOrder && canUpdate && (
            <Button onClick={() => setStartOrderOpen(true)}>
              <Play className="h-4 w-4 mr-1" />
              Start Order
            </Button>
          )}
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
                  <AlertDialogTitle>Delete Order</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete the order and all associated data. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteOrder}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Order Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold">{totalItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Shipped</p>
            <p className="text-2xl font-bold text-green-600">{shippedItems}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Shipping</p>
            <p className="text-2xl font-bold flex items-center gap-2">
              {order.shipping_type === "international" ? (
                <>
                  <Plane className="h-5 w-5" /> International
                </>
              ) : (
                <>
                  <Truck className="h-5 w-5" /> Domestic
                </>
              )}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">EFT</p>
            <p className="text-2xl font-bold">
              {order.estimated_fulfillment_time
                ? format(new Date(order.estimated_fulfillment_time), "MMM d")
                : "Not set"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Notes & Alerts */}
      {(order.notes || flaggedCount > 0 || redoCount > 0) && (
        <div className="space-y-2">
          {order.notes && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm font-medium">Notes</p>
                <p className="text-sm text-muted-foreground">{order.notes}</p>
              </CardContent>
            </Card>
          )}
          {(flaggedCount > 0 || redoCount > 0) && (
            <Card className="border-warning">
              <CardContent className="p-4 flex items-center gap-4">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <div className="flex-1">
                  {flaggedCount > 0 && (
                    <span className="text-sm">
                      {flaggedCount} flagged item(s)
                    </span>
                  )}
                  {flaggedCount > 0 && redoCount > 0 && <span className="mx-2">·</span>}
                  {redoCount > 0 && (
                    <span className="text-sm">
                      {redoCount} redo item(s)
                    </span>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={() => setFlaggedItemsOpen(true)}>
                  View Details
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Production Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className={isPendingOrder ? 'text-muted-foreground' : ''}>
            Production Timeline
          </CardTitle>
          <CardDescription>
            {isPendingOrder ? 'Start the order to begin tracking progress' : 'Track progress through each phase'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPendingOrder ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                <Clock className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">Timeline Inactive</p>
              <p className="text-sm text-muted-foreground mt-1">
                Click "Start Order" to begin production
              </p>
              <div className="mt-4 text-sm">
                <span className="font-medium">{totalItems}</span>
                <span className="text-muted-foreground"> items planned</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Link to={`/orders/${id}/manufacturing`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <Factory className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <p className="font-medium">Manufacturing</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">In Progress</span>
                        <span className="font-medium text-primary">{manufacturingStats.inProgress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completed</span>
                        <span className="font-medium text-green-600">{manufacturingStats.completed}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link to={`/orders/${id}/finishing`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
                        <Sparkles className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      </div>
                      <p className="font-medium">Finishing</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Waiting</span>
                        <span className="font-medium text-warning">{finishingStats.waiting}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">In Progress</span>
                        <span className="font-medium text-primary">{finishingStats.inProgress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completed</span>
                        <span className="font-medium text-green-600">{finishingStats.completed}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link to={`/orders/${id}/packaging`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                        <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      </div>
                      <p className="font-medium">Packaging</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Waiting</span>
                        <span className="font-medium text-warning">{packagingStats.waiting}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">In Progress</span>
                        <span className="font-medium text-primary">{packagingStats.inProgress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completed</span>
                        <span className="font-medium text-green-600">{packagingStats.completed}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>

              <Link to={`/orders/${id}/boxing`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
                        <Box className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <p className="font-medium">Boxing</p>
                    </div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Waiting</span>
                        <span className="font-medium text-warning">{boxingStats.waiting}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">In Progress</span>
                        <span className="font-medium text-primary">{boxingStats.inProgress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Completed</span>
                        <span className="font-medium text-green-600">{boxingStats.completed}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extra Inventory */}
      <Card>
        <CardHeader>
          <CardTitle>Extra Inventory</CardTitle>
          <CardDescription>Available extra items that can be used for this order</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['manufacturing', 'finishing', 'packaging', 'boxing'] as const).map((phase) => (
              <Button
                key={phase}
                variant="outline"
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => {
                  setSelectedExtraPhase(phase);
                  setExtraInventoryOpen(true);
                }}
              >
                <span className="text-2xl font-bold text-primary">{extraInventoryCounts[phase] || 0}</span>
                <span className="text-xs text-muted-foreground capitalize">{phase}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shipments */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Shipments</CardTitle>
            <CardDescription>View and manage order shipments</CardDescription>
          </div>
          <Button variant="outline" onClick={() => setShipmentDialogOpen(true)}>
            View Shipments
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <span className="text-sm">
                {shippedItems} / {totalItems} items shipped
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Order Items</CardTitle>
          <CardDescription>Products included in this order</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">SKU</th>
                  <th className="text-center p-3 font-medium">Quantity</th>
                  <th className="text-center p-3 font-medium">Packing</th>
                  <th className="text-center p-3 font-medium">Boxing</th>
                  <th className="text-center p-3 font-medium">Progress</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => {
                  const itemBatches = activeBatches.filter((b) => b.order_item_id === item.id);
                  const itemShipped = itemBatches
                    .filter((b) => b.current_state === "shipped")
                    .reduce((sum, b) => sum + b.quantity, 0);
                  const progress = item.quantity > 0 ? Math.round((itemShipped / item.quantity) * 100) : 0;

                  return (
                    <tr key={item.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">{item.product?.name || "Unknown"}</td>
                      <td className="p-3 font-mono text-sm">{item.product?.sku || "N/A"}</td>
                      <td className="p-3 text-center">{item.quantity}</td>
                      <td className="p-3 text-center">
                        {item.product?.needs_packing ? (
                          <Badge variant="outline" className="bg-primary/10">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.needs_boxing ? (
                          <Badge variant="outline" className="bg-primary/10">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="secondary">No</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-green-600 transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">{progress}%</span>
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
        batches={(order?.batches || []).filter(b => b.is_flagged || b.is_redo).map(b => ({
          id: b.id,
          batch_code: b.qr_code_data,
          product_name: b.product.name,
          product_sku: b.product.sku,
          quantity: b.quantity,
          current_state: b.current_state,
          is_flagged: b.is_flagged || false,
          is_redo: b.is_redo || false,
        }))}
        onRefresh={() => fetchOrder()}
      />
      <ShipmentDialog 
        open={shipmentDialogOpen} 
        onOpenChange={setShipmentDialogOpen} 
        orderId={id!}
        orderNumber={order?.order_number || ''}
        receivedBatches={(order?.batches || []).filter(b => b.current_state === 'shipped').map(b => ({
          id: b.id,
          batch_code: b.qr_code_data,
          product_id: b.product_id,
          product_name: b.product.name,
          product_sku: b.product.sku,
          quantity: b.quantity,
        }))}
        onRefresh={() => fetchOrder()}
      />
      <ExtraInventoryDialog 
        open={extraInventoryOpen} 
        onOpenChange={setExtraInventoryOpen} 
        orderId={id!}
        phase={selectedExtraPhase}
        orderItems={orderItems.map(item => ({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
        }))}
        onItemsSelected={(selections) => {
          fetchOrder();
          fetchExtraInventoryCounts();
        }}
      />
      <StartOrderDialog
        open={startOrderOpen}
        onOpenChange={setStartOrderOpen}
        orderId={id!}
        orderItems={orderItems.map(item => ({
          id: item.id,
          product_id: item.product_id,
          quantity: item.quantity,
          product: item.product,
        }))}
        onOrderStarted={() => {
          fetchOrder();
          fetchExtraInventoryCounts();
        }}
      />
    </div>
  );
}
