import { useEffect, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Box, Loader2, QrCode, CheckSquare, Truck, Printer, Package, CheckCircle, Download, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExtraItemsTab } from '@/components/ExtraItemsTab';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { format } from "date-fns";

interface Batch {
  id: string;
  qr_code_data: string;
  current_state: string;
  quantity: number;
  product_id: string;
  order_item_id: string | null;
  box_id: string | null;
  product: { id: string; name: string; sku: string; needs_packing: boolean };
  box?: { id: string; box_code: string } | null;
  order_item?: { id: string; needs_boxing: boolean } | null;
}

interface Order {
  id: string;
  order_number: string;
  priority: string;
  customer?: { name: string };
}

interface BoxGroup {
  box_id: string;
  box_code: string;
  batches: Batch[];
  totalQty: number;
}

// Group by product + needs_boxing to combine same product items
interface OrderItemGroup {
  groupKey: string; // product_id + needs_boxing
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_boxing: boolean;
  quantity: number;
  batches: Batch[];
  order_item_ids: string[];
}

interface ShipmentItem {
  id: string;
  quantity: number;
  batch: {
    id: string;
    qr_code_data: string;
    order_item_id: string | null;
    product: { id: string; name: string; sku: string };
  };
  order_item?: { needs_boxing: boolean } | null;
}

interface Shipment {
  id: string;
  shipment_code: string;
  status: string;
  notes: string | null;
  created_at: string;
  sealed_at: string | null;
  items: ShipmentItem[];
}

