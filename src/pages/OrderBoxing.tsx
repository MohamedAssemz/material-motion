import { useEffect, useState } from "react";
import { useOrderItemProgress } from "@/hooks/useOrderItemProgress";
import { useLanguage } from "@/contexts/LanguageContext";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ArrowLeft, Box, Loader2, QrCode, CheckSquare, Truck, Printer, Package, CheckCircle, Download, Search, FileText } from "lucide-react";
import { PackagingReferenceDisplay } from "@/components/PackagingReferenceDisplay";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExtraItemsTab } from '@/components/ExtraItemsTab';
import { BoxScanPopup } from '@/components/BoxScanPopup';
import { MoveToExtraDialog } from '@/components/MoveToExtraDialog';
import { ProductionRateSection } from '@/components/ProductionRateSection';
import { RetrievedFromExtraSection } from '@/components/RetrievedFromExtraSection';
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
  boxing_machine_id: string | null;
  packaging_machine_id: string | null;
  finishing_machine_id: string | null;
  manufacturing_machine_id: string | null;
  product: { id: string; name_en: string; name_ar?: string | null; sku: string; needs_packing: boolean; color_en?: string | null; color_ar?: string | null };
  box?: { id: string; box_code: string } | null;
  order_item?: { id: string; needs_boxing: boolean; initial_state?: string | null; size?: string | null } | null;
  production_date?: string | null;
  from_extra_state?: string | null;
  is_special?: boolean;
}

interface Order {
  id: string;
  order_number: string;
  priority: string;
  status: string;
  notes: string | null;
  customer?: { name: string };
}

interface BoxGroup {
  box_id: string;
  box_code: string;
  batches: Batch[];
  totalQty: number;
}

// Group by order_item_id to keep different sizes/colors as separate entries
interface OrderItemGroup {
  groupKey: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_name_ar?: string | null;
  product_color_en?: string | null;
  product_color_ar?: string | null;
  size?: string | null;
  needs_boxing: boolean;
  quantity: number;
  batches: Batch[];
  order_item_ids: string[];
}

interface ShippedBatch {
  id: string;
  qr_code_data: string;
  quantity: number;
  order_item_id: string | null;
  product: { id: string; name_en: string; name_ar?: string | null; sku: string };
  order_item?: { needs_boxing: boolean } | null;
  from_extra_state?: string | null;
}

interface Shipment {
  id: string;
  shipment_code: string;
  status: string;
  notes: string | null;
  created_at: string;
  sealed_at: string | null;
  length_cm: number | null;
  width_cm: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  batches: ShippedBatch[];
}

