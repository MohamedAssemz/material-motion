import { useEffect, useState, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useParams, useNavigate } from "react-router-dom";
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
import { ArrowLeft, Sparkles, Box, Loader2, QrCode, Search, CheckSquare, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExtraItemsTab } from "@/components/ExtraItemsTab";
import { BoxScanPopup } from "@/components/BoxScanPopup";
import { MoveToExtraDialog } from "@/components/MoveToExtraDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductionRateSection } from "@/components/ProductionRateSection";
import { RetrievedFromExtraSection } from "@/components/RetrievedFromExtraSection";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { normalizeBoxCode } from "@/lib/boxUtils";

interface Batch {
  id: string;
  qr_code_data: string;
  current_state: string;
  quantity: number;
  product_id: string;
  order_item_id: string | null;
  box_id: string | null;
  finishing_machine_id: string | null;
  manufacturing_machine_id: string | null;
  from_extra_state?: string | null;
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
  order_item?: { id: string; needs_boxing: boolean } | null;
}

interface Order {
  id: string;
  order_number: string;
  priority: string;
  status: string;
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
  needs_packing: boolean;
  needs_boxing: boolean;
  quantity: number;
  batches: Batch[];
  order_item_ids: string[]; // Track all order_item_ids in this group
}

export default function OrderFinishing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
  const { t } = useLanguage();
  const [order, setOrder] = useState<Order | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [completedBatches, setCompletedBatches] = useState<Batch[]>([]);
  const [retrievedFromExtraBatches, setRetrievedFromExtraBatches] = useState<
    Array<{ id: string; product_id: string; product_name: string; product_sku: string; quantity: number; order_item_id?: string | null }>
  >([]);
  const [addedToExtraItems, setAddedToExtraItems] = useState<
    Array<{ product_id: string; product_name: string; product_sku: string; quantity: number }>
  >([]);
  const [extraBatchesForRate, setExtraBatchesForRate] = useState<
    Array<{ id: string; product_id: string; product_name: string; product_sku: string; quantity: number; finishing_machine_id: string | null }>
  >([]);
  
  const [loading, setLoading] = useState(true);


  // Selection states
  const [selectedBoxes, setSelectedBoxes] = useState<Set<string>>(new Set());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());
  const [etaDays, setEtaDays] = useState("1");
  const [receiveSearchQuery, setReceiveSearchQuery] = useState("");
  const [scanPopupOpen, setScanPopupOpen] = useState(false);

  // Dialog states
  const [acceptDialogOpen, setAcceptDialogOpen] = useState(false);
  const [boxAssignDialogOpen, setBoxAssignDialogOpen] = useState(false);
  const [moveToExtraDialogOpen, setMoveToExtraDialogOpen] = useState(false);
  const [boxSearchCode, setBoxSearchCode] = useState("");
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Machine selection state
  const [machines, setMachines] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [loadingMachines, setLoadingMachines] = useState(false);

  const canManage = hasRole("finishing_manager") || hasRole("admin");
  const isCancelled = order?.status === 'cancelled';

  // completedBatches already excludes retrieved-from-extra items via from_extra_state filter
  const processedBatchesForRate = completedBatches;
  useEffect(() => {
    fetchData();
    fetchAddedToExtra();
    fetchRetrievedFromExtra();
    const channel = supabase
      .channel(`order-finishing-${id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "order_batches", filter: `order_id=eq.${id}` },
        () => {
          fetchData();
          fetchAddedToExtra();
          fetchRetrievedFromExtra();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const fetchData = async () => {
    try {
      const [orderRes, batchesRes, completedRes] = await Promise.all([
        supabase.from("orders").select("id, order_number, priority, status, customer:customers(name)").eq("id", id).single(),
        supabase
          .from("order_batches")
          .select(
            "id, qr_code_data, current_state, quantity, product_id, order_item_id, box_id, manufacturing_machine_id, finishing_machine_id, from_extra_state, product:products(id, name, sku, needs_packing)",
          )
          .eq("order_id", id)
          .in("current_state", ["ready_for_finishing", "in_finishing"]),
        // Fetch completed items for this phase (moved to next phases)
        supabase
          .from("order_batches")
          .select(
            "id, qr_code_data, current_state, quantity, product_id, order_item_id, box_id, manufacturing_machine_id, finishing_machine_id, from_extra_state, product:products(id, name, sku, needs_packing)",
          )
          .eq("order_id", id)
          .in("current_state", [
            "ready_for_packaging",
            "in_packaging",
            "ready_for_boxing",
            "in_boxing",
            "ready_for_shipment",
            "shipped",
          ]),
      ]);

      if (orderRes.error) throw orderRes.error;
      if (batchesRes.error) throw batchesRes.error;

      // Fetch box info for all batches
      const allBatchData = [...(batchesRes.data || []), ...(completedRes.data || [])];
      const boxIds = allBatchData.filter((b: any) => b.box_id).map((b: any) => b.box_id);
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase
          .from("boxes")
          .select("id, box_code")
          .in("id", [...new Set(boxIds)]);
        boxesData?.forEach((box) => boxMap.set(box.id, box));
      }

      // Fetch order_item info for needs_boxing
      const orderItemIds = allBatchData.filter((b: any) => b.order_item_id).map((b: any) => b.order_item_id);
      let orderItemMap = new Map();
      if (orderItemIds.length > 0) {
        const { data: orderItemsData } = await supabase
          .from("order_items")
          .select("id, needs_boxing")
          .in("id", [...new Set(orderItemIds)]);
        orderItemsData?.forEach((oi) => orderItemMap.set(oi.id, oi));
      }

      const batchesWithData =
        batchesRes.data?.map((batch: any) => ({
          ...batch,
          box: batch.box_id ? boxMap.get(batch.box_id) : null,
          order_item: batch.order_item_id ? orderItemMap.get(batch.order_item_id) : null,
        })) || [];

      const completedWithData =
        completedRes.data?.map((batch: any) => ({
          ...batch,
          box: batch.box_id ? boxMap.get(batch.box_id) : null,
          order_item: batch.order_item_id ? orderItemMap.get(batch.order_item_id) : null,
        })) || [];

      setOrder(orderRes.data as Order);
      setBatches(batchesWithData as Batch[]);
      const filteredCompleted = completedWithData.filter(
        (b: any) => !['extra_finishing', 'extra_packaging', 'extra_boxing'].includes(b.from_extra_state)
      );
      setCompletedBatches(filteredCompleted as Batch[]);
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
        .from("extra_batch_history")
        .select("quantity, product_id, extra_batch_id, products(name, sku)")
        .eq("event_type", "CREATED")
        .eq("source_order_id", id)
        .eq("from_state", "in_finishing");

      if (error) throw error;

      const productMap = new Map<
        string,
        { product_id: string; product_name: string; product_sku: string; quantity: number }
      >();
      const extraBatchIds = new Set<string>();
      (data || []).forEach((record: any) => {
        if (record.extra_batch_id) extraBatchIds.add(record.extra_batch_id);
        const existing = productMap.get(record.product_id);
        if (existing) {
          existing.quantity += record.quantity;
        } else {
          productMap.set(record.product_id, {
            product_id: record.product_id,
            product_name: record.products?.name || "Unknown",
            product_sku: record.products?.sku || "N/A",
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
          .from("extra_batches")
          .select("id, product_id, finishing_machine_id, product:products(name, sku)")
          .in("id", Array.from(extraBatchIds));
        setExtraBatchesForRate(
          (extraBatches || []).map((eb: any) => ({
            id: eb.id,
            product_id: eb.product_id,
            product_name: eb.product?.name || "Unknown",
            product_sku: eb.product?.sku || "N/A",
            quantity: historyByBatch.get(eb.id) || 0,
            finishing_machine_id: eb.finishing_machine_id,
          }))
        );
      } else {
        setExtraBatchesForRate([]);
      }

    } catch (error) {
      console.error("Error fetching added to extra:", error);
    }
  };

  const fetchRetrievedFromExtra = async () => {
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from('extra_batch_history')
        .select('quantity, product_id, consuming_order_item_id, products(name, sku)')
        .eq('event_type', 'CONSUMED')
        .eq('consuming_order_id', id)
        .eq('from_state', 'extra_finishing');

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
            product_name: record.products?.name || 'Unknown',
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

  const fetchEmptyBoxes = async () => {
    setLoadingBoxes(true);
    try {
      const { data: allBoxes } = await supabase
        .from("boxes")
        .select("id, box_code")
        .eq("is_active", true)
        .order("box_code");
      const { data: occupiedBatches } = await supabase
        .from("order_batches")
        .select("box_id")
        .not("box_id", "is", null);
      const occupiedIds = new Set(occupiedBatches?.map((b) => b.box_id) || []);
      setAvailableBoxes(allBoxes?.filter((box) => !occupiedIds.has(box.id)) || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingBoxes(false);
    }
  };

  const fetchMachines = async () => {
    setLoadingMachines(true);
    try {
      const { data } = await supabase
        .from("machines")
        .select("id, name")
        .eq("type", "finishing")
        .eq("is_active", true)
        .order("name");
      setMachines(data || []);
    } catch (error) {
      console.error("Error fetching machines:", error);
    } finally {
      setLoadingMachines(false);
    }
  };

  const searchBox = async () => {
    if (!boxSearchCode.trim()) return;
    const normalizedCode = normalizeBoxCode(boxSearchCode);
    try {
      const { data: box } = await supabase
        .from("boxes")
        .select("id, box_code")
        .eq("box_code", normalizedCode)
        .eq("is_active", true)
        .single();

      if (!box) {
        toast.error(`Box ${boxSearchCode} not found`);
        setBoxSearchCode("");
        return;
      }

      const { data: existingBatches } = await supabase
        .from("order_batches")
        .select("id")
        .eq("box_id", box.id)
        .limit(1);

      if (existingBatches && existingBatches.length > 0) {
        toast.error(`Box ${box.box_code} is already occupied`);
        setBoxSearchCode("");
        return;
      }

      setSelectedBox(box);
      setBoxSearchCode("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Group ready_for_finishing by box
  const readyBoxGroups: BoxGroup[] = [];
  const boxMap = new Map<string, BoxGroup>();
  batches
    .filter((b) => b.current_state === "ready_for_finishing" && b.box_id)
    .forEach((batch) => {
      if (!boxMap.has(batch.box_id!)) {
        boxMap.set(batch.box_id!, {
          box_id: batch.box_id!,
          box_code: batch.box?.box_code || "Unknown",
          batches: [],
          totalQty: 0,
        });
      }
      const group = boxMap.get(batch.box_id!)!;
      group.batches.push(batch);
      group.totalQty += batch.quantity;
    });
  boxMap.forEach((g) => readyBoxGroups.push(g));

  // Group in_finishing by product + needs_boxing to combine same product items
  const inFinishingGroups: OrderItemGroup[] = [];
  const orderItemGroupMap = new Map<string, OrderItemGroup>();
  batches
    .filter((b) => b.current_state === "in_finishing")
    .forEach((batch) => {
      const needsBoxing = batch.order_item?.needs_boxing ?? true;
      const groupKey = `${batch.product_id}-${needsBoxing ? "boxing" : "no-boxing"}`;

      if (!orderItemGroupMap.has(groupKey)) {
        orderItemGroupMap.set(groupKey, {
          groupKey,
          product_id: batch.product_id,
          product_name: batch.product?.name || "Unknown",
          product_sku: batch.product?.sku || "N/A",
          needs_packing: batch.product?.needs_packing ?? true,
          needs_boxing: needsBoxing,
          quantity: 0,
          batches: [],
          order_item_ids: [],
        });
      }
      const group = orderItemGroupMap.get(groupKey)!;
      group.batches.push(batch);
      group.quantity += batch.quantity;
      if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
        group.order_item_ids.push(batch.order_item_id);
      }
    });
  orderItemGroupMap.forEach((g) => inFinishingGroups.push(g));
  inFinishingGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));

  // Group completed items by product + needs_boxing
  const completedGroups: OrderItemGroup[] = [];
  const completedGroupMap = new Map<string, OrderItemGroup>();
  completedBatches.forEach((batch) => {
    const needsBoxing = batch.order_item?.needs_boxing ?? true;
    const groupKey = `${batch.product_id}-${needsBoxing ? "boxing" : "no-boxing"}`;

    if (!completedGroupMap.has(groupKey)) {
      completedGroupMap.set(groupKey, {
        groupKey,
        product_id: batch.product_id,
        product_name: batch.product?.name || "Unknown",
        product_sku: batch.product?.sku || "N/A",
        needs_packing: batch.product?.needs_packing ?? true,
        needs_boxing: needsBoxing,
        quantity: 0,
        batches: [],
        order_item_ids: [],
      });
    }
    const group = completedGroupMap.get(groupKey)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
    if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
      group.order_item_ids.push(batch.order_item_id);
    }
  });
  completedGroupMap.forEach((g) => completedGroups.push(g));
  completedGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));

  const totalReadyForFinishing = readyBoxGroups.reduce((sum, g) => sum + g.totalQty, 0);
  const totalInFinishing = inFinishingGroups.reduce((sum, g) => sum + g.quantity, 0);
  const totalAddedToExtra = addedToExtraItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCompleted = completedGroups.reduce((sum, g) => sum + g.quantity, 0) + totalAddedToExtra;
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);

  // Prepare selections for MoveToExtraDialog - only items in "in_finishing" state
  const extraSelections = inFinishingGroups
    .filter((g) => productSelections.get(g.groupKey) && productSelections.get(g.groupKey)! > 0)
    .map((g) => ({
      groupKey: g.groupKey,
      product_id: g.product_id,
      product_name: g.product_name,
      product_sku: g.product_sku,
      quantity: productSelections.get(g.groupKey) || 0,
      order_item_ids: g.order_item_ids,
      batches: g.batches.map((b) => ({
        id: b.id,
        quantity: b.quantity,
        current_state: b.current_state,
        order_item_id: b.order_item_id,
      })),
    }))
    .filter((s) => s.quantity > 0);

  // Filter boxes based on search query (box code, product SKU, or product name)
  const filteredReadyBoxGroups = receiveSearchQuery.trim()
    ? readyBoxGroups.filter((group) => {
        const query = receiveSearchQuery.trim().toUpperCase();
        if (group.box_code.toUpperCase().includes(query)) return true;
        return group.batches.some(
          (b) => b.product?.sku?.toUpperCase().includes(query) || b.product?.name?.toUpperCase().includes(query),
        );
      })
    : readyBoxGroups;

  const handleSelectAllBoxes = () => {
    if (selectedBoxes.size === filteredReadyBoxGroups.length) {
      setSelectedBoxes(new Set());
    } else {
      setSelectedBoxes(new Set(filteredReadyBoxGroups.map((g) => g.box_id)));
    }
  };

  const handleAddScannedBoxes = (boxes: Array<{ id: string; box_code: string; total_quantity: number }>) => {
    setSelectedBoxes((prev) => {
      const next = new Set(prev);
      boxes.forEach((box) => next.add(box.id));
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

      const batchIds = batches
        .filter((b) => b.current_state === "ready_for_finishing" && b.box_id && selectedBoxes.has(b.box_id))
        .map((b) => b.id);

      // Clear box_id when receiving - boxes become available again
      await supabase
        .from("order_batches")
        .update({
          current_state: "in_finishing",
          eta: etaDate.toISOString(),
          lead_time_days: parseInt(etaDays) || 1,
          box_id: null, // Free up the box
        })
        .in("id", batchIds);

      // Reset boxes to empty state
      const boxIds = Array.from(selectedBoxes);
      await supabase
        .from("boxes")
        .update({
          items_list: [],
          content_type: "EMPTY",
        })
        .in("id", boxIds);

      toast.success(`Accepted ${selectedBoxes.size} box(es) into finishing`);
      setSelectedBoxes(new Set());
      setAcceptDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenAssignDialog = () => {
    if (totalSelected === 0) {
      toast.error("Please select items first");
      return;
    }

    // Validate: all selected items must have the same needs_packing value
    const selectedGroups = inFinishingGroups.filter(
      (g) => productSelections.get(g.groupKey) && productSelections.get(g.groupKey)! > 0,
    );

    const needsPackingValues = new Set(selectedGroups.map((g) => g.needs_packing));
    if (needsPackingValues.size > 1) {
      toast.error(
        "Cannot mix items in the same box: some require packaging while others go directly to boxing. Please select items with the same packaging requirement.",
      );
      return;
    }

    setSelectedBox(null);
    setBoxSearchCode("");
    setSelectedMachine(null);
    fetchEmptyBoxes();
    fetchMachines();
    setBoxAssignDialogOpen(true);
  };

  const handleAssignToBox = async () => {
    if (!selectedBox || totalSelected === 0) return;
    setSubmitting(true);
    const machineId = selectedMachine;
    try {
      // Get current box data for items_list
      const { data: boxData } = await supabase.from("boxes").select("items_list").eq("id", selectedBox.id).single();

      const currentItems = Array.isArray(boxData?.items_list) ? boxData.items_list : [];
      const newItems: Array<{
        product_id: string;
        product_name: string;
        product_sku: string;
        quantity: number;
        batch_id: string;
        batch_type: string;
        needs_boxing: boolean;
      }> = [];

      for (const [key, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;

        const group = inFinishingGroups.find((g) => g.groupKey === key);
        if (!group) continue;

        // Determine next state based on needs_packing
        const nextState = group.needs_packing ? "ready_for_packaging" : "ready_for_boxing";

        let remainingQty = quantity;
        // Sort batches: prioritize those with machine assigned, then by quantity
        const sortedBatches = [...group.batches].sort((a, b) => {
          const aHasMachine = a.finishing_machine_id ? 0 : 1;
          const bHasMachine = b.finishing_machine_id ? 0 : 1;
          if (aHasMachine !== bHasMachine) return aHasMachine - bHasMachine;
          return a.quantity - b.quantity;
        });
        for (const batch of sortedBatches) {
          if (remainingQty <= 0) break;

          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          if (useQty === batch.quantity) {
            await supabase
              .from("order_batches")
              .update({
                current_state: nextState,
                box_id: selectedBox.id,
                finishing_machine_id: machineId || batch.finishing_machine_id,
              })
              .eq("id", batch.id);

            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              quantity: useQty,
              batch_id: batch.id,
              batch_type: "ORDER",
              needs_boxing: group.needs_boxing,
            });
          } else {
            const { data: qrCode } = await supabase.rpc("generate_extra_batch_code");
            // Inherit machine IDs from parent batch
            const { data: newBatch } = await supabase
              .from("order_batches")
              .insert({
                qr_code_data: qrCode,
                order_id: id,
                product_id: batch.product_id,
                order_item_id: batch.order_item_id,
                current_state: nextState,
                quantity: useQty,
                box_id: selectedBox.id,
                created_by: user?.id,
                manufacturing_machine_id: batch.manufacturing_machine_id,
                finishing_machine_id: machineId || batch.finishing_machine_id,
                from_extra_state: batch.from_extra_state,
              })
              .select("id")
              .single();

            await supabase
              .from("order_batches")
              .update({ quantity: batch.quantity - useQty })
              .eq("id", batch.id);

            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              quantity: useQty,
              batch_id: newBatch?.id || batch.id,
              batch_type: "ORDER",
              needs_boxing: group.needs_boxing,
            });
          }
        }
      }

      // Update box with new items_list and content_type
      const updatedItems = [...currentItems, ...newItems];
      await supabase
        .from("boxes")
        .update({
          items_list: updatedItems,
          content_type: "ORDER",
        })
        .eq("id", selectedBox.id);

      toast.success(`Assigned ${totalSelected} items to ${selectedBox.box_code}`);
      setBoxAssignDialogOpen(false);
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
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
          <Button variant="ghost" onClick={() => navigate("/queues/finishing")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
              <Sparkles className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t('finishing.title')}</h1>
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
        <Button variant="outline" onClick={() => navigate(`/orders/${id}`)}>
          {t('phase.view_order_details')}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('finishing.ready_for_finishing')}</p>
            <p className="text-2xl font-bold text-warning">{totalReadyForFinishing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('finishing.in_finishing')}</p>
            <p className="text-2xl font-bold text-primary">{totalInFinishing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('phase.boxes_waiting')}</p>
            <p className="text-2xl font-bold">{readyBoxGroups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('finishing.products_in_finishing')}</p>
            <p className="text-2xl font-bold">{inFinishingGroups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">{t('phase.completed')}</p>
            <p className="text-2xl font-bold text-green-600">{totalCompleted}</p>
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

      <Tabs defaultValue="receive" className="space-y-4">
        <TabsList className="grid grid-cols-4 w-full max-w-2xl">
          <TabsTrigger value="receive">{t('phase.receive')} ({readyBoxGroups.length})</TabsTrigger>
          <TabsTrigger value="process">{t('phase.process')} ({totalInFinishing})</TabsTrigger>
          <TabsTrigger value="extra">{t('phase.extra')}</TabsTrigger>
          <TabsTrigger value="completed">{t('phase.completed')} ({totalCompleted})</TabsTrigger>
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
                    onBlur={() => {
                      if (!receiveSearchQuery.trim()) {
                        setReceiveSearchQuery("");
                      }
                    }}
                  />
                </div>
                {receiveSearchQuery && (
                  <Button variant="ghost" size="sm" onClick={() => setReceiveSearchQuery("")}>
                    {t('phase.clear')}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setScanPopupOpen(true)}>
                  <QrCode className="h-4 w-4 mr-2" />
                  Scan
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Boxes List */}
          <div className="space-y-3">
            {filteredReadyBoxGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  {receiveSearchQuery.trim()
                    ? `No boxes matching "${receiveSearchQuery}"`
                    : "No boxes ready for finishing"}
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
          {canManage && !isCancelled && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {totalSelected} selected
                </Badge>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setMoveToExtraDialogOpen(true)}
                    disabled={totalSelected === 0}
                    title="Move selected items to Extra Inventory"
                  >
                    <Package className="h-4 w-4 mr-2" />
                    Assign to Extra
                  </Button>
                  <Button onClick={handleOpenAssignDialog} disabled={totalSelected === 0}>
                    <Box className="h-4 w-4 mr-2" />
                    Assign to Box
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="space-y-3">
            {inFinishingGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">No items in finishing</CardContent>
              </Card>
            ) : (
              inFinishingGroups.map((group) => (
                <Card key={group.groupKey}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{group.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {group.product_sku} · {group.needs_packing ? "Needs Packing" : "No Packing"} ·{" "}
                          {group.needs_boxing ? "Needs Boxing" : "No Boxing"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <Badge variant="secondary">{group.quantity} available</Badge>
                        {canManage && !isCancelled && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Select</Label>
                            <NumericInput
                              min={0}
                              max={group.quantity}
                              value={productSelections.get(group.groupKey) || undefined}
                              onValueChange={(val) => {
                                setProductSelections((prev) => new Map(prev).set(group.groupKey, val ?? 0));
                              }}
                              className="w-20 h-8"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="extra" className="space-y-6">
          <ExtraItemsTab orderId={id!} phase="finishing" onRefresh={() => fetchData()} canManage={canManage && !isCancelled} />

          {/* Added to Extra Inventory from this Order */}
          {addedToExtraItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pb-2 border-b border-orange-200 dark:border-orange-900">
                <Package className="h-4 w-4 text-orange-600" />
                <h3 className="text-sm font-semibold text-orange-700 dark:text-orange-400">Added to Extra from this Order</h3>
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

        <TabsContent value="completed" className="space-y-6">
          {/* Production Rate Section */}
          <ProductionRateSection
            batches={[
              ...processedBatchesForRate.map((b) => ({
                id: b.id,
                product_id: b.product_id,
                product_name: b.product?.name || "Unknown",
                product_sku: b.product?.sku || "N/A",
                quantity: b.quantity,
                machine_id: b.finishing_machine_id,
                needs_boxing: b.order_item?.needs_boxing ?? true,
                order_item_id: b.order_item_id || null,
              })),
              ...extraBatchesForRate.map((eb) => ({
                id: eb.id,
                product_id: eb.product_id,
                product_name: eb.product_name,
                product_sku: eb.product_sku,
                quantity: eb.quantity,
                machine_id: eb.finishing_machine_id,
                needs_boxing: true,
                order_item_id: null,
                isExtraBatch: true,
              })),
            ]}
            machineType="finishing"
            machineColumnName="finishing_machine_id"
            onAssigned={() => { fetchData(); fetchAddedToExtra(); }}
            canManage={canManage}
          />

          <RetrievedFromExtraSection
            batches={retrievedFromExtraBatches}
          />

          {completedGroups.length === 0 && completedBatches.length === 0 && retrievedFromExtraBatches.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">No completed items yet</CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Accept Dialog */}
      <Dialog open={acceptDialogOpen} onOpenChange={setAcceptDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Accept Boxes into Finishing</DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              You are about to accept {selectedBoxes.size} box(es) into the finishing phase.
            </p>
            <div>
              <Label>Lead Time (days) *</Label>
              <Select value={etaDays} onValueChange={setEtaDays}>
                <SelectTrigger className="w-full mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((d) => (
                    <SelectItem key={d} value={d.toString()}>
                      {d} day{d !== 1 ? "s" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="p-3 rounded-lg bg-muted">
              <p className="text-sm text-muted-foreground">
                Items will be expected to complete by{" "}
                <strong>{new Date(Date.now() + parseInt(etaDays) * 24 * 60 * 60 * 1000).toLocaleDateString()}</strong>
              </p>
            </div>
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

      {/* Box Assignment Dialog */}
      <Dialog open={boxAssignDialogOpen} onOpenChange={setBoxAssignDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to Box</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Machine Selection */}
            <div>
              <Label>Finishing Machine (Optional)</Label>
              <div className="mt-2">
                <SearchableSelect
                  options={machines.map((m) => ({ value: m.id, label: m.name }))}
                  value={selectedMachine}
                  onValueChange={setSelectedMachine}
                  placeholder="Select a machine..."
                  searchPlaceholder="Search machines..."
                  emptyText="No finishing machines found"
                  loading={loadingMachines}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">Box Selection</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div>
              <Label>Search Box by Code</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={boxSearchCode}
                  onChange={(e) => setBoxSearchCode(e.target.value)}
                  placeholder="Enter box number (e.g., 42)"
                  onKeyDown={(e) => e.key === "Enter" && searchBox()}
                />
                <Button variant="outline" onClick={searchBox}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {selectedBox && (
              <div className="p-3 border rounded-lg bg-primary/5">
                <p className="font-medium">{selectedBox.box_code}</p>
                <p className="text-sm text-muted-foreground">Selected</p>
              </div>
            )}

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground">OR</span>
              <div className="flex-1 h-px bg-border" />
            </div>

            <div>
              <Label>Select Available Box</Label>
              <div className="mt-2">
                <SearchableSelect
                  options={availableBoxes.map((b) => ({ value: b.id, label: b.box_code }))}
                  value={selectedBox?.id || null}
                  onValueChange={(val) => {
                    const box = availableBoxes.find((b) => b.id === val);
                    setSelectedBox(box || null);
                  }}
                  placeholder={loadingBoxes ? "Loading..." : "Select a box..."}
                  searchPlaceholder="Search boxes..."
                  emptyText="No boxes available"
                  loading={loadingBoxes}
                  allowClear={false}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignToBox} disabled={!selectedBox || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign {totalSelected} Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Extra Dialog */}
      <MoveToExtraDialog
        open={moveToExtraDialogOpen}
        onOpenChange={setMoveToExtraDialogOpen}
        orderId={id!}
        phase="in_finishing"
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
        filterState="ready_for_finishing"
        alreadySelectedIds={Array.from(selectedBoxes)}
      />
    </div>
  );
}