export default function OrderBoxing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasRole, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Get default tab from URL query params
  const defaultTab = searchParams.get('tab') || 'receive';

  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [readyForShipmentSelections, setReadyForShipmentSelections] = useState<Map<string, number>>(new Map());
  const [etaDays, setEtaDays] = useState("1");
  const [receiveSearchQuery, setReceiveSearchQuery] = useState('');

  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [moveToReadyDialogOpen, setMoveToReadyDialogOpen] = useState(false);
  const [kartonaDialogOpen, setKartonaDialogOpen] = useState(false);
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Print data for hidden printable area
  const [printData, setPrintData] = useState<{
    shipmentCode: string;
    items: Array<{ sku: string; name: string; qty: number; needsBoxing: boolean }>;
    totalItems: number;
    notes: string;
  } | null>(null);

  const canManage = hasRole("boxing_manager") || hasRole("boxer") || hasRole("admin");

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel(`order-boxing-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_batches", filter: `order_id=eq.${id}` }, () => {
        fetchData();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchData = async () => {
    try {
      const [orderRes, batchesRes] = await Promise.all([
        supabase.from("orders").select("id, order_number, priority, customer:customers(name)").eq("id", id).single(),
        supabase
          .from("order_batches")
          .select(
            "id, qr_code_data, current_state, quantity, product_id, order_item_id, box_id, product:products(id, name, sku, needs_packing)",
          )
          .eq("order_id", id)
          .eq("is_terminated", false)
          .in("current_state", ["ready_for_boxing", "in_boxing", "ready_for_receiving", "received"]),
      ]);

      if (orderRes.error) throw orderRes.error;
      if (batchesRes.error) throw batchesRes.error;

      // Fetch box info
      const boxIds = batchesRes.data?.filter((b: any) => b.box_id).map((b: any) => b.box_id) || [];
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase.from("boxes").select("id, box_code").in("id", boxIds);
        boxesData?.forEach((box) => boxMap.set(box.id, box));
      }

      // Fetch order_item info for needs_boxing
      const orderItemIds = batchesRes.data?.filter((b: any) => b.order_item_id).map((b: any) => b.order_item_id) || [];
      let orderItemMap = new Map();
      if (orderItemIds.length > 0) {
        const { data: orderItemsData } = await supabase
          .from("order_items")
          .select("id, needs_boxing")
          .in("id", orderItemIds);
        orderItemsData?.forEach((oi) => orderItemMap.set(oi.id, oi));
      }

      const batchesWithData =
        batchesRes.data?.map((batch: any) => ({
          ...batch,
          box: batch.box_id ? boxMap.get(batch.box_id) : null,
          order_item: batch.order_item_id ? orderItemMap.get(batch.order_item_id) : null,
        })) || [];

      setOrder(orderRes.data as Order);
      setBatches(batchesWithData as Batch[]);

      // Fetch shipments for this order
      await fetchShipments();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchShipments = async () => {
    try {
      const { data: shipmentsData, error: shipmentsError } = await supabase
        .from("shipments")
        .select("id, shipment_code, status, notes, created_at, sealed_at")
        .eq("order_id", id)
        .order("created_at", { ascending: false });

      if (shipmentsError) throw shipmentsError;

      const shipmentsWithItems: Shipment[] = [];
      for (const shipment of shipmentsData || []) {
        const { data: itemsData } = await supabase
          .from("shipment_items")
          .select(`
            id,
            quantity,
            batch:order_batches(
              id,
              qr_code_data,
              order_item_id,
              product:products(id, name, sku)
            )
          `)
          .eq("shipment_id", shipment.id);

        const itemsWithOrderItem: ShipmentItem[] = [];
        for (const item of itemsData || []) {
          let orderItem = null;
          if ((item.batch as any)?.order_item_id) {
            const { data: oiData } = await supabase
              .from("order_items")
              .select("needs_boxing")
              .eq("id", (item.batch as any).order_item_id)
              .single();
            orderItem = oiData;
          }
          itemsWithOrderItem.push({
            id: item.id,
            quantity: item.quantity,
            batch: item.batch as any,
            order_item: orderItem,
          });
        }

        shipmentsWithItems.push({
          ...shipment,
          items: itemsWithOrderItem,
        });
      }

      setShipments(shipmentsWithItems);
    } catch (error: any) {
      console.error("Error fetching shipments:", error);
    }
  };

  // Group ready_for_boxing by box
  const readyBoxGroups: BoxGroup[] = [];
  const boxGroupMap = new Map<string, BoxGroup>();
  batches
    .filter((b) => b.current_state === "ready_for_boxing" && b.box_id)
    .forEach((batch) => {
      if (!boxGroupMap.has(batch.box_id!)) {
        boxGroupMap.set(batch.box_id!, {
          box_id: batch.box_id!,
          box_code: batch.box?.box_code || "Unknown",
          batches: [],
          totalQty: 0,
        });
      }
      const group = boxGroupMap.get(batch.box_id!)!;
      group.batches.push(batch);
      group.totalQty += batch.quantity;
    });
  boxGroupMap.forEach((g) => readyBoxGroups.push(g));

  // Group in_boxing by product + needs_boxing
  const inBoxingGroups: OrderItemGroup[] = [];
  const orderItemMap = new Map<string, OrderItemGroup>();
  batches
    .filter((b) => b.current_state === "in_boxing")
    .forEach((batch) => {
      const needsBoxing = batch.order_item?.needs_boxing ?? true;
      const groupKey = `${batch.product_id}-${needsBoxing ? 'boxing' : 'no-boxing'}`;
      if (!orderItemMap.has(groupKey)) {
        orderItemMap.set(groupKey, {
          groupKey,
          product_id: batch.product_id,
          product_name: batch.product?.name || "Unknown",
          product_sku: batch.product?.sku || "N/A",
          needs_boxing: needsBoxing,
          quantity: 0,
          batches: [],
          order_item_ids: [],
        });
      }
      const group = orderItemMap.get(groupKey)!;
      group.batches.push(batch);
      group.quantity += batch.quantity;
      if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
        group.order_item_ids.push(batch.order_item_id);
      }
    });
  orderItemMap.forEach((g) => inBoxingGroups.push(g));
  inBoxingGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));

  // Group ready_for_receiving by product + needs_boxing
  const readyForShipmentGroups: OrderItemGroup[] = [];
  const readyShipmentMap = new Map<string, OrderItemGroup>();
  batches
    .filter((b) => b.current_state === "ready_for_receiving")
    .forEach((batch) => {
      const needsBoxing = batch.order_item?.needs_boxing ?? true;
      const groupKey = `${batch.product_id}-${needsBoxing ? 'boxing' : 'no-boxing'}`;
      if (!readyShipmentMap.has(groupKey)) {
        readyShipmentMap.set(groupKey, {
          groupKey,
          product_id: batch.product_id,
          product_name: batch.product?.name || "Unknown",
          product_sku: batch.product?.sku || "N/A",
          needs_boxing: needsBoxing,
          quantity: 0,
          batches: [],
          order_item_ids: [],
        });
      }
      const group = readyShipmentMap.get(groupKey)!;
      group.batches.push(batch);
      group.quantity += batch.quantity;
      if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
        group.order_item_ids.push(batch.order_item_id);
      }
    });
  readyShipmentMap.forEach((g) => readyForShipmentGroups.push(g));
  readyForShipmentGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));

  const totalReadyForBoxing = readyBoxGroups.reduce((sum, g) => sum + g.totalQty, 0);
  const totalInBoxing = inBoxingGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalReadyForShipment = readyForShipmentGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalReceived = batches.filter((b) => b.current_state === "received").reduce((sum, b) => sum + b.quantity, 0);
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);
  const totalSelectedForShipment = Array.from(readyForShipmentSelections.values()).reduce((a, b) => a + b, 0);
  const totalShipped = shipments.reduce((sum, s) => sum + s.items.reduce((iSum, item) => iSum + item.quantity, 0), 0);

  // Filter boxes based on search query (box code, product SKU, or product name)
  const filteredReadyBoxGroups = receiveSearchQuery.trim()
    ? readyBoxGroups.filter(group => {
        const query = receiveSearchQuery.trim().toUpperCase();
        if (group.box_code.toUpperCase().includes(query)) return true;
        return group.batches.some(b => 
          b.product?.sku?.toUpperCase().includes(query) ||
          b.product?.name?.toUpperCase().includes(query)
        );
      })
    : readyBoxGroups;

  const handleSelectAllBoxes = () => {
    if (selectedBoxes.size === filteredReadyBoxGroups.length) setSelectedBoxes(new Set());
    else setSelectedBoxes(new Set(filteredReadyBoxGroups.map((g) => g.box_id)));
  };

  const handleAcceptBoxes = async () => {
    if (selectedBoxes.size === 0) return;
    setSubmitting(true);
    try {
      const etaDate = new Date();
      etaDate.setDate(etaDate.getDate() + parseInt(etaDays) || 1);

      // Get all batches in selected boxes
      const selectedBatches = batches.filter(
        (b) => b.current_state === "ready_for_boxing" && b.box_id && selectedBoxes.has(b.box_id),
      );

      // Route based on needs_boxing flag per batch:
      // needs_boxing = true -> in_boxing (Processing)
      // needs_boxing = false -> ready_for_receiving (Ready for Shipment)
      const batchesToBoxing = selectedBatches.filter((b) => b.order_item?.needs_boxing !== false);
      const batchesToShipment = selectedBatches.filter((b) => b.order_item?.needs_boxing === false);

      // Clear box_id when receiving - boxes become available again
      if (batchesToBoxing.length > 0) {
        await supabase
          .from("order_batches")
          .update({
            current_state: "in_boxing",
            eta: etaDate.toISOString(),
            lead_time_days: parseInt(etaDays) || 1,
            box_id: null, // Free up the box
          })
          .in(
            "id",
            batchesToBoxing.map((b) => b.id),
          );
      }

      if (batchesToShipment.length > 0) {
        await supabase
          .from("order_batches")
          .update({
            current_state: "ready_for_receiving",
            box_id: null, // Free up the box
          })
          .in(
            "id",
            batchesToShipment.map((b) => b.id),
          );
      }

      // Reset boxes to empty state
      const boxIds = Array.from(selectedBoxes);
      await supabase.from('boxes').update({
        items_list: [],
        content_type: 'EMPTY',
      }).in('id', boxIds);

      const boxingCount = batchesToBoxing.reduce((sum, b) => sum + b.quantity, 0);
      const shipmentCount = batchesToShipment.reduce((sum, b) => sum + b.quantity, 0);

      toast.success(`Routed ${boxingCount} to Processing, ${shipmentCount} directly to Ready for Shipment`);
      setSelectedBoxes(new Set());
      setAcceptDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoveToReadyForShipment = async () => {
    if (totalSelected === 0) return;
    setSubmitting(true);

    try {
      // Use order_item_id or product_id as key (matching how groups are created)
      for (const [key, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        const group = inBoxingGroups.find((g) => g.groupKey === key);
        if (!group) continue;

        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          if (useQty === batch.quantity) {
            await supabase
              .from("order_batches")
              .update({
                current_state: "ready_for_receiving",
                box_id: null,
              })
              .eq("id", batch.id);
          } else {
            const { data: qrCode } = await supabase.rpc("generate_extra_batch_code");
            await supabase.from("order_batches").insert({
              qr_code_data: qrCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: "ready_for_receiving",
              quantity: useQty,
              created_by: user?.id,
            });
            await supabase
              .from("order_batches")
              .update({ quantity: batch.quantity - useQty })
              .eq("id", batch.id);
          }
        }
      }

      toast.success(`Moved ${totalSelected} items to Ready for Shipment`);
      setMoveToReadyDialogOpen(false);
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKartona = async () => {
    if (totalSelectedForShipment === 0) return;
    setSubmitting(true);

    try {
      // Generate shipment code
      const { data: shipmentCode } = await supabase.rpc("generate_shipment_code");

      // Create shipment
      const { data: shipment, error: shipmentError } = await supabase
        .from("shipments")
        .insert({
          shipment_code: shipmentCode || `SHP-${Date.now()}`,
          order_id: id,
          notes: shipmentNotes.trim() || null,
          created_by: user?.id,
          status: "sealed",
          sealed_at: new Date().toISOString(),
          sealed_by: user?.id,
        })
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // Process each order item selection (key is order_item_id or product_id)
      const shipmentItems = [];
      for (const [key, quantity] of readyForShipmentSelections.entries()) {
        if (quantity <= 0) continue;
        const group = readyForShipmentGroups.find((g) => g.groupKey === key);
        if (!group) continue;

        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          shipmentItems.push({
            shipment_id: shipment.id,
            batch_id: batch.id,
            quantity: useQty,
          });

          if (useQty === batch.quantity) {
            await supabase.from("order_batches").update({ current_state: "received" }).eq("id", batch.id);
          } else {
            const { data: qrCode } = await supabase.rpc("generate_extra_batch_code");
            await supabase.from("order_batches").insert({
              qr_code_data: qrCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: "received",
              quantity: useQty,
              created_by: user?.id,
            });
            await supabase
              .from("order_batches")
              .update({ quantity: batch.quantity - useQty })
              .eq("id", batch.id);
          }
        }
      }

      if (shipmentItems.length > 0) {
        await supabase.from("shipment_items").insert(shipmentItems);
      }

      toast.success(`Created Kartona ${shipment.shipment_code}`);

      // Capture print data BEFORE clearing state (so print is always correct)
      const printItems = Array.from(readyForShipmentSelections.entries())
        .map(([key, qty]) => {
          const group = readyForShipmentGroups.find((g) => g.groupKey === key);
          return group
            ? { sku: group.product_sku, name: group.product_name, qty, needsBoxing: group.needs_boxing }
            : null;
        })
        .filter(Boolean) as Array<{ sku: string; name: string; qty: number; needsBoxing: boolean }>;

      const printTotal = totalSelectedForShipment;
      const printNotes = shipmentNotes;

      // CLOSE + RESET UI FIRST (critical)
      setKartonaDialogOpen(false);
      setReadyForShipmentSelections(new Map());
      setShipmentNotes("");
      setSubmitting(false);

      // Open printable tab WITHOUT auto-printing (prevents UI freeze while print dialog is open)
      setTimeout(() => {
        printKartonaLabel(shipment.shipment_code, printItems, printTotal, printNotes);
      }, 0);

      // Refresh after
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
      setSubmitting(false);
    }
  };

  const exportShipments = () => {
    if (shipments.length === 0) return;

    const headers = ['Shipment Code', 'Status', 'Created At', 'Sealed At', 'Notes', 'Product SKU', 'Product Name', 'Quantity', 'Needs Boxing'];
    const rows: string[][] = [];

    shipments.forEach(shipment => {
      const items = shipment.items || [];
      if (items.length === 0) {
        rows.push([
          shipment.shipment_code,
          shipment.status,
          format(new Date(shipment.created_at), 'yyyy-MM-dd HH:mm'),
          shipment.sealed_at ? format(new Date(shipment.sealed_at), 'yyyy-MM-dd HH:mm') : '',
          shipment.notes || '',
          '', '', '', ''
        ]);
      } else {
        items.forEach((item, idx) => {
          rows.push([
            idx === 0 ? shipment.shipment_code : '',
            idx === 0 ? shipment.status : '',
            idx === 0 ? format(new Date(shipment.created_at), 'yyyy-MM-dd HH:mm') : '',
            idx === 0 && shipment.sealed_at ? format(new Date(shipment.sealed_at), 'yyyy-MM-dd HH:mm') : '',
            idx === 0 ? (shipment.notes || '') : '',
            item.batch?.product?.sku || '',
            item.batch?.product?.name || '',
            String(item.quantity),
            (item.order_item?.needs_boxing ?? true) ? 'Yes' : 'No'
          ]);
        });
      }
    });

    const csvContent = [headers, ...rows].map(row =>
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `shipments-${order?.order_number || 'export'}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
  };

  const printKartonaLabel = (
    shipmentCode: string,
    items: Array<{ sku: string; name: string; qty: number; needsBoxing: boolean }>,
    totalItems: number,
    notes: string,
  ) => {
    // Set print data and trigger print after render
    setPrintData({ shipmentCode, items, totalItems, notes });
    setTimeout(() => {
      window.print();
    }, 100);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/orders")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <p className="text-center text-muted-foreground mt-8">Order not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/queues/boxing")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Box className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Boxing</h1>
              <p className="text-muted-foreground">
                {order.order_number} {order.customer?.name && `· ${order.customer.name}`}
                {order.priority === "high" && (
                  <Badge variant="destructive" className="ml-2">
                    High Priority
                  </Badge>
                )}
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/orders/${id}`)}>
          View Order Details
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Ready for Boxing</p>
            <p className="text-2xl font-bold text-warning">{totalReadyForBoxing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">In Boxing</p>
            <p className="text-2xl font-bold text-primary">{totalInBoxing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Ready for Shipment</p>
            <p className="text-2xl font-bold text-green-600">{totalReadyForShipment}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Kartonas</p>
            <p className="text-2xl font-bold text-purple-600">{shipments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Shipped</p>
            <p className="text-2xl font-bold text-green-600">{totalShipped}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="receive">Receive ({readyBoxGroups.length})</TabsTrigger>
          <TabsTrigger value="process">Process ({totalInBoxing})</TabsTrigger>
          <TabsTrigger value="extra">Extra</TabsTrigger>
          <TabsTrigger value="ready">Ready ({totalReadyForShipment})</TabsTrigger>
          <TabsTrigger value="shipments">Shipments ({shipments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="receive" className="space-y-4">
          {canManage && readyBoxGroups.length > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Button variant="outline" size="sm" onClick={handleSelectAllBoxes}>
                    <CheckSquare className="h-4 w-4 mr-2" />
                    {selectedBoxes.size === filteredReadyBoxGroups.length ? "Deselect All" : "Select All"}
                  </Button>
                  <div>
                    <Label className="text-xs text-muted-foreground">ETA (days)</Label>
                    <Select value={etaDays} onValueChange={setEtaDays}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 5, 7, 10, 14].map((d) => (
                          <SelectItem key={d} value={d.toString()}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button onClick={() => setAcceptDialogOpen(true)} disabled={selectedBoxes.size === 0}>
                  Accept {selectedBoxes.size} Box(es)
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Search Box */}
          <Card>
            <CardContent className="p-4">
              <Label>Search by Box Code, Product SKU, or Name</Label>
              <div className="flex gap-2 mt-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    value={receiveSearchQuery}
                    onChange={(e) => setReceiveSearchQuery(e.target.value)}
                    placeholder="Type to filter boxes..." 
                    className="pl-10" 
                  />
                </div>
                {receiveSearchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setReceiveSearchQuery('')}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {filteredReadyBoxGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {receiveSearchQuery.trim() 
                    ? `No boxes matching "${receiveSearchQuery}"` 
                    : 'No boxes ready for boxing'}
                </CardContent>
              </Card>
            ) : (
              filteredReadyBoxGroups.map((group) => (
                <Card key={group.box_id} className={selectedBoxes.has(group.box_id) ? "border-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {canManage && (
                        <Checkbox
                          checked={selectedBoxes.has(group.box_id)}
                          onCheckedChange={(checked) => {
                            setSelectedBoxes((prev) => {
                              const next = new Set(prev);
                              if (checked) next.add(group.box_id);
                              else next.delete(group.box_id);
                              return next;
                            });
                          }}
                        />
                      )}
                      <div className="flex items-center gap-3">
                        <Box className="h-5 w-5 text-muted-foreground" />
                        <span className="font-mono font-bold">{group.box_code}</span>
                      </div>
                      <Badge variant="secondary">{group.totalQty} items</Badge>
                      <div className="flex-1 text-sm text-muted-foreground">
                        {group.batches.map((b) => `${b.product?.sku} - ${b.product?.name} (${b.quantity})`).join(", ")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="process" className="space-y-4">
          {canManage && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {totalSelected} selected
                </Badge>
                <Button onClick={() => setMoveToReadyDialogOpen(true)} disabled={totalSelected === 0}>
                  <Package className="h-4 w-4 mr-2" />
                  Move to Ready for Shipment
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {inBoxingGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">No items in boxing</CardContent>
              </Card>
            ) : (
              inBoxingGroups.map((group) => {
                const key = group.groupKey;
                return (
                  <Card key={key}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{group.product_name}</p>
                            {group.needs_boxing ? (
                              <Badge variant="outline" className="text-xs bg-primary/10">
                                Boxing
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                No Boxing
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="secondary">{group.quantity} available</Badge>
                          {canManage && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Select</Label>
                              <Input
                                type="number"
                                min={0}
                                max={group.quantity}
                                value={productSelections.get(key) || 0}
                                onChange={(e) => {
                                  const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), group.quantity);
                                  setProductSelections((prev) => new Map(prev).set(key, val));
                                }}
                                className="w-20 h-8"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="extra">
          <ExtraItemsTab 
            orderId={id!} 
            phase="boxing" 
            onRefresh={() => fetchData()} 
          />
        </TabsContent>

        <TabsContent value="ready" className="space-y-4">
          {canManage && readyForShipmentGroups.length > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {totalSelectedForShipment} selected
                </Badge>
                <Button onClick={() => setKartonaDialogOpen(true)} disabled={totalSelectedForShipment === 0}>
                  <Truck className="h-4 w-4 mr-2" />
                  Create Kartona
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {readyForShipmentGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">No items ready for shipment</CardContent>
              </Card>
            ) : (
              readyForShipmentGroups.map((group) => {
                const key = group.groupKey;
                return (
                  <Card key={key}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{group.product_name}</p>
                            {group.needs_boxing ? (
                              <Badge variant="outline" className="text-xs bg-primary/10">
                                Boxed
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Not Boxed
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="default" className="bg-green-600">
                            {group.quantity} ready
                          </Badge>
                          {canManage && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Select</Label>
                              <Input
                                type="number"
                                min={0}
                                max={group.quantity}
                                value={readyForShipmentSelections.get(key) || 0}
                                onChange={(e) => {
                                  const val = Math.min(Math.max(0, parseInt(e.target.value) || 0), group.quantity);
                                  setReadyForShipmentSelections((prev) => new Map(prev).set(key, val));
                                }}
                                className="w-20 h-8"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="shipments" className="space-y-4">
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {shipments.length} Kartona(s) created for this order
              </p>
              <Button variant="outline" onClick={exportShipments} disabled={shipments.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {shipments.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">No shipments yet</CardContent>
              </Card>
            ) : (
              shipments.map((shipment) => (
                <Card key={shipment.id}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <Truck className="h-5 w-5 text-muted-foreground" />
                        <span className="font-mono font-bold">{shipment.shipment_code}</span>
                        <Badge variant={shipment.status === "sealed" ? "default" : "secondary"}>
                          {shipment.status}
                        </Badge>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(shipment.created_at), "PPP")}
                      </div>
                    </div>
                    {shipment.notes && (
                      <p className="text-sm text-muted-foreground mb-3">{shipment.notes}</p>
                    )}
                    <div className="space-y-1">
                      {shipment.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2">
                            <span>{item.batch?.product?.sku}</span>
                            <span className="text-muted-foreground">- {item.batch?.product?.name}</span>
                          </div>
                          <Badge variant="outline">{item.quantity}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Accept Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Boxes into Boxing</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              You are about to accept {selectedBoxes.size} box(es) into the boxing phase.
            </p>
            <p className="text-sm text-muted-foreground">
              Items will be routed based on their "needs boxing" setting:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-2">
              <li>Needs Boxing = Yes → Processing tab</li>
              <li>Needs Boxing = No → Ready for Shipment tab</li>
            </ul>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAcceptBoxes} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Accept
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Ready Dialog */}
      <Dialog open={moveToReadyDialogOpen} onOpenChange={setMoveToReadyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to Ready for Shipment</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              You are about to move {totalSelected} item(s) to the Ready for Shipment stage.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveToReadyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMoveToReadyForShipment} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Kartona Dialog */}
      <Dialog open={kartonaDialogOpen} onOpenChange={setKartonaDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Kartona (Shipment)</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Creating a Kartona for {totalSelectedForShipment} item(s).
            </p>
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={shipmentNotes}
                onChange={(e) => setShipmentNotes(e.target.value)}
                placeholder="Add any notes for this shipment..."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKartonaDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateKartona} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Create & Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hidden Printable Area */}
      {printData && (
        <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:z-50 print:p-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold">{printData.shipmentCode}</h1>
            <p className="text-lg mt-2">{order.order_number}</p>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left p-2">SKU</th>
                <th className="text-left p-2">Product</th>
                <th className="text-center p-2">Qty</th>
                <th className="text-center p-2">Boxed</th>
              </tr>
            </thead>
            <tbody>
              {printData.items.map((item, idx) => (
                <tr key={idx} className="border-b">
                  <td className="p-2 font-mono">{item.sku}</td>
                  <td className="p-2">{item.name}</td>
                  <td className="p-2 text-center font-bold">{item.qty}</td>
                  <td className="p-2 text-center">{item.needsBoxing ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-8 flex justify-between items-center">
            <div>
              <p className="font-bold">Total Items: {printData.totalItems}</p>
              {printData.notes && <p className="mt-2">Notes: {printData.notes}</p>}
            </div>
            <div className="text-right text-sm text-gray-500">
              Printed: {format(new Date(), "PPP p")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
