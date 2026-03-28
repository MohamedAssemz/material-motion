import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RawMaterialsDrawer } from "@/components/RawMaterialsDrawer";

import { ShipmentDialog } from "@/components/ShipmentDialog";
import { ExtraInventoryDialog } from "@/components/ExtraInventoryDialog";
import { StartOrderDialog } from "@/components/StartOrderDialog";
import { OrderCommentsDrawer } from "@/components/OrderCommentsDrawer";
import { PackagingReferenceDisplay } from "@/components/PackagingReferenceDisplay";
import { toast } from "sonner";
import { format } from "date-fns";
import { escapeHtml } from "@/lib/sanitize";
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
  MessageSquare,
  StickyNote,
  ChevronDown,
  Pencil,
} from "lucide-react";
import { EditOrderDialog } from "@/components/EditOrderDialog";
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
  product: {
    id: string;
    name_en: string;
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
  processed: number;
  retrieved: number;
  completed: number;
  addedToExtra: number;
  extraToRetrieve: number;
}

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  deducted_to_extra: number;
  needs_boxing: boolean;
  is_special?: boolean;
  initial_state?: string | null;
  size?: string | null;
  product: {
    id: string;
    name_en: string;
    name_ar: string | null;
    sku: string;
    needs_packing: boolean;
    color_en: string | null;
    color_ar: string | null;
  };
}