export default function OrderBoxing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { hasRole, user } = useAuth();
  const { t } = useLanguage();
  const [order, setOrder] = useState<Order | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [addedToExtraItems, setAddedToExtraItems] = useState<Array<{ product_id: string; product_name: string; product_sku: string; quantity: number }>>([]);
  const [extraBatchesForRate, setExtraBatchesForRate] = useState<
    Array<{ id: string; product_id: string; product_name: string; product_sku: string; quantity: number; boxing_machine_id: string | null }>
  >([]);
  const [retrievedFromExtraBatches, setRetrievedFromExtraBatches] = useState<
    Array<{ id: string; product_id: string; product_name: string; product_sku: string; quantity: number; order_item_id?: string | null }>
  >([]);
  const [extraCount, setExtraCount] = useState(0);
  const [loading, setLoading] = useState(true);
  
  // Get default tab from URL query params
  const defaultTab = searchParams.get('tab') || 'receive';

  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [readyForShipmentSelections, setReadyForShipmentSelections] = useState<Map<string, number>>(new Map());
  const [etaDays, setEtaDays] = useState("1");
  const [receiveSearchQuery, setReceiveSearchQuery] = useState('');
  const [scanPopupOpen, setScanPopupOpen] = useState(false);

  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [moveToReadyDialogOpen, setMoveToReadyDialogOpen] = useState(false);
  const [kartonaDialogOpen, setKartonaDialogOpen] = useState(false);
  const [moveToExtraDialogOpen, setMoveToExtraDialogOpen] = useState(false);
  const [shipmentNotes, setShipmentNotes] = useState("");
  const [shipmentLength, setShipmentLength] = useState("");
  const [shipmentWidth, setShipmentWidth] = useState("");
  const [shipmentHeight, setShipmentHeight] = useState("");
  const [shipmentWeight, setShipmentWeight] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [notesDialogOpen, setNotesDialogOpen] = useState(false);


  const canManage = hasRole("boxing_manager") || hasRole("admin");
  const isCancelled = order?.status === 'cancelled';
  const { isInProgress, markInProgress } = useOrderItemProgress(id, 'boxing', user?.id);

  const fetchExtraCount = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('extra_batches')
        .select('quantity')
        .eq('order_id', id)
        .eq('current_state', 'extra_boxing');
      if (!error && data) {
        setExtraCount(data.reduce((sum, b) => sum + b.quantity, 0));
      }
    } catch {}
  };

  useEffect(() => {
    fetchData();
    fetchAddedToExtra();
    fetchRetrievedFromExtra();
    fetchExtraCount();
    const channel = supabase
      .channel(`order-boxing-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_batches", filter: `order_id=eq.${id}` }, () => {
        fetchData();
        fetchAddedToExtra();
        fetchRetrievedFromExtra();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "extra_batches", filter: `order_id=eq.${id}` },
        () => {
          fetchExtraCount();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchData = async () => {
    try {
      const [orderRes, batchesRes] = await Promise.all([
        supabase.from("orders").select("id, order_number, priority, status, notes, customer:customers(name)").eq("id", id).single(),
        supabase
          .from("order_batches")
          .select(
            "id, qr_code_data, current_state, quantity, product_id, order_item_id, box_id, manufacturing_machine_id, finishing_machine_id, packaging_machine_id, boxing_machine_id, from_extra_state, is_special, product:products(id, name_en, name_ar, sku, needs_packing, color_en, color_ar)",
          )
          .eq("order_id", id)
          .in("current_state", ["ready_for_boxing", "in_boxing", "ready_for_shipment", "shipped"]),
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
          .select("id, needs_boxing, initial_state, size")
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

  const fetchAddedToExtra = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('extra_batch_history')
        .select('quantity, product_id, extra_batch_id, products(name_en, name_ar, sku, color_en, color_ar)')
        .eq('event_type', 'CREATED')
        .eq('source_order_id', id)
        .eq('from_state', 'in_boxing');

      if (error) throw error;

      const productMap = new Map<string, { product_id: string; product_name: string; product_sku: string; quantity: number }>();
      const extraBatchIds = new Set<string>();
      (data || []).forEach((record: any) => {
        if (record.extra_batch_id) extraBatchIds.add(record.extra_batch_id);
        const existing = productMap.get(record.product_id);
        if (existing) {
          existing.quantity += record.quantity;
        } else {
          productMap.set(record.product_id, {
            product_id: record.product_id,
            product_name: record.products?.name_en || 'Unknown',
            product_sku: record.products?.sku || 'N/A',
            quantity: record.quantity,
          });
        }
      });
      setAddedToExtraItems(Array.from(productMap.values()));

      // Build production rate data from history quantities
      const historyByBatch = new Map<string, number>();
      (data || []).forEach((record: any) => {
        if (record.extra_batch_id) {
          historyByBatch.set(record.extra_batch_id, (historyByBatch.get(record.extra_batch_id) || 0) + record.quantity);
        }
      });

      if (extraBatchIds.size > 0) {
        const { data: extraBatches } = await supabase
          .from('extra_batches')
          .select('id, product_id, boxing_machine_id, product:products(name_en, name_ar, sku, color_en, color_ar)')
          .in('id', Array.from(extraBatchIds));
        setExtraBatchesForRate(
          (extraBatches || []).map((eb: any) => ({
            id: eb.id,
            product_id: eb.product_id,
            product_name: eb.product?.name_en || 'Unknown',
            product_sku: eb.product?.sku || 'N/A',
            quantity: historyByBatch.get(eb.id) || 0,
            boxing_machine_id: eb.boxing_machine_id,
          }))
        );
      } else {
        setExtraBatchesForRate([]);
      }
    } catch (error) {
      console.error('Error fetching added to extra:', error);
    }
  };

  const fetchRetrievedFromExtra = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('extra_batch_history')
        .select('quantity, product_id, consuming_order_item_id, products(name_en, name_ar, sku, color_en, color_ar)')
        .eq('event_type', 'CONSUMED')
        .eq('consuming_order_id', id)
        .eq('from_state', 'extra_boxing');

      if (error) throw error;

      const productMap = new Map<string, { id: string; product_id: string; product_name: string; product_sku: string; quantity: number; order_item_id: string | null }>();
      (data || []).forEach((record: any) => {
        const key = record.consuming_order_item_id || record.product_id;
        const existing = productMap.get(key);
        if (existing) {
          existing.quantity += record.quantity;
        } else {
          productMap.set(key, {
            id: key,
            product_id: record.product_id,
            product_name: record.products?.name_en || 'Unknown',
            product_sku: record.products?.sku || 'N/A',
            quantity: record.quantity,
            order_item_id: record.consuming_order_item_id || null,
          });
        }
      });
      setRetrievedFromExtraBatches(Array.from(productMap.values()));
    } catch (error) {
      console.error('Error fetching retrieved from extra:', error);
    }
  };

  const fetchShipments = async () => {
    try {
      const { data: shipmentsData, error: shipmentsError } = await supabase
        .from("shipments")
        .select("id, shipment_code, status, notes, created_at, sealed_at, length_cm, width_cm, height_cm, weight_kg")
        .eq("order_id", id)
        .order("created_at", { ascending: false });

      if (shipmentsError) throw shipmentsError;

      const shipmentsWithBatches: Shipment[] = [];
      for (const shipment of shipmentsData || []) {
        // Fetch batches that belong to this shipment
        const { data: batchesData } = await supabase
          .from("order_batches")
          .select(`
            id,
            qr_code_data,
            quantity,
            order_item_id,
            from_extra_state,
            product:products(id, name_en, name_ar, sku, color_en, color_ar)
          `)
          .eq("shipment_id", shipment.id);

        const batchesWithOrderItem: ShippedBatch[] = [];
        for (const batch of batchesData || []) {
          let orderItem = null;
          if (batch.order_item_id) {
            const { data: oiData } = await supabase
              .from("order_items")
              .select("needs_boxing")
              .eq("id", batch.order_item_id)
              .single();
            orderItem = oiData;
          }
          batchesWithOrderItem.push({
            id: batch.id,
            qr_code_data: batch.qr_code_data || '',
            quantity: batch.quantity,
            order_item_id: batch.order_item_id,
            product: batch.product as any,
            order_item: orderItem,
            from_extra_state: (batch as any).from_extra_state || null,
          });
        }

        shipmentsWithBatches.push({
          ...shipment,
          batches: batchesWithOrderItem,
        });
      }

      setShipments(shipmentsWithBatches);
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

  // Group in_boxing by order_item_id
  const inBoxingGroups: OrderItemGroup[] = [];
  const orderItemMap = new Map<string, OrderItemGroup>();
  batches
    .filter((b) => b.current_state === "in_boxing")
    .forEach((batch) => {
      const needsBoxing = batch.order_item?.needs_boxing ?? true;
      const groupKey = batch.order_item_id || `${batch.product_id}-fallback`;
      if (!orderItemMap.has(groupKey)) {
        orderItemMap.set(groupKey, {
          groupKey,
          product_id: batch.product_id,
          product_name: batch.product?.name_en || "Unknown",
          product_sku: batch.product?.sku || "N/A",
          product_name_ar: batch.product?.name_ar,
          product_color_en: batch.product?.color_en,
          product_color_ar: batch.product?.color_ar,
          size: batch.order_item?.size,
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

  // Group ready_for_shipment by order_item_id
  const readyForShipmentGroups: OrderItemGroup[] = [];
  const readyShipmentMap = new Map<string, OrderItemGroup>();
  batches
    .filter((b) => b.current_state === "ready_for_shipment")
    .forEach((batch) => {
      const needsBoxing = batch.order_item?.needs_boxing ?? true;
      const groupKey = batch.order_item_id || `${batch.product_id}-fallback`;
      if (!readyShipmentMap.has(groupKey)) {
        readyShipmentMap.set(groupKey, {
          groupKey,
          product_id: batch.product_id,
          product_name: batch.product?.name_en || "Unknown",
          product_sku: batch.product?.sku || "N/A",
          product_name_ar: batch.product?.name_ar,
          product_color_en: batch.product?.color_en,
          product_color_ar: batch.product?.color_ar,
          size: batch.order_item?.size,
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
  const totalShippedBatches = batches.filter((b) => b.current_state === "shipped").reduce((sum, b) => sum + b.quantity, 0);
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);
  const totalSelectedForShipment = Array.from(readyForShipmentSelections.values()).reduce((a, b) => a + b, 0);
  const totalShipped = shipments.reduce((sum, s) => sum + s.batches.reduce((bSum, batch) => bSum + batch.quantity, 0), 0);

  // Prepare selections for MoveToExtraDialog
  const extraSelections = inBoxingGroups
    .filter(g => productSelections.get(g.groupKey) && productSelections.get(g.groupKey)! > 0)
    .map(g => ({
      groupKey: g.groupKey,
      product_id: g.product_id,
      product_name: g.product_name,
      product_sku: g.product_sku,
      quantity: productSelections.get(g.groupKey) || 0,
      order_item_ids: g.order_item_ids,
      batches: g.batches.map(b => ({
        id: b.id,
        quantity: b.quantity,
        current_state: b.current_state,
        order_item_id: b.order_item_id,
      })),
    }))
    .filter(s => s.quantity > 0);

  // Filter boxes based on search query (box code, product SKU, or product name)
  const filteredReadyBoxGroups = receiveSearchQuery.trim()
    ? readyBoxGroups.filter(group => {
        const query = receiveSearchQuery.trim().toUpperCase();
        if (group.box_code.toUpperCase().includes(query)) return true;
        return group.batches.some(b => 
          b.product?.sku?.toUpperCase().includes(query) ||
          b.product?.name_en?.toUpperCase().includes(query)
        );
      })
    : readyBoxGroups;

  const handleSelectAllBoxes = () => {
    if (selectedBoxes.size === filteredReadyBoxGroups.length) setSelectedBoxes(new Set());
    else setSelectedBoxes(new Set(filteredReadyBoxGroups.map((g) => g.box_id)));
  };

  const handleAddScannedBoxes = (boxes: Array<{ id: string; box_code: string; total_quantity: number }>) => {
    setSelectedBoxes(prev => {
      const next = new Set(prev);
      boxes.forEach(box => next.add(box.id));
      return next;
    });
    setScanPopupOpen(false);
    toast.success(`Added ${boxes.length} scanned box(es) to selection`);
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

      // Route based on needs_boxing flag and is_special per batch:
      // is_special = true -> ready_for_shipment (special items skip boxing processing)
      // needs_boxing = true (non-special) -> in_boxing (Processing)
      // needs_boxing = false -> ready_for_shipment (Ready for Shipment)
      const batchesToBoxing = selectedBatches.filter((b) => b.order_item?.needs_boxing !== false && !b.is_special);
      const batchesToShipment = selectedBatches.filter((b) => b.order_item?.needs_boxing === false || b.is_special);

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
            current_state: "ready_for_shipment",
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
      let movedCount = 0;
      
      // Use groupKey as key (matching how groups are created)
      for (const [key, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        const group = inBoxingGroups.find((g) => g.groupKey === key);
        if (!group) continue;

        let remainingQty = quantity;
        
        // Check if there's an existing batch in ready_for_shipment for this product/order_item combo
        // to consolidate into instead of creating new batches
        const orderItemId = group.order_item_ids[0]; // Use first order_item_id for consolidation
        
        // Sort batches: prioritize those with machine assigned, then by quantity
        const sortedBatches = [...group.batches].sort((a, b) => {
          const aHasMachine = a.boxing_machine_id ? 0 : 1;
          const bHasMachine = b.boxing_machine_id ? 0 : 1;
          if (aHasMachine !== bHasMachine) return aHasMachine - bHasMachine;
          return a.quantity - b.quantity;
        });
        for (const batch of sortedBatches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          if (useQty === batch.quantity) {
            // Move entire batch - check if we can consolidate with existing ready_for_shipment batch
            // Provenance-aware consolidation: match from_extra_state (null-safe)
            let existingBatchQuery = supabase
              .from("order_batches")
              .select("id, quantity")
              .eq("order_id", id)
              .eq("product_id", batch.product_id)
              .eq("order_item_id", batch.order_item_id)
              .eq("current_state", "ready_for_shipment");
            
            if (batch.from_extra_state) {
              existingBatchQuery = existingBatchQuery.eq("from_extra_state", batch.from_extra_state);
            } else {
              existingBatchQuery = existingBatchQuery.is("from_extra_state", null);
            }
            
            const { data: existingBatch } = await existingBatchQuery.limit(1).single();
            
            if (existingBatch) {
              // Consolidate: add quantity to existing batch and delete current batch
              const { error: updateError } = await supabase
                .from("order_batches")
                .update({ quantity: existingBatch.quantity + batch.quantity })
                .eq("id", existingBatch.id);
              if (updateError) throw updateError;
              
              // Delete current batch as it's been consolidated
              const { error: deleteError } = await supabase
                .from("order_batches")
                .delete()
                .eq("id", batch.id);
              if (deleteError) throw deleteError;
            } else {
              // No existing batch to consolidate, just update state
              const { error: updateError } = await supabase
                .from("order_batches")
                .update({
                  current_state: "ready_for_shipment",
                  box_id: null,
                })
                .eq("id", batch.id);
              if (updateError) throw updateError;
            }
            movedCount += useQty;
          } else {
            // Partial move - check if we can consolidate with existing ready_for_shipment batch
            // Provenance-aware consolidation: match from_extra_state (null-safe)
            let existingBatchQuery2 = supabase
              .from("order_batches")
              .select("id, quantity")
              .eq("order_id", id)
              .eq("product_id", batch.product_id)
              .eq("order_item_id", batch.order_item_id)
              .eq("current_state", "ready_for_shipment");

            if (batch.from_extra_state) {
              existingBatchQuery2 = existingBatchQuery2.eq("from_extra_state", batch.from_extra_state);
            } else {
              existingBatchQuery2 = existingBatchQuery2.is("from_extra_state", null);
            }
            
            const { data: existingBatch } = await existingBatchQuery2.limit(1).single();
            
            if (existingBatch) {
              // Consolidate: add quantity to existing batch
              const { error: updateError } = await supabase
                .from("order_batches")
                .update({ quantity: existingBatch.quantity + useQty })
                .eq("id", existingBatch.id);
              if (updateError) throw updateError;
            } else {
              // Create new batch for the moved quantity
              const { data: qrCode, error: qrError } = await supabase.rpc("generate_extra_batch_code");
              if (qrError) throw qrError;
              
              // Inherit machine IDs from parent batch
              const { error: insertError } = await supabase.from("order_batches").insert({
                qr_code_data: qrCode,
                order_id: id,
                product_id: batch.product_id,
                order_item_id: batch.order_item_id,
                current_state: "ready_for_shipment",
                quantity: useQty,
                created_by: user?.id,
                manufacturing_machine_id: batch.manufacturing_machine_id,
                finishing_machine_id: batch.finishing_machine_id,
                packaging_machine_id: batch.packaging_machine_id,
                boxing_machine_id: batch.boxing_machine_id,
                from_extra_state: batch.from_extra_state,
              });
              if (insertError) throw insertError;
            }
            
            // Reduce source batch quantity
            const { error: reduceError } = await supabase
              .from("order_batches")
              .update({ quantity: batch.quantity - useQty })
              .eq("id", batch.id);
            if (reduceError) throw reduceError;
            
            movedCount += useQty;
          }
        }
      }

      if (movedCount > 0) {
        toast.success(`Moved ${movedCount} items to Ready for Shipment`);
      } else {
        toast.warning("No items were moved");
      }
      setMoveToReadyDialogOpen(false);
      setProductSelections(new Map());
      await fetchData();
    } catch (error: any) {
      console.error("Error moving to ready for shipment:", error);
      toast.error(error.message || "Failed to move items");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateKartona = async () => {
    if (totalSelectedForShipment === 0) return;
    setSubmitting(true);

    try {
      // Generate shipment code
      const { data: shipmentCode, error: codeError } = await supabase.rpc("generate_shipment_code");
      if (codeError) throw codeError;

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
          length_cm: shipmentLength ? parseFloat(shipmentLength) : null,
          width_cm: shipmentWidth ? parseFloat(shipmentWidth) : null,
          height_cm: shipmentHeight ? parseFloat(shipmentHeight) : null,
          weight_kg: shipmentWeight ? parseFloat(shipmentWeight) : null,
        })
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // Process each order item selection (key is groupKey)
      let shippedCount = 0;
      
      for (const [key, quantity] of readyForShipmentSelections.entries()) {
        if (quantity <= 0) continue;
        const group = readyForShipmentGroups.find((g) => g.groupKey === key);
        if (!group) continue;

        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          if (useQty === batch.quantity) {
            // Ship entire batch - check if we can consolidate with existing shipped batch
            // Provenance-aware consolidation: match from_extra_state + shipment_id
            let existingShipBatchQuery = supabase
              .from("order_batches")
              .select("id, quantity")
              .eq("order_id", id)
              .eq("product_id", batch.product_id)
              .eq("order_item_id", batch.order_item_id)
              .eq("current_state", "shipped")
              .eq("shipment_id", shipment.id);
            
            if (batch.from_extra_state) {
              existingShipBatchQuery = existingShipBatchQuery.eq("from_extra_state", batch.from_extra_state);
            } else {
              existingShipBatchQuery = existingShipBatchQuery.is("from_extra_state", null);
            }
            
            const { data: existingBatch } = await existingShipBatchQuery.limit(1).single();
            
            if (existingBatch) {
              // Consolidate: add quantity to existing shipped batch
              const { error: updateError } = await supabase
                .from("order_batches")
                .update({ quantity: existingBatch.quantity + batch.quantity })
                .eq("id", existingBatch.id);
              if (updateError) throw updateError;
              
              // Mark current batch as terminated and update state to shipped
              const { error: terminateError } = await supabase
                .from("order_batches")
                .update({ 
                  is_terminated: true, 
                  terminated_reason: "Consolidated into shipment",
                  current_state: "shipped",
                  shipment_id: shipment.id,
                })
                .eq("id", batch.id);
              if (terminateError) throw terminateError;
            } else {
              // No existing batch to consolidate, just update state and link to shipment
              const { error: updateError } = await supabase
                .from("order_batches")
                .update({ 
                  current_state: "shipped",
                  shipment_id: shipment.id,
                })
                .eq("id", batch.id);
              if (updateError) throw updateError;
            }
            shippedCount += useQty;
          } else {
            // Partial ship - check if we can consolidate with existing shipped batch
            // Provenance-aware consolidation: match from_extra_state + shipment_id
            let existingShipBatchQuery2 = supabase
              .from("order_batches")
              .select("id, quantity")
              .eq("order_id", id)
              .eq("product_id", batch.product_id)
              .eq("order_item_id", batch.order_item_id)
              .eq("current_state", "shipped")
              .eq("shipment_id", shipment.id);

            if (batch.from_extra_state) {
              existingShipBatchQuery2 = existingShipBatchQuery2.eq("from_extra_state", batch.from_extra_state);
            } else {
              existingShipBatchQuery2 = existingShipBatchQuery2.is("from_extra_state", null);
            }
            
            const { data: existingBatch } = await existingShipBatchQuery2.limit(1).single();
            
            if (existingBatch) {
              // Consolidate: add quantity to existing shipped batch
              const { error: updateError } = await supabase
                .from("order_batches")
                .update({ quantity: existingBatch.quantity + useQty })
                .eq("id", existingBatch.id);
              if (updateError) throw updateError;
            } else {
              // Create new shipped batch linked to shipment
              const { data: qrCode, error: qrError } = await supabase.rpc("generate_extra_batch_code");
              if (qrError) throw qrError;
              
              const { error: insertError } = await supabase.from("order_batches").insert({
                qr_code_data: qrCode,
                order_id: id,
                product_id: batch.product_id,
                order_item_id: batch.order_item_id,
                current_state: "shipped",
                quantity: useQty,
                created_by: user?.id,
                shipment_id: shipment.id,
                from_extra_state: batch.from_extra_state,
              });
              if (insertError) throw insertError;
            }
            
            // Reduce source batch quantity
            const { error: reduceError } = await supabase
              .from("order_batches")
              .update({ quantity: batch.quantity - useQty })
              .eq("id", batch.id);
            if (reduceError) throw reduceError;
            
            shippedCount += useQty;
          }
        }
      }


      toast.success(`Created Kartona ${shipment.shipment_code} with ${shippedCount} items`);

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
      setShipmentLength("");
      setShipmentWidth("");
      setShipmentHeight("");
      setShipmentWeight("");
      setSubmitting(false);

      // Open printable tab WITHOUT auto-printing (prevents UI freeze while print dialog is open)
      setTimeout(() => {
        printKartonaLabel(shipment.shipment_code, printItems, printTotal, printNotes);
      }, 0);

      // Refresh after
      await fetchData();
    } catch (error: any) {
      console.error("Error creating kartona:", error);
      toast.error(error.message || "Failed to create shipment");
      setSubmitting(false);
    }
  };

  const exportShipments = () => {
    if (shipments.length === 0) return;

    const headers = ['Shipment Code', 'Status', 'Created At', 'Sealed At', 'Notes', 'Length (cm)', 'Width (cm)', 'Height (cm)', 'Weight (kg)', 'Product SKU', 'Product Name', 'Quantity', 'Needs Boxing'];
    const rows: string[][] = [];

    shipments.forEach(shipment => {
      const batchList = shipment.batches || [];
      if (batchList.length === 0) {
        rows.push([
          shipment.shipment_code,
          shipment.status,
          format(new Date(shipment.created_at), 'yyyy-MM-dd HH:mm'),
          shipment.sealed_at ? format(new Date(shipment.sealed_at), 'yyyy-MM-dd HH:mm') : '',
          shipment.notes || '',
          shipment.length_cm != null ? String(shipment.length_cm) : '',
          shipment.width_cm != null ? String(shipment.width_cm) : '',
          shipment.height_cm != null ? String(shipment.height_cm) : '',
          shipment.weight_kg != null ? String(shipment.weight_kg) : '',
          '', '', '', ''
        ]);
      } else {
        batchList.forEach((batch, idx) => {
          rows.push([
            idx === 0 ? shipment.shipment_code : '',
            idx === 0 ? shipment.status : '',
            idx === 0 ? format(new Date(shipment.created_at), 'yyyy-MM-dd HH:mm') : '',
            idx === 0 && shipment.sealed_at ? format(new Date(shipment.sealed_at), 'yyyy-MM-dd HH:mm') : '',
            idx === 0 ? (shipment.notes || '') : '',
            idx === 0 && shipment.length_cm != null ? String(shipment.length_cm) : '',
            idx === 0 && shipment.width_cm != null ? String(shipment.width_cm) : '',
            idx === 0 && shipment.height_cm != null ? String(shipment.height_cm) : '',
            idx === 0 && shipment.weight_kg != null ? String(shipment.weight_kg) : '',
            batch.product?.sku || '',
            batch.product?.name_en || '',
            String(batch.quantity),
            (batch.order_item?.needs_boxing ?? true) ? 'Yes' : 'No'
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
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Could not open print window. Please allow popups.');
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Shipment Label - ${shipmentCode}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              padding: 20px;
              max-width: 600px;
              margin: 0 auto;
            }
            .header { 
              text-align: center; 
              border-bottom: 3px solid black; 
              padding-bottom: 15px;
              margin-bottom: 20px;
            }
            .shipment-code { 
              font-size: 36px; 
              font-weight: bold; 
              font-family: monospace;
            }
            .order-info { 
              font-size: 18px; 
              margin-top: 10px;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin: 20px 0;
            }
            th, td { 
              text-align: left; 
              padding: 8px; 
              border-bottom: 1px solid #ccc;
            }
            th { 
              background: #f5f5f5; 
              font-weight: bold;
            }
            .total-row {
              font-weight: bold;
              border-top: 2px solid #333;
            }
            .notes { 
              margin-top: 20px; 
              padding: 10px;
              background: #f5f5f5;
              border-radius: 4px;
            }
            .footer { 
              margin-top: 30px; 
              text-align: center;
              font-size: 12px;
              color: #666;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="shipment-code">${shipmentCode}</div>
            <div class="order-info">Order: ${order?.order_number || ''}</div>
            <div style="margin-top: 5px; color: #666;">
              ${format(new Date(), 'PPP p')}
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th style="text-align: center;">Qty</th>
                <th style="text-align: center;">Boxed</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td style="font-family: monospace;">${item.sku}</td>
                  <td>${item.name}</td>
                  <td style="text-align: center; font-weight: bold;">${item.qty}</td>
                  <td style="text-align: center;">${item.needsBoxing ? 'Yes' : 'No'}</td>
                </tr>
              `).join('')}
              <tr class="total-row">
                <td colspan="2">Total</td>
                <td style="text-align: center;">${totalItems}</td>
                <td></td>
              </tr>
            </tbody>
          </table>

          ${notes ? `
            <div class="notes">
              <strong>Notes:</strong> ${notes}
            </div>
          ` : ''}

          <div class="footer">
            Miracle Medical Products Factory
          </div>
          
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
          {t('common.back')}
        </Button>
        <p className="text-center text-muted-foreground mt-8">{t('phase.order_not_found')}</p>
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
              <h1 className="text-2xl font-bold">{t('boxing.title')}</h1>
              <p className="text-muted-foreground">
                {order.order_number} {order.customer?.name && `· ${order.customer.name}`}
                {order.priority === "high" && (
                  <Badge variant="destructive" className="ml-2">
                    {t('phase.high_priority')}
                  </Badge>
                )}
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/orders/${id}`)}>
            {t('phase.view_order_details')}
          </Button>
          <Button variant="outline" onClick={() => setNotesDialogOpen(true)}>
            <Package className="mr-2 h-4 w-4" />
            {t('phase.packaging_reference')}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('boxing.ready_for_boxing')}</p>
            <p className="text-2xl font-bold text-warning">{totalReadyForBoxing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('boxing.in_boxing_phase')}</p>
            <p className="text-2xl font-bold text-primary">{totalInBoxing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('boxing.ready_for_shipment')}</p>
            <p className="text-2xl font-bold text-green-600">{totalReadyForShipment}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('boxing.total_kartonas')}</p>
            <p className="text-2xl font-bold text-purple-600">{shipments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('boxing.total_shipped')}</p>
            <p className="text-2xl font-bold text-green-600">{totalShipped}</p>
          </CardContent>
        </Card>
      </div>

      {isCancelled && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-2 text-destructive font-medium">
            <Badge variant="destructive">{t('status.cancelled')}</Badge>
            {t('phase.cancelled_order_msg')}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue={defaultTab} className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full max-w-3xl">
          <TabsTrigger value="receive">{t('phase.receive')} ({readyBoxGroups.length})</TabsTrigger>
          <TabsTrigger value="process">{t('phase.process')} ({totalInBoxing})</TabsTrigger>
          <TabsTrigger value="extra">{t('phase.extra')} ({extraCount})</TabsTrigger>
          <TabsTrigger value="ready">{t('phase.ready')} ({totalReadyForShipment})</TabsTrigger>
          <TabsTrigger value="shipments">{t('phase.shipments')} ({shipments.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="receive" className="space-y-4">
          {canManage && !isCancelled && readyBoxGroups.length > 0 && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={handleSelectAllBoxes}>
                  <CheckSquare className="h-4 w-4 me-2" />
                  {selectedBoxes.size === filteredReadyBoxGroups.length ? t('phase.deselect_all') : t('phase.select_all')}
                </Button>
                <Button onClick={() => setAcceptDialogOpen(true)} disabled={selectedBoxes.size === 0}>
                  {t('phase.accept_n_boxes').replace('{n}', String(selectedBoxes.size))}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Search Box */}
          <Card>
            <CardContent className="p-4">
              <Label>{t('phase.search_box_product')}</Label>
              <div className="flex gap-2 mt-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    value={receiveSearchQuery}
                    onChange={(e) => setReceiveSearchQuery(e.target.value)}
                    placeholder={t('phase.type_to_filter')} 
                    className="pl-10" 
                  />
                </div>
                {receiveSearchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setReceiveSearchQuery('')}>
                    {t('phase.clear')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setScanPopupOpen(true)}>
                  <QrCode className="h-4 w-4 me-2" />
                  {t('phase.scan')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {filteredReadyBoxGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {receiveSearchQuery.trim() 
                    ? `${t('phase.no_boxes_matching')} "${receiveSearchQuery}"` 
                    : t('phase.no_boxes_ready_boxing')}
                </CardContent>
              </Card>
            ) : (
              filteredReadyBoxGroups.map((group) => (
                <Card key={group.box_id} className={selectedBoxes.has(group.box_id) ? "border-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      {canManage && !isCancelled && (
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
                      <Badge variant="secondary">{group.totalQty} {t('phase.items')}</Badge>
                      <div className="flex-1 text-sm text-muted-foreground">
                        {group.batches.map((b) => `${b.product?.sku} - ${b.product?.name_en} (${b.quantity})`).join(", ")}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="process" className="space-y-4">
          {canManage && !isCancelled && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {t('phase.selected_count').replace('{n}', String(totalSelected))}
                </Badge>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setMoveToExtraDialogOpen(true)} disabled={totalSelected === 0}>
                    <Package className="h-4 w-4 me-2" />
                    {t('phase.assign_to_extra')}
                  </Button>
                  <Button onClick={() => {
                    // Enforce single product per box
                    const selectedProductIds = new Set(
                      Array.from(productSelections.entries())
                        .filter(([_, qty]) => qty > 0)
                        .map(([key]) => inBoxingGroups.find(g => g.groupKey === key)?.product_id)
                        .filter(Boolean)
                    );
                    if (selectedProductIds.size > 1) {
                      toast.error(t('phase.single_product_per_box'));
                      return;
                    }
                    setMoveToReadyDialogOpen(true);
                  }} disabled={totalSelected === 0}>
                    <Package className="h-4 w-4 me-2" />
                    {t('phase.move_to_ready')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {inBoxingGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">{t('phase.no_items_boxing')}</CardContent>
              </Card>
            ) : (
              inBoxingGroups.map((group) => {
                const key = group.groupKey;
                const groupItemId = group.order_item_ids[0] || key;
                const itemInProgress = isInProgress(groupItemId);
                return (
                  <Card key={key} className={itemInProgress ? "border-green-500 dark:border-green-400" : ""}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{group.product_name}</p>
                          {group.product_name_ar && (
                            <span className="text-sm text-muted-foreground">({group.product_name_ar})</span>
                          )}
                          {group.size && (
                            <Badge variant="outline" className="text-xs">{group.size}</Badge>
                          )}
                          {group.product_color_en && (
                            <Badge variant="outline" className="text-xs">{group.product_color_en}</Badge>
                          )}
                            {group.needs_boxing ? (
                            <Badge variant="outline" className="text-xs bg-primary/10">
                              {t('phase.needs_boxing')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              {t('phase.no_boxing')}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="secondary">{group.quantity} {t('phase.available')}</Badge>
                        {canManage && !isCancelled && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">{t('phase.select')}</Label>
                              <NumericInput
                                min={0}
                                max={group.quantity}
                                value={productSelections.get(key) || undefined}
                                onValueChange={(val) => {
                                  setProductSelections((prev) => new Map(prev).set(key, val ?? 0));
                                }}
                                className="w-20 h-8"
                              />
                            </div>
                          )}
                        {canManage && !isCancelled && (
                          itemInProgress ? (
                            <Badge className="bg-green-600 text-white px-3 py-1.5">{t('phase.in_progress')}</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => markInProgress(groupItemId)}>
                              {t('phase.start_working')}
                            </Button>
                          )
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

        <TabsContent value="extra" className="space-y-6">
          <ExtraItemsTab 
            orderId={id!} 
            phase="boxing" 
            onRefresh={() => fetchData()}
            canManage={canManage && !isCancelled}
            onCountChange={setExtraCount}
          />

          {/* Added to Extra Inventory from this Order */}
          {addedToExtraItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-orange-200 dark:border-orange-900">
                <Package className="h-4 w-4 text-orange-600" />
                <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">{t('phase.added_to_extra_from_order')}</h3>
              </div>
              {addedToExtraItems.map((item) => (
                <Card
                  key={item.product_id}
                  className="border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/20"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">{item.product_sku}</p>
                      </div>
                      <Badge className="bg-orange-500 hover:bg-orange-600 text-white">{item.quantity} to extra</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ready" className="space-y-4">
          {canManage && !isCancelled && readyForShipmentGroups.length > 0 && (
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
                          {group.product_name_ar && (
                            <span className="text-sm text-muted-foreground">({group.product_name_ar})</span>
                          )}
                          {group.size && (
                            <Badge variant="outline" className="text-xs">{group.size}</Badge>
                          )}
                          {group.product_color_en && (
                            <Badge variant="outline" className="text-xs">{group.product_color_en}</Badge>
                          )}
                            {group.needs_boxing ? (
                              <Badge variant="outline" className="text-xs bg-primary/10">
                                Boxed
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs">
                                Not Boxed
                              </Badge>
                            )}
                            {group.batches.some(b => b.from_extra_state === 'extra_boxing') && (
                              <Badge className="text-xs bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-300 dark:border-purple-700">
                                From Extra
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                        </div>
                        <div className="flex items-center gap-4">
                          <Badge variant="default" className="bg-green-600">
                            {group.quantity} ready
                          </Badge>
                          {canManage && !isCancelled && (
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground">Select</Label>
                              <NumericInput
                                min={0}
                                max={group.quantity}
                                value={readyForShipmentSelections.get(key) || undefined}
                                onValueChange={(val) => {
                                  setReadyForShipmentSelections((prev) => new Map(prev).set(key, val ?? 0));
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
          {/* Production Rate Section - for shipped batches that were processed in boxing */}
          <ProductionRateSection
            batches={[
              ...batches.filter(b => b.current_state === 'shipped' && b.from_extra_state !== 'extra_boxing' && !b.is_special && b.order_item?.needs_boxing !== false).map(b => ({
                id: b.id,
                product_id: b.product_id,
                product_name: b.product?.name_en || 'Unknown',
                product_sku: b.product?.sku || 'N/A',
                quantity: b.quantity,
                machine_id: b.boxing_machine_id,
                needs_boxing: b.order_item?.needs_boxing ?? true,
                order_item_id: b.order_item_id || null,
              })),
              ...extraBatchesForRate.map((eb) => ({
                id: eb.id,
                product_id: eb.product_id,
                product_name: eb.product_name,
                product_sku: eb.product_sku,
                quantity: eb.quantity,
                machine_id: eb.boxing_machine_id,
                needs_boxing: true,
                order_item_id: null,
                isExtraBatch: true,
              })),
            ]}
            machineType="boxing"
            machineColumnName="boxing_machine_id"
            onAssigned={() => { fetchData(); fetchAddedToExtra(); }}
            canManage={canManage}
          />

          {/* Retrieved from Extra - from history (immutable source of truth) */}
          <RetrievedFromExtraSection
            batches={retrievedFromExtraBatches}
          />

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
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">
                          {format(new Date(shipment.created_at), "PPP")}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const items = shipment.batches.map(batch => ({
                              sku: batch.product?.sku || '',
                              name: batch.product?.name_en || '',
                              qty: batch.quantity,
                              needsBoxing: batch.order_item?.needs_boxing ?? true,
                            }));
                            const total = items.reduce((sum, i) => sum + i.qty, 0);
                            printKartonaLabel(shipment.shipment_code, items, total, shipment.notes || '');
                          }}
                        >
                          <Printer className="h-4 w-4 mr-1" />
                          Reprint
                        </Button>
                      </div>
                    </div>
                    {shipment.notes && (
                      <p className="text-sm text-muted-foreground mb-3">{shipment.notes}</p>
                    )}
                    {(shipment.length_cm != null || shipment.width_cm != null || shipment.height_cm != null || shipment.weight_kg != null) && (
                      <div className="flex gap-4 text-xs text-muted-foreground mb-3 flex-wrap">
                        {shipment.length_cm != null && <span>L: {shipment.length_cm} cm</span>}
                        {shipment.width_cm != null && <span>W: {shipment.width_cm} cm</span>}
                        {shipment.height_cm != null && <span>H: {shipment.height_cm} cm</span>}
                        {shipment.weight_kg != null && <span>Wt: {shipment.weight_kg} kg</span>}
                      </div>
                    )}
                    <div className="space-y-1">
                      {(() => {
                        // Group batches by order_item_id
                        const groupedItems = new Map<string, {
                          order_item_id: string;
                          product_sku: string;
                          product_name: string;
                          total_quantity: number;
                          needs_boxing: boolean;
                        }>();
                        
                        shipment.batches.forEach(batch => {
                          const orderItemId = batch.order_item_id || 'unknown';
                          const existing = groupedItems.get(orderItemId);
                          if (existing) {
                            existing.total_quantity += batch.quantity;
                          } else {
                            groupedItems.set(orderItemId, {
                              order_item_id: orderItemId,
                              product_sku: batch.product?.sku || 'N/A',
                              product_name: batch.product?.name_en || 'Unknown',
                              total_quantity: batch.quantity,
                              needs_boxing: batch.order_item?.needs_boxing ?? true,
                            });
                          }
                        });
                        
                        return Array.from(groupedItems.values()).map((group) => (
                          <div key={group.order_item_id} className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span>{group.product_sku}</span>
                              <span className="text-muted-foreground">- {group.product_name}</span>
                              {!group.needs_boxing && (
                                <Badge variant="secondary" className="text-xs">No Boxing</Badge>
                              )}
                            </div>
                            <Badge variant="outline">{group.total_quantity}</Badge>
                          </div>
                        ));
                      })()}
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
            <DialogTitle>{t('phase.accept_into_boxing')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('phase.accept_msg').replace('{n}', String(selectedBoxes.size)).replace('{phase}', t('phase.process'))}
            </p>
            <div>
              <Label>{t('phase.lead_time')} *</Label>
              <Select value={etaDays} onValueChange={setEtaDays}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 7, 10, 14, 21, 30].map(d => (
                    <SelectItem key={d} value={d.toString()}>{d} {d !== 1 ? t('phase.days') : t('phase.day')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                {t('phase.expected_complete_by')} <strong>{new Date(Date.now() + parseInt(etaDays) * 24 * 60 * 60 * 1000).toLocaleDateString()}</strong>
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p className="font-medium mb-1">{t('phase.routing')}</p>
              <ul className="list-disc list-inside">
                <li>{t('phase.routing_yes')}</li>
                <li>{t('phase.routing_no')}</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcceptDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleAcceptBoxes} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {t('phase.accept')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Ready Dialog */}
      <Dialog open={moveToReadyDialogOpen} onOpenChange={setMoveToReadyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('phase.move_to_ready_title')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              {t('phase.move_to_ready_msg').replace('{n}', String(totalSelected))}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveToReadyDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleMoveToReadyForShipment} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : null}
              {t('phase.move')}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Length (cm)</Label>
                <Input type="number" min={0} step="0.1" value={shipmentLength} onChange={(e) => setShipmentLength(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Width (cm)</Label>
                <Input type="number" min={0} step="0.1" value={shipmentWidth} onChange={(e) => setShipmentWidth(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Height (cm)</Label>
                <Input type="number" min={0} step="0.1" value={shipmentHeight} onChange={(e) => setShipmentHeight(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <Label>Weight (kg)</Label>
                <Input type="number" min={0} step="0.1" value={shipmentWeight} onChange={(e) => setShipmentWeight(e.target.value)} placeholder="Optional" />
              </div>
            </div>
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

      {/* Move to Extra Dialog */}
      <MoveToExtraDialog
        open={moveToExtraDialogOpen}
        onOpenChange={setMoveToExtraDialogOpen}
        orderId={id!}
        phase="in_boxing"
        selections={extraSelections}
        totalQuantity={totalSelected}
        onSuccess={() => {
          setProductSelections(new Map());
          fetchData();
        }}
        userId={user?.id}
      />

      <BoxScanPopup
        open={scanPopupOpen}
        onOpenChange={setScanPopupOpen}
        onAddBoxes={handleAddScannedBoxes}
        orderId={id!}
        filterState="ready_for_boxing"
        alreadySelectedIds={Array.from(selectedBoxes)}
      />
      <Dialog open={notesDialogOpen} onOpenChange={setNotesDialogOpen}>
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
          {order?.notes?.includes('---PACKAGING_REFERENCE---') && (
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  // Parse and download as CSV
                  const notes = order?.notes || '';
                  const startTag = "---PACKAGING_REFERENCE---";
                  const endTag = "---END_PACKAGING_REFERENCE---";
                  const startIdx = notes.indexOf(startTag);
                  const endIdx = notes.indexOf(endTag);
                  if (startIdx === -1 || endIdx === -1) return;
                  const block = notes.substring(startIdx + startTag.length, endIdx).trim();
                  const rows: string[][] = [['Shipment', 'SKU', 'Product', 'Quantity', 'Length (cm)', 'Width (cm)', 'Height (cm)', 'Weight (kg)']];
                  for (const line of block.split("\n")) {
                    const match = line.match(/^Shipment (\d+): \[(.+?)\] (.+?) x (\d+)(?:\s*\{(.+?)\})?$/);
                    if (match) {
                      const dims: Record<string, string> = {};
                      if (match[5]) {
                        for (const part of match[5].split(/\s+/)) {
                          const [key, val] = part.split(':');
                          if (key === 'L') dims.length = val;
                          else if (key === 'W') dims.width = val;
                          else if (key === 'H') dims.height = val;
                          else if (key === 'Wt') dims.weight = val;
                        }
                      }
                      rows.push([match[1], match[2], match[3], match[4], dims.length || '', dims.width || '', dims.height || '', dims.weight || '']);
                    }
                  }
                  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `packaging-reference-${order.order_number}.csv`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <Download className="mr-2 h-4 w-4" />
                Download
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
