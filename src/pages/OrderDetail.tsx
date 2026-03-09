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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RawMaterialsDrawer } from "@/components/RawMaterialsDrawer";

import { ShipmentDialog } from "@/components/ShipmentDialog";
import { BoxAssignmentDialog } from "@/components/BoxAssignmentDialog";
import { LeadTimeDialog } from "@/components/LeadTimeDialog";
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
  
  const [shipmentDialogOpen, setShipmentDialogOpen] = useState(false);
  const [boxAssignDialogOpen, setBoxAssignDialogOpen] = useState(false);
  const [leadTimeDialogOpen, setLeadTimeDialogOpen] = useState(false);
  const [extraInventoryOpen, setExtraInventoryOpen] = useState(false);
  const [startOrderOpen, setStartOrderOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [packagingRefOpen, setPackagingRefOpen] = useState(false);
  const [selectedExtraPhase, setSelectedExtraPhase] = useState<'manufacturing' | 'finishing' | 'packaging' | 'boxing'>('manufacturing');
  const [extraInventoryCounts, setExtraInventoryCounts] = useState<Record<string, number>>({});
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
      .on("postgres_changes", { event: "*", schema: "public", table: "order_batches", filter: `order_id=eq.${id}` }, () => {
        fetchOrder();
      })
      .subscribe();

    const extraChannel = supabase
      .channel('extra-inventory-counts')
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

  // Fetch extra inventory counts only when orderItems are loaded
  useEffect(() => {
    if (orderItems.length > 0) {
      fetchExtraInventoryCounts();
    } else {
      // Reset counts if no order items
      setExtraInventoryCounts({});
    }
  }, [orderItems]);

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
        .select("id, qr_code_data, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, from_extra_state, product:products(id, name, sku, needs_packing)")
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

      // Get product IDs from order items to filter extra inventory
      const orderProductIds = orderItems.map(oi => oi.product_id);
      
      // Get product IDs that have at least one needs_boxing=true order item
      // extra_boxing batches can ONLY be used by items that need boxing
      const boxingEligibleProductIds = orderItems
        .filter(oi => oi.needs_boxing)
        .map(oi => oi.product_id);

      // If no order items, return empty counts
      if (orderProductIds.length === 0) {
        setExtraInventoryCounts({});
        return;
      }

      const counts: Record<string, number> = {};

      for (const { phase, state } of states) {
        // For extra_boxing, only count products with needs_boxing=true items
        const productIds = state === 'extra_boxing' 
          ? boxingEligibleProductIds 
          : orderProductIds;
        
        // If no eligible products for this state, count is 0
        if (productIds.length === 0) {
          counts[phase] = 0;
          continue;
        }
        
        // Only fetch extra batches that match products in this order
        const { data, error } = await supabase
          .from('extra_batches')
          .select('quantity')
          .eq('inventory_state', 'AVAILABLE')
          .eq('current_state', state)
          .in('product_id', productIds);

        if (!error && data) {
          counts[phase] = data.reduce((sum, b) => sum + b.quantity, 0);
        }
      }

      setExtraInventoryCounts(counts);
    } catch (error) {
      console.error('Error fetching extra inventory counts:', error);
    }
  };

  const fetchReservedExtraCounts = async () => {
    if (!id) return;
    
    try {
      // Fetch reserved extra batches for this specific order
      const { data, error } = await supabase
        .from('extra_batches')
        .select('current_state, quantity')
        .eq('order_id', id)
        .eq('inventory_state', 'RESERVED');

      if (error) throw error;

      // Map extra batch states to phase names
      const phaseMap: Record<string, string> = {
        'extra_manufacturing': 'manufacturing',
        'extra_finishing': 'finishing',
        'extra_packaging': 'packaging',
        'extra_boxing': 'boxing',
      };

      const counts: Record<string, number> = {
        manufacturing: 0,
        finishing: 0,
        packaging: 0,
        boxing: 0,
      };

      (data || []).forEach((batch) => {
        const phase = phaseMap[batch.current_state];
        if (phase) {
          counts[phase] += batch.quantity;
        }
      });

      setReservedExtraCounts(counts);
    } catch (error) {
      console.error('Error fetching reserved extra counts:', error);
    }
  };

  const fetchAddedToExtraCounts = async () => {
    if (!id) return;
    
    try {
      // Fetch from extra_batch_history - CREATED events where this order was the source
      // This tracks items moved from this order to extra inventory permanently
      const { data, error } = await supabase
        .from('extra_batch_history')
        .select('from_state, quantity')
        .eq('event_type', 'CREATED')
        .eq('source_order_id', id);

      if (error) throw error;

      // Map from_state to phase names
      const phaseMap: Record<string, string> = {
        'in_manufacturing': 'manufacturing',
        'in_finishing': 'finishing',
        'in_packaging': 'packaging',
        'in_boxing': 'boxing',
      };

      const counts: Record<string, number> = {
        manufacturing: 0,
        finishing: 0,
        packaging: 0,
        boxing: 0,
      };

      (data || []).forEach((record) => {
        const phase = phaseMap[record.from_state || ''];
        if (phase) {
          counts[phase] += record.quantity;
        }
      });

      setAddedToExtraCounts(counts);
    } catch (error) {
      console.error('Error fetching added to extra counts:', error);
    }
  };

  const fetchRetrievedFromExtraCounts = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('extra_batch_history')
        .select('from_state, quantity')
        .eq('event_type', 'CONSUMED')
        .eq('consuming_order_id', id);

      if (error) throw error;

      const phaseMap: Record<string, string> = {
        'extra_manufacturing': 'manufacturing',
        'extra_finishing': 'finishing',
        'extra_packaging': 'packaging',
        'extra_boxing': 'boxing',
      };

      const counts: Record<string, number> = {
        manufacturing: 0,
        finishing: 0,
        packaging: 0,
        boxing: 0,
      };

      (data || []).forEach((record) => {
        const phase = phaseMap[record.from_state || ''];
        if (phase) {
          counts[phase] += record.quantity;
        }
      });

      setRetrievedFromExtraCounts(counts);
    } catch (error) {
      console.error('Error fetching retrieved from extra counts:', error);
    }
  };


  const handleCancelOrder = async () => {
    try {
      // Release reserved extra batches back to AVAILABLE
      await supabase
        .from("extra_batches")
        .update({ 
          inventory_state: "AVAILABLE", 
          order_id: null, 
          order_item_id: null 
        })
        .eq("order_id", id)
        .eq("inventory_state", "RESERVED");

      const { error } = await supabase
        .from("orders")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (error) throw error;

      toast.success("Order cancelled successfully");
      navigate("/orders");
    } catch (error) {
      console.error("Error cancelling order:", error);
      toast.error("Failed to cancel order");
    }
  };

  const handlePrintOrder = () => {
    if (!order) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    const itemsList = orderItems.map(item => ({
      name: item.product?.name || 'Unknown',
      sku: item.product?.sku || 'N/A',
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
              Priority: <span class="badge ${escapeHtml(order.priority || 'normal')}">${escapeHtml(order.priority || 'normal')}</span> |
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
          Back to Orders
        </Button>
        <p className="text-center text-muted-foreground mt-8">Order not found</p>
      </div>
    );
  }

  const activeBatches = order.batches;
  // Total items = planned order quantity from order_items (not affected by extra inventory reservation)
  const totalItems = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  const shippedItems = activeBatches
    .filter((b) => b.current_state === "shipped")
    .reduce((sum, b) => sum + b.quantity, 0);

  // Check if order is pending based on order status, not batch states
  // This ensures the UI remains consistent even when all order batches are deleted/replaced by extra inventory
  // Order can be "pending" or "waiting_for_rm" before being started
  const isPendingOrder = order.status === "pending" || order.status === "waiting_for_rm";

  // Calculate phase stats with optional filter for phases that can be skipped
  const getPhaseStats = (
    inState: string, 
    readyState: string | undefined, 
    phaseName: string,
    phaseFilter?: (batch: Batch) => boolean
  ): PhaseStats => {
    // Apply filter to get only relevant batches for this phase
    const relevantBatches = phaseFilter ? activeBatches.filter(phaseFilter) : activeBatches;
    
    const waiting = readyState
      ? relevantBatches.filter((b) => b.current_state === readyState).reduce((sum, b) => sum + b.quantity, 0)
      : 0;
    const inProgress = relevantBatches.filter((b) => b.current_state === inState).reduce((sum, b) => sum + b.quantity, 0);
    const stateIndex = getAllStates().indexOf(inState as UnitState);
    
    // Phase hierarchy: items retrieved from a later phase's extra state never went through earlier phases
    const laterExtraStates: Record<string, string[]> = {
      manufacturing: ['extra_finishing', 'extra_packaging', 'extra_boxing'],
      finishing: ['extra_packaging', 'extra_boxing'],
      packaging: ['extra_boxing'],
      boxing: [],
    };
    const excludeStates = laterExtraStates[phaseName] || [];
    
    const pastStateBatches = relevantBatches.filter((b) => {
      if (getAllStates().indexOf(b.current_state as UnitState) <= stateIndex) return false;
      // Exclude batches that skipped this phase entirely (retrieved from a later phase's extra)
      if (excludeStates.includes((b as any).from_extra_state)) return false;
      return true;
    });
    
    // Retrieved = from extra_batch_history CONSUMED events (immutable source of truth)
    const retrieved = retrievedFromExtraCounts[phaseName] || 0;
    
    // Completed = total batches past this state
    const totalPast = pastStateBatches.reduce((sum, b) => sum + b.quantity, 0);
    
    // Defensive hybrid: use both batch labels and history diff to handle corrupted provenance
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
  // Packaging: only count items where product.needs_packing is true (items that skip packaging shouldn't count)
  const packagingStats = getPhaseStats("in_packaging", "ready_for_packaging", "packaging", (b) => b.product?.needs_packing !== false);
  // Boxing: only count items where order_item.needs_boxing is true
  const boxingStats = getPhaseStats("in_boxing", "ready_for_boxing", "boxing", (b) => {
    const orderItem = orderItems.find(oi => oi.id === b.order_item_id);
    return orderItem?.needs_boxing !== false;
  });

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
              {order.status === 'cancelled' && <Badge variant="destructive">Cancelled</Badge>}
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <StickyNote className="h-4 w-4 mr-1" />
                Notes
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setRawMaterialsOpen(true)}>
                <FileText className="h-4 w-4 mr-2" />
                Raw Materials
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPackagingRefOpen(true)}>
                <Package className="h-4 w-4 mr-2" />
                Packaging Reference
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCommentsOpen(true)}>
                <MessageSquare className="h-4 w-4 mr-2" />
                Comments
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canDelete && order?.status !== 'cancelled' && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Cancel Order
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel Order</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will cancel the order and release any reserved extra inventory. The order will be moved to the Cancelled tab. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Go Back</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancelOrder} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Cancel Order
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
          <div className={`grid grid-cols-1 gap-4 ${totalAddedToExtra > 0 ? 'md:grid-cols-5' : 'md:grid-cols-4'}`}>
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
            {totalAddedToExtra > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Added to Extra</p>
                  <p className="text-2xl font-bold text-orange-500 flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {totalAddedToExtra}
                  </p>
                </CardContent>
              </Card>
            )}
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
        );
      })()}

      {/* Notes */}
      {order.notes && (
        <div className="space-y-2">
           {(() => {
              const notes = order.notes || '';
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
                    <p className="text-sm font-medium mb-1">Notes</p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{displayNotes}</p>
                  </CardContent>
                </Card>
              );
           })()}
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
                        <span className="text-muted-foreground">Waiting</span>
                        <span className="font-medium text-warning">{manufacturingStats.waiting}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">In Progress</span>
                        <span className="font-medium text-primary">{manufacturingStats.inProgress}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Processed</span>
                        <span className="font-medium text-green-600">{manufacturingStats.processed}</span>
                      </div>
                      {manufacturingStats.retrieved > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Retrieved</span>
                          <span className="font-medium text-purple-600">{manufacturingStats.retrieved}</span>
                        </div>
                      )}
                      {manufacturingStats.addedToExtra > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Added to Extra</span>
                          <span className="font-medium text-orange-600">{manufacturingStats.addedToExtra}</span>
                        </div>
                      )}
                      {manufacturingStats.extraToRetrieve > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Extra (to retrieve)</span>
                          <span className="font-medium text-amber-600">{manufacturingStats.extraToRetrieve}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="font-medium text-muted-foreground">Completed</span>
                        <span className="font-bold">{manufacturingStats.completed}</span>
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
                        <span className="text-muted-foreground">Processed</span>
                        <span className="font-medium text-green-600">{finishingStats.processed}</span>
                      </div>
                      {finishingStats.retrieved > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Retrieved</span>
                          <span className="font-medium text-purple-600">{finishingStats.retrieved}</span>
                        </div>
                      )}
                      {finishingStats.addedToExtra > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Added to Extra</span>
                          <span className="font-medium text-orange-600">{finishingStats.addedToExtra}</span>
                        </div>
                      )}
                      {finishingStats.extraToRetrieve > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Extra (to retrieve)</span>
                          <span className="font-medium text-amber-600">{finishingStats.extraToRetrieve}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="font-medium text-muted-foreground">Completed</span>
                        <span className="font-bold">{finishingStats.completed}</span>
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
                        <span className="text-muted-foreground">Processed</span>
                        <span className="font-medium text-green-600">{packagingStats.processed}</span>
                      </div>
                      {packagingStats.retrieved > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Retrieved</span>
                          <span className="font-medium text-purple-600">{packagingStats.retrieved}</span>
                        </div>
                      )}
                      {packagingStats.addedToExtra > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Added to Extra</span>
                          <span className="font-medium text-orange-600">{packagingStats.addedToExtra}</span>
                        </div>
                      )}
                      {packagingStats.extraToRetrieve > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Extra (to retrieve)</span>
                          <span className="font-medium text-amber-600">{packagingStats.extraToRetrieve}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="font-medium text-muted-foreground">Completed</span>
                        <span className="font-bold">{packagingStats.completed}</span>
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
                        <span className="text-muted-foreground">Processed</span>
                        <span className="font-medium text-green-600">{boxingStats.processed}</span>
                      </div>
                      {boxingStats.retrieved > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Retrieved</span>
                          <span className="font-medium text-purple-600">{boxingStats.retrieved}</span>
                        </div>
                      )}
                      {boxingStats.addedToExtra > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Added to Extra</span>
                          <span className="font-medium text-orange-600">{boxingStats.addedToExtra}</span>
                        </div>
                      )}
                      {boxingStats.extraToRetrieve > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Extra (to retrieve)</span>
                          <span className="font-medium text-amber-600">{boxingStats.extraToRetrieve}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-1 mt-1">
                        <span className="font-medium text-muted-foreground">Completed</span>
                        <span className="font-bold">{boxingStats.completed}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extra Inventory - Only show for pending orders */}
      {isPendingOrder && canUpdate && (
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
      )}

      {/* Shipments - Only show after order starts */}
      {!isPendingOrder && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Shipments</CardTitle>
              <CardDescription>View and manage order shipments</CardDescription>
            </div>
            <Button variant="outline" onClick={() => navigate(`/orders/${id}/boxing?tab=shipments`)}>
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
      )}

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
                  // Match batches by order_item_id, or fall back to product_id for legacy batches
                  const itemBatches = activeBatches.filter((b) => 
                    b.order_item_id === item.id || 
                    (b.order_item_id === null && b.product_id === item.product_id)
                  );
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
      <RawMaterialsDrawer open={rawMaterialsOpen} onOpenChange={setRawMaterialsOpen} orderId={id!} orderNumber={order?.order_number || ""} />
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
          needs_boxing: item.needs_boxing,
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
      <OrderCommentsDrawer
        orderId={id!}
        orderNumber={order?.order_number || ''}
        open={commentsOpen}
        onOpenChange={setCommentsOpen}
      />
      <Dialog open={packagingRefOpen} onOpenChange={setPackagingRefOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Packaging Reference
            </DialogTitle>
          </DialogHeader>
          <PackagingReferenceDisplay notes={order?.notes || null} />
          {!order?.notes?.includes('---PACKAGING_REFERENCE---') && (
            <p className="text-sm text-muted-foreground text-center py-4">No packaging reference defined for this order.</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