export default function OrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const { t, language } = useLanguage();
  const [order, setOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [rawMaterialsOpen, setRawMaterialsOpen] = useState(false);

  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [extraInventoryOpen, setExtraInventoryOpen] = useState(false);
  const [startOrderOpen, setStartOrderOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [packagingRefOpen, setPackagingRefOpen] = useState(false);
  const [editOrderOpen, setEditOrderOpen] = useState(false);
  const [selectedExtraPhase, setSelectedExtraPhase] = useState<"manufacturing" | "finishing" | "packaging" | "boxing">(
    "manufacturing",
  );
  const [extraInventoryCounts, setExtraInventoryCounts] = useState<Record<string, number>>({});
  const [commitSummary, setCommitSummary] = useState<Array<{ product_id: string; order_item_id: string; reserved: number; consumed: number; unretrieved: number; productName: string; productSku: string }>>([]);
  const [commitDialogOpen, setCommitDialogOpen] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [reservedExtraCounts, setReservedExtraCounts] = useState<Record<string, number>>({});
  const [addedToExtraCounts, setAddedToExtraCounts] = useState<Record<string, number>>({});
  const [retrievedFromExtraCounts, setRetrievedFromExtraCounts] = useState<Record<string, number>>({});

  // Selection states for inline actions
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [activePhase, setActivePhase] = useState<string | null>(null);

  useEffect(() => {
    fetchOrder();
    fetchReservedExtraCounts();
    fetchAddedToExtraCounts();
    fetchRetrievedFromExtraCounts();
    const channel = supabase
      .channel(`order-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_batches", filter: `order_id=eq.${id}` },
        () => {
          fetchOrder();
        },
      )
      .subscribe();

    const extraChannel = supabase
      .channel("extra-inventory-counts")
      .on("postgres_changes", { event: "*", schema: "public", table: "extra_batches" }, () => {
        fetchExtraInventoryCounts();
        fetchReservedExtraCounts();
        fetchAddedToExtraCounts();
        fetchRetrievedFromExtraCounts();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(extraChannel);
    };
  }, [id]);

  useEffect(() => {
    if (orderItems.length > 0) {
      fetchExtraInventoryCounts();
    } else {
      setExtraInventoryCounts({});
    }
  }, [orderItems]);

  const fetchOrder = async () => {
    try {
      const [orderRes, orderItemsRes] = await Promise.all([
        supabase.from("orders").select(`*, customer:customers(name, code)`).eq("id", id).maybeSingle(),
        supabase
          .from("order_items")
          .select("id, product_id, quantity, deducted_to_extra, needs_boxing, is_special, initial_state, size, product:products(id, name_en, name_ar, sku, needs_packing, color_en, color_ar)")
          .eq("order_id", id),
      ]);

      const { data: orderData, error: orderError } = orderRes;
      if (orderError) throw orderError;
      if (!orderData) {
        setLoading(false);
        return;
      }

      const { data: batchesData, error: batchesError } = await supabase
        .from("order_batches")
        .select(
          "id, qr_code_data, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, from_extra_state, product:products(id, name_en, sku, needs_packing)",
        )
        .eq("order_id", id);

      if (batchesError) throw batchesError;

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
      const states = [
        { phase: "manufacturing", state: "extra_manufacturing" },
        { phase: "finishing", state: "extra_finishing" },
        { phase: "packaging", state: "extra_packaging" },
        { phase: "boxing", state: "extra_boxing" },
      ];

      const orderProductIds = orderItems.map((oi) => oi.product_id);
      const boxingEligibleProductIds = orderItems.filter((oi) => oi.needs_boxing).map((oi) => oi.product_id);

      if (orderProductIds.length === 0) {
        setExtraInventoryCounts({});
        return;
      }

      const counts: Record<string, number> = {};

      for (const { phase, state } of states) {
        const productIds = state === "extra_boxing" ? boxingEligibleProductIds : orderProductIds;

        if (productIds.length === 0) {
          counts[phase] = 0;
          continue;
        }

        const { data, error } = await supabase
          .from("extra_batches")
          .select("quantity")
          .eq("inventory_state", "AVAILABLE")
          .eq("current_state", state)
          .in("product_id", productIds);

        if (!error && data) {
          counts[phase] = data.reduce((sum, b) => sum + b.quantity, 0);
        }
      }

      setExtraInventoryCounts(counts);
    } catch (error) {
      console.error("Error fetching extra inventory counts:", error);
    }
  };

  const fetchReservedExtraCounts = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from("extra_batches")
        .select("current_state, quantity")
        .eq("order_id", id)
        .eq("inventory_state", "RESERVED");

      if (error) throw error;

      const phaseMap: Record<string, string> = {
        extra_manufacturing: "manufacturing",
        extra_finishing: "finishing",
        extra_packaging: "packaging",
        extra_boxing: "boxing",
      };

      const counts: Record<string, number> = { manufacturing: 0, finishing: 0, packaging: 0, boxing: 0 };
      (data || []).forEach((batch) => {
        const phase = phaseMap[batch.current_state];
        if (phase) counts[phase] += batch.quantity;
      });

      setReservedExtraCounts(counts);
    } catch (error) {
      console.error("Error fetching reserved extra counts:", error);
    }
  };

  const fetchAddedToExtraCounts = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from("extra_batch_history")
        .select("from_state, quantity")
        .eq("event_type", "CREATED")
        .eq("source_order_id", id);

      if (error) throw error;

      const phaseMap: Record<string, string> = {
        in_manufacturing: "manufacturing",
        in_finishing: "finishing",
        in_packaging: "packaging",
        in_boxing: "boxing",
      };

      const counts: Record<string, number> = { manufacturing: 0, finishing: 0, packaging: 0, boxing: 0 };
      (data || []).forEach((record) => {
        const phase = phaseMap[record.from_state || ""];
        if (phase) counts[phase] += record.quantity;
      });

      setAddedToExtraCounts(counts);
    } catch (error) {
      console.error("Error fetching added to extra counts:", error);
    }
  };

  const fetchRetrievedFromExtraCounts = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from("extra_batch_history")
        .select("from_state, quantity")
        .eq("event_type", "CONSUMED")
        .eq("consuming_order_id", id);

      if (error) throw error;

      const phaseMap: Record<string, string> = {
        extra_manufacturing: "manufacturing",
        extra_finishing: "finishing",
        extra_packaging: "packaging",
        extra_boxing: "boxing",
      };

      const counts: Record<string, number> = { manufacturing: 0, finishing: 0, packaging: 0, boxing: 0 };
      (data || []).forEach((record) => {
        const phase = phaseMap[record.from_state || ""];
        if (phase) counts[phase] += record.quantity;
      });

      setRetrievedFromExtraCounts(counts);
    } catch (error) {
      console.error("Error fetching retrieved from extra counts:", error);
    }
  };

  const prepareCommitSummary = async () => {
    if (!id) return;
    try {
      // Fetch all reserved batches for this order
      const { data: reserved, error: resErr } = await supabase
        .from("extra_batches")
        .select("order_item_id, product_id, quantity, product:products(name_en, sku)")
        .eq("order_id", id)
        .eq("inventory_state", "RESERVED");
      if (resErr) throw resErr;
      if (!reserved || reserved.length === 0) {
        toast.error("No reserved extra batches to commit");
        return;
      }

      // Fetch consumed history
      const { data: consumed, error: conErr } = await supabase
        .from("extra_batch_history")
        .select("consuming_order_item_id, quantity")
        .eq("event_type", "CONSUMED")
        .eq("consuming_order_id", id);
      if (conErr) throw conErr;

      // Group reserved by order_item_id + product_id
      const grouped = new Map<string, { product_id: string; order_item_id: string; reserved: number; productName: string; productSku: string }>();
      (reserved || []).forEach((b: any) => {
        const key = `${b.order_item_id}-${b.product_id}`;
        if (!grouped.has(key)) {
          grouped.set(key, {
            product_id: b.product_id,
            order_item_id: b.order_item_id,
            reserved: 0,
            productName: b.product?.name_en || "Unknown",
            productSku: b.product?.sku || "N/A",
          });
        }
        grouped.get(key)!.reserved += b.quantity;
      });

      // Sum consumed per order_item
      const consumedMap = new Map<string, number>();
      (consumed || []).forEach((h: any) => {
        consumedMap.set(h.consuming_order_item_id, (consumedMap.get(h.consuming_order_item_id) || 0) + h.quantity);
      });

      const summary = Array.from(grouped.values()).map((g) => {
        const consumed = consumedMap.get(g.order_item_id) || 0;
        return {
          ...g,
          reserved: g.reserved + consumed, // original reservation = current qty + consumed
          consumed,
          unretrieved: g.reserved, // current batch qty IS the unretrieved amount
        };
      });

      setCommitSummary(summary);
      setCommitDialogOpen(true);
    } catch (error) {
      console.error("Error preparing commit summary:", error);
      toast.error("Failed to load commit summary");
    }
  };

  const handleCommitExtra = async () => {
    if (!id || !user) return;
    setCommitLoading(true);
    try {
      const { data, error } = await supabase.rpc("commit_extra_inventory", {
        p_order_id: id,
        p_user_id: user.id,
      });
      if (error) throw error;

      const result = data as any;
      toast.success(`${t("orders.commit_success")}: ${result.total_released} ${t("orders.commit_released")}, ${result.total_requeued} ${t("orders.commit_requeued")}`);
      setCommitDialogOpen(false);
      fetchOrder();
      fetchReservedExtraCounts();
      fetchExtraInventoryCounts();
    } catch (error: any) {
      console.error("Commit error:", error);
      toast.error(error.message || "Failed to commit extra inventory");
    } finally {
      setCommitLoading(false);
    }
  };

  const handleCancelOrder = async () => {
    try {
      await supabase
        .from("extra_batches")
        .update({
          inventory_state: "AVAILABLE",
          order_id: null,
          order_item_id: null,
        })
        .eq("order_id", id)
        .eq("inventory_state", "RESERVED");

      const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;

      toast.success(t("toast.success"));
      navigate("/orders");
    } catch (error) {
      console.error("Error cancelling order:", error);
      toast.error(t("toast.action_failed"));
    }
  };

  const handlePrintOrder = () => {
    if (!order) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const itemsList = orderItems.map((item) => ({
      name: item.product?.name_en || "Unknown",
      sku: item.product?.sku || "N/A",
      quantity: item.quantity,
    }));

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
            <div class="order-number">${escapeHtml(order.order_number)}</div>
            <div class="meta">
              Customer: ${escapeHtml(order.customer?.name || "N/A")} | 
              Priority: <span class="badge ${escapeHtml(order.priority || "normal")}">${escapeHtml(order.priority || "normal")}</span> |
              Shipping: ${order.shipping_type === "international" ? "International" : "Domestic"}
            </div>
            <div class="meta">Created: ${format(new Date(order.created_at), "PPP")}</div>
            ${order.estimated_fulfillment_time ? `<div class="meta">EFT: ${format(new Date(order.estimated_fulfillment_time), "PPP")}</div>` : ""}
          </div>

          <div class="section">
            <div class="section-title">Order Items</div>
            <table>
              <tr><th>Product</th><th>SKU</th><th>Quantity</th></tr>
              ${itemsList
                .map(
                  (item) => `
                <tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.sku)}</td><td>${item.quantity}</td></tr>
              `,
                )
                .join("")}
            </table>
          </div>

          ${order.notes ? `<div class="section"><div class="section-title">Notes</div><p>${escapeHtml(order.notes)}</p></div>` : ""}

          <script>
            setTimeout(function() {
              window.print();
            }, 100);
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const canUpdate = hasRole("admin");
  const canDelete = hasRole("admin");

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
          {t("orders.back_to_orders")}
        </Button>
        <p className="text-center text-muted-foreground mt-8">{t("orders.not_found")}</p>
      </div>
    );
  }

  const activeBatches = order.batches;
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const deductedToExtra = orderItems.reduce((sum, item) => sum + (item.deducted_to_extra || 0), 0);
  const shippedItems = activeBatches
    .filter((b) => b.current_state === "shipped")
    .reduce((sum, b) => sum + b.quantity, 0);

  const isPendingOrder = order.status === "pending" || order.status === "waiting_for_rm";

  const getPhaseStats = (
    inState: string,
    readyState: string | undefined,
    phaseName: string,
    phaseFilter?: (batch: Batch) => boolean,
  ): PhaseStats => {
    const relevantBatches = phaseFilter ? activeBatches.filter(phaseFilter) : activeBatches;

    const waiting = readyState
      ? relevantBatches.filter((b) => b.current_state === readyState).reduce((sum, b) => sum + b.quantity, 0)
      : 0;
    const inProgress = relevantBatches
      .filter((b) => b.current_state === inState)
      .reduce((sum, b) => sum + b.quantity, 0);
    const stateIndex = getAllStates().indexOf(inState as UnitState);

    const laterExtraStates: Record<string, string[]> = {
      manufacturing: ["extra_finishing", "extra_packaging", "extra_boxing"],
      finishing: ["extra_packaging", "extra_boxing"],
      packaging: ["extra_boxing"],
      boxing: [],
    };
    const excludeStates = laterExtraStates[phaseName] || [];

    // Special items only count in the phase matching their initial_state
    const phaseToInState: Record<string, string> = {
      manufacturing: "in_manufacturing",
      finishing: "in_finishing",
      packaging: "in_packaging",
      boxing: "in_boxing",
    };
    const currentPhaseInState = phaseToInState[phaseName];

    const pastStateBatches = relevantBatches.filter((b) => {
      if (getAllStates().indexOf(b.current_state as UnitState) <= stateIndex) return false;
      if (excludeStates.includes((b as any).from_extra_state)) return false;
      // Exclude special items that didn't go through this phase
      const orderItem = orderItems.find(oi => oi.id === b.order_item_id);
      if (orderItem?.is_special && orderItem.initial_state !== currentPhaseInState) return false;
      return true;
    });

    const retrieved = retrievedFromExtraCounts[phaseName] || 0;
    const totalPast = pastStateBatches.reduce((sum, b) => sum + b.quantity, 0);

    const phaseExtraState = `extra_${phaseName}`;
    const processedByLabels = pastStateBatches
      .filter((b) => (b as any).from_extra_state !== phaseExtraState)
      .reduce((sum, b) => sum + b.quantity, 0);
    const processedByDiff = Math.max(0, totalPast - retrieved);
    const processed = Math.max(processedByLabels, processedByDiff);
    const completed = processed + retrieved;

    const addedToExtra = addedToExtraCounts[phaseName] || 0;
    const extraToRetrieve = reservedExtraCounts[phaseName] || 0;
    return { waiting, inProgress, processed, retrieved, completed, addedToExtra, extraToRetrieve };
  };

  const manufacturingStats = getPhaseStats("in_manufacturing", undefined, "manufacturing");
  const finishingStats = getPhaseStats("in_finishing", "ready_for_finishing", "finishing");
  const packagingStats = getPhaseStats(
    "in_packaging",
    "ready_for_packaging",
    "packaging",
    (b) => b.product?.needs_packing !== false,
  );
  const boxingStats = getPhaseStats("in_boxing", "ready_for_boxing", "boxing", (b) => {
    const orderItem = orderItems.find((oi) => oi.id === b.order_item_id);
    return orderItem?.needs_boxing !== false;
  });

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
            name: batch.product?.name_en || "Unknown",
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
      product_name: b.product?.name_en || "Unknown",
      product_sku: b.product?.sku || "N/A",
      quantity: b.quantity,
    }));

  const orderState = (() => {
    if (order.status === "cancelled") return t("status.cancelled");
    if (order.status === "completed" || (shippedItems + deductedToExtra >= totalItems && totalItems > 0)) return t("status.fulfilled");
    if (order.status === "in_progress") return t("status.in_progress");
    return t("status.pending");
  })();

  // Helper to render phase stats card
  const renderPhaseStats = (stats: PhaseStats) => (
    <div className="space-y-1 text-sm">
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("orders.waiting")}</span>
        <span className="font-medium text-warning">{stats.waiting}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("orders.in_progress_label")}</span>
        <span className="font-medium text-primary">{stats.inProgress}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">{t("orders.processed")}</span>
        <span className="font-medium text-green-600">{stats.processed}</span>
      </div>
      {stats.retrieved > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("orders.retrieved")}</span>
          <span className="font-medium text-purple-600">{stats.retrieved}</span>
        </div>
      )}
      {stats.addedToExtra > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("orders.added_to_extra_label")}</span>
          <span className="font-medium text-orange-600">{stats.addedToExtra}</span>
        </div>
      )}
      {stats.extraToRetrieve > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("orders.extra_to_retrieve")}</span>
          <span className="font-medium text-amber-600">{stats.extraToRetrieve}</span>
        </div>
      )}
      <div className="flex justify-between border-t pt-1 mt-1">
        <span className="font-medium text-muted-foreground">{t("orders.completed_label")}</span>
        <span className="font-bold">{stats.completed}</span>
      </div>
    </div>
  );

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
              {order.status === "cancelled" && <Badge variant="destructive">{t("status.cancelled")}</Badge>}
              {order.priority === "high" && <Badge variant="destructive">{t("orders.high_priority")}</Badge>}
              <Badge variant={orderState === t("status.fulfilled") ? "default" : "secondary"}>{orderState}</Badge>
            </div>
            <p className="text-muted-foreground">
              {order.customer?.name || t("orders.no_customer")} · {t("table.created")}{" "}
              {format(new Date(order.created_at), "PPP")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPendingOrder && canUpdate && (
            <Button onClick={() => setStartOrderOpen(true)}>
              <Play className="h-4 w-4 mr-1" />
              {t("orders.start_order")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handlePrintOrder}>
            <Printer className="h-4 w-4 mr-1" />
            {t("common.print")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <StickyNote className="h-4 w-4 mr-1" />
                {t("common.notes")}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRawMaterialsOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                {t("orders.raw_materials")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPackagingRefOpen(true)}>
                <Package className="h-4 w-4 mr-2" />
                {t("orders.packaging_reference")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCommentsOpen(true)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                {t("orders.comments")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canUpdate && order?.status === "in_progress" && Object.values(reservedExtraCounts).reduce((s, c) => s + c, 0) > 0 && (
            <Button variant="outline" size="sm" onClick={prepareCommitSummary}>
              <CheckCircle className="h-4 w-4 mr-1" />
              {t("orders.commit_extra")}
            </Button>
          )}
          {canDelete && order?.status !== "cancelled" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  {t("orders.cancel_order")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("orders.cancel_order")}</AlertDialogTitle>
                  <AlertDialogDescription>{t("orders.cancel_confirm_desc")}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("orders.go_back")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelOrder}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {t("orders.cancel_order")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Order Summary */}
      {(() => {
        const totalAddedToExtra = Object.values(addedToExtraCounts).reduce((sum, count) => sum + count, 0);
        return (
          <div className={`grid grid-cols-1 gap-4 ${totalAddedToExtra > 0 ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("orders.total_items")}</p>
                <p className="text-2xl font-bold">{totalItems}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("orders.shipped")}</p>
                <p className="text-2xl font-bold text-green-600">{shippedItems}</p>
              </CardContent>
            </Card>
            {totalAddedToExtra > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{t("orders.added_to_extra")}</p>
                  <p className="text-2xl font-bold text-orange-500 flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {totalAddedToExtra}
                  </p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("orders.shipping")}</p>
                <p className="text-2xl font-bold flex items-center gap-2">
                  {order.shipping_type === "international" ? (
                    <>
                      <Plane className="h-5 w-5" /> {t("orders.international")}
                    </>
                  ) : (
                    <>
                      <Truck className="h-5 w-5" /> {t("orders.domestic")}
                    </>
                  )}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{t("orders.eft")}</p>
                <p className="text-2xl font-bold">
                  {order.estimated_fulfillment_time
                    ? format(new Date(order.estimated_fulfillment_time), "MMM d")
                    : t("orders.not_set")}
                </p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Notes */}
      {order.notes && (
        <div className="space-y-2">
          {(() => {
            const notes = order.notes || "";
            const startTag = "---PACKAGING_REFERENCE---";
            const endTag = "---END_PACKAGING_REFERENCE---";
            const startIdx = notes.indexOf(startTag);
            const endIdx = notes.indexOf(endTag);
            let displayNotes = notes;
            if (startIdx !== -1 && endIdx !== -1) {
              displayNotes = (notes.substring(0, startIdx) + notes.substring(endIdx + endTag.length)).trim();
            }
            if (!displayNotes) return null;
            return (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium mb-1">{t("common.notes")}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{displayNotes}</p>
                </CardContent>
              </Card>
            );
          })()}
        </div>
      )}

      {/* Production Timeline - Only show after order starts */}
      {!isPendingOrder && (
      <Card>
        <CardHeader>
          <CardTitle>
            {t("orders.production_timeline")}
          </CardTitle>
          <CardDescription>{t("orders.track_progress")}</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Link to={`/orders/${id}/manufacturing`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <Factory className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <p className="font-medium">{t("state.manufacturing")}</p>
                    </div>
                    {renderPhaseStats(manufacturingStats)}
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
                      <p className="font-medium">{t("state.finishing")}</p>
                    </div>
                    {renderPhaseStats(finishingStats)}
                  </CardContent>
                </Card>
              </Link>

              <Link to={`/orders/${id}/packaging`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                        <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                      </div>
                      <p className="font-medium">{t("state.packaging")}</p>
                    </div>
                    {renderPhaseStats(packagingStats)}
                  </CardContent>
                </Card>
              </Link>

              <Link to={`/orders/${id}/boxing`} className="block">
                <Card className="hover:border-primary transition-colors cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
                        <Box className="h-5 w-5 text-green-600 dark:text-green-400" />
                      </div>
                      <p className="font-medium">{t("state.boxing")}</p>
                    </div>
                    {renderPhaseStats(boxingStats)}
                  </CardContent>
                </Card>
              </Link>
            </div>
        </CardContent>
      </Card>
      )}

      {/* Extra Inventory - Only show for pending orders */}
      {isPendingOrder && canUpdate && (
        <Card>
          <CardHeader>
            <CardTitle>{t("orders.extra_inventory")}</CardTitle>
            <CardDescription>{t("orders.available_extra")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(["manufacturing", "finishing", "packaging", "boxing"] as const).map((phase) => (
                <Button
                  key={phase}
                  variant="outline"
                  className="h-auto py-4 flex flex-col items-center gap-2 [&>span]:hover:text-inherit"
                  onClick={() => {
                    setSelectedExtraPhase(phase);
                    setExtraInventoryOpen(true);
                  }}
                >
                  <span className="text-2xl font-bold text-primary hover:text-primary">
                    {extraInventoryCounts[phase] || 0}
                  </span>
                  <span className="text-xs text-muted-foreground hover:text-muted-foreground">
                    {t(`state.${phase}`)}
                  </span>
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Shipments - Only show after order starts */}
      {!isPendingOrder && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>{t("orders.shipments")}</CardTitle>
              <CardDescription>{t("orders.view_manage_shipments")}</CardDescription>
            </div>
            <Button variant="outline" onClick={() => navigate(`/orders/${id}/boxing?tab=shipments`)}>
              {t("orders.view_shipments")}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm">
                  {shippedItems} / {totalItems} {t("orders.items_shipped")}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Items Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{t("orders.order_items")}</CardTitle>
            <CardDescription>{t("orders.products_in_order")}</CardDescription>
          </div>
          {canUpdate && order.status !== 'cancelled' && (
            <Button variant="outline" size="sm" onClick={() => setEditOrderOpen(true)}>
              <Pencil className="h-4 w-4 me-1" />
              {t("orders.edit_order")}
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-start p-3 font-medium">{t("common.product")}</th>
                  <th className="text-center p-3 font-medium">{t("catalog.size")}</th>
                  <th className="text-center p-3 font-medium">{t("catalog.color")}</th>
                  <th className="text-center p-3 font-medium">{t("common.quantity")}</th>
                  <th className="text-center p-3 font-medium">{t("orders.packing")}</th>
                   <th className="text-center p-3 font-medium">{t("orders.boxing_col")}</th>
                  <th className="text-center p-3 font-medium">{t("order.special")}</th>
                  <th className="text-center p-3 font-medium">{t("orders.progress")}</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item) => {
                  const itemBatches = activeBatches.filter(
                    (b) =>
                      b.order_item_id === item.id || (b.order_item_id === null && b.product_id === item.product_id),
                  );
                  const itemShipped = itemBatches
                    .filter((b) => b.current_state === "shipped")
                    .reduce((sum, b) => sum + b.quantity, 0);
                  const progress = item.quantity > 0 ? Math.round((itemShipped / item.quantity) * 100) : 0;
                  return (
                    <tr key={item.id} className="border-b hover:bg-muted/50">
                      <td className="p-3">
                        <p className="font-medium">
                          {language === 'ar' ? (item.product?.name_ar || item.product?.name_en || "Unknown") : (item.product?.name_en || "Unknown")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {language === 'ar' ? item.product?.name_en : item.product?.name_ar}
                        </p>
                        {item.product?.sku && (
                          <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.product.sku}</p>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.size ? (
                          <Badge variant="outline">{item.size}</Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {(() => {
                          const color = language === 'ar' ? (item.product?.color_ar || item.product?.color_en) : (item.product?.color_en || item.product?.color_ar);
                          return color ? (
                            <span className="text-sm">{color}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-center">{item.quantity}</td>
                      <td className="p-3 text-center">
                        {item.product?.needs_packing ? (
                          <Badge variant="outline" className="bg-primary/10">
                            {t("common.yes")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t("common.no")}</Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.needs_boxing ? (
                          <Badge variant="outline" className="bg-primary/10">
                            {t("common.yes")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t("common.no")}</Badge>
                        )}
                      </td>
                      <td className="p-3 text-center">
                        {item.is_special ? (
                          <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300 text-xs">
                            ⚡ {(item.initial_state || 'in_manufacturing').replace('in_', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2 justify-center">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-green-600 transition-all" style={{ width: `${progress}%` }} />
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
      <RawMaterialsDrawer
        open={rawMaterialsOpen}
        onOpenChange={setRawMaterialsOpen}
        orderId={id!}
        orderNumber={order?.order_number || ""}
      />
      <ShipmentDialog
        open={shipmentDialogOpen}
        onOpenChange={setShipmentDialogOpen}
        orderId={id!}
        orderNumber={order?.order_number || ""}
        receivedBatches={(order?.batches || [])
          .filter((b) => b.current_state === "shipped")
          .map((b) => ({
            id: b.id,
            batch_code: b.qr_code_data,
            product_id: b.product_id,
            product_name: b.product?.name_en || "Unknown",
            product_sku: b.product?.sku || "N/A",
            quantity: b.quantity,
          }))}
        onRefresh={fetchOrder}
      />
      <ExtraInventoryDialog
        open={extraInventoryOpen}
        onOpenChange={setExtraInventoryOpen}
        phase={selectedExtraPhase}
        orderId={id!}
        orderItems={orderItems.map((oi) => ({
          id: oi.id,
          product_id: oi.product_id,
          quantity: oi.quantity,
          needs_boxing: oi.needs_boxing,
          needs_packing: oi.product?.needs_packing ?? true,
        }))}
        onItemsSelected={() => {
          fetchOrder();
          fetchExtraInventoryCounts();
        }}
      />
      <StartOrderDialog
        open={startOrderOpen}
        onOpenChange={setStartOrderOpen}
        orderId={id!}
        orderItems={orderItems}
        onOrderStarted={() => {
          fetchOrder();
        }}
      />
      <OrderCommentsDrawer
        orderId={id!}
        orderNumber={order?.order_number || ""}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />
      <Dialog open={packagingRefOpen} onOpenChange={setPackagingRefOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("orders.packaging_reference")}</DialogTitle>
          </DialogHeader>
          <PackagingReferenceDisplay notes={order?.notes || null} />
        </DialogContent>
      </Dialog>

      {/* Commit Extra Inventory Dialog */}
      <AlertDialog open={commitDialogOpen} onOpenChange={setCommitDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("orders.commit_extra")}</AlertDialogTitle>
            <AlertDialogDescription>{t("orders.commit_extra_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 my-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-start p-2 font-medium">{t("common.product")}</th>
                  <th className="text-center p-2 font-medium">{t("orders.commit_reserved")}</th>
                  <th className="text-center p-2 font-medium">{t("orders.commit_retrieved")}</th>
                  <th className="text-center p-2 font-medium">{t("orders.commit_unretrieved")}</th>
                </tr>
              </thead>
              <tbody>
                {commitSummary.map((item, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground font-mono">{item.productSku}</p>
                    </td>
                    <td className="p-2 text-center">{item.reserved}</td>
                    <td className="p-2 text-center text-green-600">{item.consumed}</td>
                    <td className="p-2 text-center text-amber-600 font-medium">{item.unretrieved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={commitLoading}>{t("orders.go_back")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleCommitExtra} disabled={commitLoading}>
              {commitLoading ? t("common.loading") : t("orders.commit_extra")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditOrderDialog
        open={editOrderOpen}
        onOpenChange={setEditOrderOpen}
        orderId={id!}
        orderStatus={order.status}
        orderItems={orderItems}
        currentEft={order.estimated_fulfillment_time}
        onSaved={fetchOrder}
      />
    </div>
  );
}
