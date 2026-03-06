import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft,
  Factory,
  Box,
  Loader2,
  AlertTriangle,
  RotateCcw,
  XCircle,
  Search,
  CheckCircle,
  Package,
} from "lucide-react";
import { ProductionRateSection } from "@/components/ProductionRateSection";
import { RetrievedFromExtraSection } from "@/components/RetrievedFromExtraSection";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ExtraItemsTab } from "@/components/ExtraItemsTab";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MoveToExtraDialog } from "@/components/MoveToExtraDialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { normalizeBoxCode } from "@/lib/boxUtils";

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
  is_flagged?: boolean;
  is_redo?: boolean;
  manufacturing_machine_id?: string | null;
  from_extra_state?: string | null;
  product: {
    id: string;
    name: string;
    sku: string;
    needs_packing: boolean;
  };
  order_item?: {
    needs_boxing: boolean;
  };
}

interface Order {
  id: string;
  order_number: string;
  priority: string;
  status: string;
  customer?: { name: string };
}

interface ProductGroup {
  groupKey: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  needs_packing: boolean;
  needs_boxing: boolean;
  inManufacturing: number;
  batches: Batch[];
  order_item_ids: string[];
}

export default function OrderManufacturing() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { hasRole, user } = useAuth();
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
    Array<{ id: string; product_id: string; product_name: string; product_sku: string; quantity: number; manufacturing_machine_id: string | null }>
  >([]);
  
  const [loading, setLoading] = useState(true);

  // Selection & action states
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());

  // Dialog states
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [terminateDialogOpen, setTerminateDialogOpen] = useState(false);
  const [redoDialogOpen, setRedoDialogOpen] = useState(false);
  const [moveToExtraDialogOpen, setMoveToExtraDialogOpen] = useState(false);
  const [terminateReason, setTerminateReason] = useState("");
  const [redoReason, setRedoReason] = useState("");

  // Box selection
  const [boxSearchCode, setBoxSearchCode] = useState("");
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Machine selection state
  const [machines, setMachines] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [loadingMachines, setLoadingMachines] = useState(false);

  const canManage = hasRole("manufacturing_manager") || hasRole("admin");
  const isCancelled = order?.status === 'cancelled';

  // Compute processed batches for Production Rate by subtracting retrieved quantities
  const processedBatchesForRate = useMemo(() => {
    if (retrievedFromExtraBatches.length === 0) return completedBatches;
    const retrievedByGroup = new Map<string, number>();
    retrievedFromExtraBatches.forEach(rb => {
      const key = rb.order_item_id || rb.product_id;
      retrievedByGroup.set(key, (retrievedByGroup.get(key) || 0) + rb.quantity);
    });
    const remaining = new Map(retrievedByGroup);
    const adjusted: Batch[] = [];
    for (const batch of completedBatches) {
      const key = batch.order_item_id || batch.product_id;
      const toSubtract = remaining.get(key) || 0;
      if (toSubtract >= batch.quantity) {
        remaining.set(key, toSubtract - batch.quantity);
        continue;
      }
      if (toSubtract > 0) {
        adjusted.push({ ...batch, quantity: batch.quantity - toSubtract } as Batch);
        remaining.set(key, 0);
      } else {
        adjusted.push(batch);
      }
    }
    return adjusted;
  }, [completedBatches, retrievedFromExtraBatches]);

  useEffect(() => {
    fetchData();
    fetchAddedToExtra();
    fetchRetrievedFromExtra();
    const channel = supabase
      .channel(`order-manufacturing-${id}`)
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
            "id, qr_code_data, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, is_flagged, is_redo, manufacturing_machine_id, from_extra_state, product:products(id, name, sku, needs_packing), order_item:order_items(needs_boxing)",
          )
          .eq("order_id", id)
          .eq("is_terminated", false)
          .in("current_state", ["in_manufacturing"]),
        // Fetch completed items for this phase (moved to next phases)
        supabase
          .from("order_batches")
          .select(
            "id, qr_code_data, current_state, quantity, product_id, order_item_id, eta, lead_time_days, box_id, is_flagged, is_redo, manufacturing_machine_id, from_extra_state, product:products(id, name, sku, needs_packing), order_item:order_items(needs_boxing)",
          )
          .eq("order_id", id)
          .eq("is_terminated", false)
          .in("current_state", [
            "ready_for_finishing",
            "in_finishing",
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

      setOrder(orderRes.data as Order);
      setBatches((batchesRes.data || []) as unknown as Batch[]);
      const allCompleted = (completedRes.data || []) as any[];
      const filteredCompleted = allCompleted.filter(
        (b: any) => !['extra_finishing', 'extra_packaging', 'extra_boxing'].includes(b.from_extra_state)
      );
      setCompletedBatches(filteredCompleted as unknown as Batch[]);
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
        .eq("from_state", "in_manufacturing");

      if (error) throw error;

      // Group by product for display
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

      // Build production rate data from history quantities (not current extra_batch quantities)
      // Group history records by extra_batch_id and sum their quantities
      const historyByBatch = new Map<string, number>();
      (data || []).forEach((record: any) => {
        if (record.extra_batch_id) {
          historyByBatch.set(record.extra_batch_id, (historyByBatch.get(record.extra_batch_id) || 0) + record.quantity);
        }
      });

      if (extraBatchIds.size > 0) {
        // Still fetch extra_batches for machine IDs only
        const { data: extraBatches } = await supabase
          .from("extra_batches")
          .select("id, product_id, manufacturing_machine_id, product:products(name, sku)")
          .in("id", Array.from(extraBatchIds));
        setExtraBatchesForRate(
          (extraBatches || []).map((eb: any) => ({
            id: eb.id,
            product_id: eb.product_id,
            product_name: eb.product?.name || "Unknown",
            product_sku: eb.product?.sku || "N/A",
            quantity: historyByBatch.get(eb.id) || 0,
            manufacturing_machine_id: eb.manufacturing_machine_id,
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
        .eq('from_state', 'extra_manufacturing');

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
        .not("box_id", "is", null)
        .eq("is_terminated", false);
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
        .eq("type", "manufacturing")
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
        .eq("is_terminated", false)
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

  // Group batches by product_id + needs_boxing to combine same product items with same boxing requirements
  const productGroups: ProductGroup[] = [];
  const groupMap = new Map<string, ProductGroup>();

  batches.forEach((batch) => {
    const needsBoxing = batch.order_item?.needs_boxing ?? true;
    const groupKey = `${batch.product_id}-${needsBoxing ? "boxing" : "no-boxing"}`;

    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        groupKey,
        product_id: batch.product_id,
        product_name: batch.product?.name || "Unknown",
        product_sku: batch.product?.sku || "N/A",
        needs_packing: batch.product?.needs_packing ?? true,
        needs_boxing: needsBoxing,
        inManufacturing: 0,
        batches: [],
        order_item_ids: [],
      });
    }
    const group = groupMap.get(groupKey)!;
    group.batches.push(batch);
    group.inManufacturing += batch.quantity;
    if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
      group.order_item_ids.push(batch.order_item_id);
    }
  });

  groupMap.forEach((g) => productGroups.push(g));
  // Sort by product name for consistent ordering
  productGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));

  // Group completed items by product + needs_boxing
  const completedGroups: ProductGroup[] = [];
  const completedGroupMap = new Map<string, ProductGroup>();
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
        inManufacturing: 0,
        batches: [],
        order_item_ids: [],
      });
    }
    const group = completedGroupMap.get(groupKey)!;
    group.batches.push(batch);
    group.inManufacturing += batch.quantity; // reusing field for total
    if (batch.order_item_id && !group.order_item_ids.includes(batch.order_item_id)) {
      group.order_item_ids.push(batch.order_item_id);
    }
  });
  completedGroupMap.forEach((g) => completedGroups.push(g));
  completedGroups.sort((a, b) => a.product_name.localeCompare(b.product_name));

  const totalAddedToExtra = addedToExtraItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalCompleted = completedGroups.reduce((sum, g) => g.batches.reduce((s, b) => s + b.quantity, 0) + sum, 0) + totalAddedToExtra;
  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);

  // Calculate how many selected items are from "in_manufacturing" state (eligible for move to extra)
  const totalSelectedInManufacturing = Array.from(productSelections.entries()).reduce((sum, [groupKey, qty]) => {
    const group = productGroups.find((g) => g.groupKey === groupKey);
    if (!group) return sum;
    return sum + Math.min(qty, group.inManufacturing);
  }, 0);

  // Prepare selections for MoveToExtraDialog
  const extraSelections = productGroups
    .filter((g) => productSelections.get(g.groupKey) && productSelections.get(g.groupKey)! > 0)
    .map((g) => {
      const selectedQty = productSelections.get(g.groupKey) || 0;
      // Only include batches that are in_manufacturing and calculate how much to take from them
      const inMfgBatches = g.batches.filter((b) => b.current_state === "in_manufacturing");
      const qtyFromInMfg = Math.min(selectedQty, g.inManufacturing);
      return {
        groupKey: g.groupKey,
        product_id: g.product_id,
        product_name: g.product_name,
        product_sku: g.product_sku,
        quantity: qtyFromInMfg,
        order_item_ids: g.order_item_ids,
        batches: inMfgBatches.map((b) => ({
          id: b.id,
          quantity: b.quantity,
          current_state: b.current_state,
          order_item_id: b.order_item_id,
        })),
      };
    })
    .filter((s) => s.quantity > 0);

  const handleOpenBoxDialog = () => {
    if (totalSelected === 0) {
      toast.error("Please select items first");
      return;
    }
    setSelectedBox(null);
    setBoxSearchCode("");
    setSelectedMachine(null);
    fetchEmptyBoxes();
    fetchMachines();
    setBoxDialogOpen(true);
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
        order_item_id: string;
        needs_boxing: boolean;
        quantity: number;
        batch_id: string;
        batch_type: string;
      }> = [];

      // Process each order item selection (using order_item_id as key)
      for (const [groupKey, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;

        const group = productGroups.find((g) => g.groupKey === groupKey);
        if (!group) continue;

        let remainingQty = quantity;

        // Sort batches by quantity
        const sortedBatches = [...group.batches].sort((a, b) => a.quantity - b.quantity);

        for (const batch of sortedBatches) {
          if (remainingQty <= 0) break;

          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          if (useQty === batch.quantity) {
            // Update entire batch - no ETA here, set when receiving
            await supabase
              .from("order_batches")
              .update({
                current_state: "ready_for_finishing",
                box_id: selectedBox.id,
                manufacturing_machine_id: machineId || batch.manufacturing_machine_id,
              })
              .eq("id", batch.id);

            // Add to items list
            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              order_item_id: batch.order_item_id || "",
              needs_boxing: group.needs_boxing,
              quantity: useQty,
              batch_id: batch.id,
              batch_type: "ORDER",
            });
          } else {
            // Split batch
            const { data: qrCode } = await supabase.rpc("generate_extra_batch_code");

            // Create new batch with selected quantity - no ETA here
            // Inherit manufacturing_machine_id from parent batch or use selected
            const { data: newBatch } = await supabase
              .from("order_batches")
              .insert({
                qr_code_data: qrCode,
                order_id: id,
                product_id: batch.product_id,
                order_item_id: batch.order_item_id,
                current_state: "ready_for_finishing",
                quantity: useQty,
                box_id: selectedBox.id,
                created_by: user?.id,
                manufacturing_machine_id: machineId || batch.manufacturing_machine_id,
                from_extra_state: batch.from_extra_state,
              })
              .select("id")
              .single();

            // Reduce original batch
            await supabase
              .from("order_batches")
              .update({
                quantity: batch.quantity - useQty,
              })
              .eq("id", batch.id);

            // Add to items list
            newItems.push({
              product_id: group.product_id,
              product_name: group.product_name,
              product_sku: group.product_sku,
              order_item_id: batch.order_item_id || "",
              needs_boxing: group.needs_boxing,
              quantity: useQty,
              batch_id: newBatch?.id || batch.id,
              batch_type: "ORDER",
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
      setBoxDialogOpen(false);
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTerminate = async () => {
    if (totalSelected === 0 || !terminateReason.trim()) return;
    setSubmitting(true);

    try {
      for (const [groupKey, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;

        const group = productGroups.find((g) => g.groupKey === groupKey);
        if (!group) continue;

        let remainingQty = quantity;
        const batchesToTerminate = group.batches;

        for (const batch of batchesToTerminate) {
          if (remainingQty <= 0) break;

          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          if (useQty === batch.quantity) {
            await supabase
              .from("order_batches")
              .update({
                is_terminated: true,
                terminated_by: user?.id,
                terminated_reason: terminateReason.trim(),
              })
              .eq("id", batch.id);
          } else {
            // Create terminated batch
            const { data: qrCode } = await supabase.rpc("generate_extra_batch_code");
            await supabase.from("order_batches").insert({
              qr_code_data: qrCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: batch.current_state,
              quantity: useQty,
              is_terminated: true,
              terminated_by: user?.id,
              terminated_reason: terminateReason.trim(),
              created_by: user?.id,
            });

            await supabase
              .from("order_batches")
              .update({
                quantity: batch.quantity - useQty,
              })
              .eq("id", batch.id);
          }
        }
      }

      // Update order termination counter
      const { data: orderData } = await supabase.from("orders").select("termination_counter").eq("id", id).single();
      await supabase
        .from("orders")
        .update({
          termination_counter: (orderData?.termination_counter || 0) + totalSelected,
        })
        .eq("id", id);

      toast.success(`Terminated ${totalSelected} items`);
      setTerminateDialogOpen(false);
      setTerminateReason("");
      setProductSelections(new Map());
      fetchData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleMarkRedo = async () => {
    if (totalSelected === 0 || !redoReason.trim()) return;
    setSubmitting(true);

    try {
      for (const [groupKey, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;

        const group = productGroups.find((g) => g.groupKey === groupKey);
        if (!group) continue;

        let remainingQty = quantity;
        const pendingBatches = group.batches.filter((b) => b.current_state === "pending_rm");

        for (const batch of pendingBatches) {
          if (remainingQty <= 0) break;

          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          if (useQty === batch.quantity) {
            await supabase
              .from("order_batches")
              .update({
                is_redo: true,
                is_flagged: true,
                redo_by: user?.id,
                redo_reason: redoReason.trim(),
                flagged_by: user?.id,
                flagged_reason: redoReason.trim(),
              })
              .eq("id", batch.id);
          } else {
            // Create redo batch
            const { data: qrCode } = await supabase.rpc("generate_extra_batch_code");
            await supabase.from("order_batches").insert({
              qr_code_data: qrCode,
              order_id: id,
              product_id: batch.product_id,
              order_item_id: batch.order_item_id,
              current_state: "pending_rm",
              quantity: useQty,
              is_redo: true,
              is_flagged: true,
              redo_by: user?.id,
              redo_reason: redoReason.trim(),
              flagged_by: user?.id,
              flagged_reason: redoReason.trim(),
              created_by: user?.id,
            });

            await supabase
              .from("order_batches")
              .update({
                quantity: batch.quantity - useQty,
              })
              .eq("id", batch.id);
          }
        }
      }

      // Update order redo counter
      const { data: orderData } = await supabase.from("orders").select("redo_counter").eq("id", id).single();
      await supabase
        .from("orders")
        .update({
          redo_counter: (orderData?.redo_counter || 0) + totalSelected,
        })
        .eq("id", id);

      toast.success(`Marked ${totalSelected} items for redo`);
      setRedoDialogOpen(false);
      setRedoReason("");
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
          Back
        </Button>
        <p className="text-center text-muted-foreground mt-8">Order not found</p>
      </div>
    );
  }

  const totalInManufacturing = productGroups.reduce((sum, g) => sum + g.inManufacturing, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/queues/manufacturing")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Factory className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Manufacturing</h1>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">In Manufacturing</p>
            <p className="text-2xl font-bold text-primary">{totalInManufacturing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Products</p>
            <p className="text-2xl font-bold">{productGroups.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold">{totalInManufacturing}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold text-green-600">{totalCompleted}</p>
          </CardContent>
        </Card>
      </div>

      {isCancelled && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="p-4 flex items-center gap-2 text-destructive font-medium">
            <Badge variant="destructive">Cancelled</Badge>
            This order has been cancelled. Actions are frozen except machine assignment.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="active" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full max-w-xl">
          <TabsTrigger value="active">Active ({totalInManufacturing})</TabsTrigger>
          <TabsTrigger value="extra">Extra</TabsTrigger>
          <TabsTrigger value="completed">Completed ({totalCompleted})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4">
          {/* Action Buttons */}
          {canManage && !isCancelled && (
            <Card>
              <CardContent className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 text-sm text-muted-foreground">
                  {totalSelected > 0
                    ? `${totalSelected} selected${totalSelectedInManufacturing > 0 ? ` (${totalSelectedInManufacturing} in manufacturing)` : ""}`
                    : "Select quantities below, then choose an action"}
                </div>
                <Button onClick={handleOpenBoxDialog} disabled={totalSelected === 0}>
                  <Box className="h-4 w-4 mr-2" />
                  Assign to Box
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setMoveToExtraDialogOpen(true)}
                  disabled={totalSelectedInManufacturing === 0}
                  title="Move selected items from 'In Manufacturing' to Extra Inventory"
                >
                  <Package className="h-4 w-4 mr-2" />
                  Assign to Extra
                </Button>
                <Button variant="outline" onClick={() => setRedoDialogOpen(true)} disabled={totalSelected === 0}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Mark Redo
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setTerminateDialogOpen(true)}
                  disabled={totalSelected === 0}
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Terminate
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Products List */}
          <div className="space-y-4">
            {productGroups.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  No items in manufacturing phase for this order
                </CardContent>
              </Card>
            ) : (
              productGroups.map((group) => (
                <Card key={group.groupKey}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
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
                        <p className="text-sm text-muted-foreground">
                          {group.product_sku} · {group.needs_packing ? "Needs Packing" : "No Packing"}
                        </p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-center">
                          <p className="text-xs text-muted-foreground">In Mfg</p>
                          <p className="text-lg font-semibold text-primary">{group.inManufacturing}</p>
                        </div>
                        {canManage && !isCancelled && (
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Select</Label>
                            <Input
                              type="number"
                              min={0}
                              max={group.inManufacturing}
                              value={productSelections.get(group.groupKey) || 0}
                              onChange={(e) => {
                                const val = Math.min(
                                  Math.max(0, parseInt(e.target.value) || 0),
                                  group.inManufacturing,
                                );
                                setProductSelections((prev) => new Map(prev).set(group.groupKey, val));
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
          <ExtraItemsTab orderId={id!} phase="manufacturing" onRefresh={() => fetchData()} canManage={canManage && !isCancelled} />

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
              ...processedBatchesForRate.map((batch) => ({
                id: batch.id,
                product_id: batch.product_id,
                product_name: batch.product?.name || "Unknown",
                product_sku: batch.product?.sku || "N/A",
                quantity: batch.quantity,
                machine_id: batch.manufacturing_machine_id || null,
                needs_boxing: batch.order_item?.needs_boxing ?? true,
                order_item_id: batch.order_item_id || null,
              })),
              ...extraBatchesForRate.map((eb) => ({
                id: eb.id,
                product_id: eb.product_id,
                product_name: eb.product_name,
                product_sku: eb.product_sku,
                quantity: eb.quantity,
                machine_id: eb.manufacturing_machine_id,
                needs_boxing: true,
                order_item_id: null,
                isExtraBatch: true,
              })),
            ]}
            machineType="manufacturing"
            machineColumnName="manufacturing_machine_id"
            onAssigned={() => { fetchData(); fetchAddedToExtra(); }}
            canManage={canManage}
          />

          <RetrievedFromExtraSection
            batches={retrievedFromExtraBatches}
          />

          {completedGroups.length === 0 && retrievedFromExtraBatches.length === 0 && (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">No completed items yet</CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Box Assignment Dialog */}
      <Dialog open={boxDialogOpen} onOpenChange={setBoxDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to Box</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Machine Selection */}
            <div>
              <Label>Manufacturing Machine (Optional)</Label>
              <div className="mt-2">
                <SearchableSelect
                  options={machines.map((m) => ({ value: m.id, label: m.name }))}
                  value={selectedMachine}
                  onValueChange={setSelectedMachine}
                  placeholder="Select a machine..."
                  searchPlaceholder="Search machines..."
                  emptyText="No manufacturing machines found"
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
            <Button variant="outline" onClick={() => setBoxDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignToBox} disabled={!selectedBox || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign {totalSelected} Items
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Terminate Dialog */}
      <Dialog open={terminateDialogOpen} onOpenChange={setTerminateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Terminate Items</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>Terminating {totalSelected} item(s). This action cannot be undone.</AlertDescription>
            </Alert>
            <div>
              <Label>Reason for Termination</Label>
              <Textarea
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                placeholder="Enter reason..."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTerminateDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleTerminate} disabled={!terminateReason.trim() || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Terminate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Redo Dialog */}
      <Dialog open={redoDialogOpen} onOpenChange={setRedoDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Items for Redo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Marking {totalSelected} item(s) for redo. They will be flagged and reset to pending raw materials.
            </p>
            <div>
              <Label>Reason for Redo</Label>
              <Textarea
                value={redoReason}
                onChange={(e) => setRedoReason(e.target.value)}
                placeholder="Enter reason..."
                className="mt-2"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRedoDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkRedo} disabled={!redoReason.trim() || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Mark Redo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move to Extra Dialog */}
      <MoveToExtraDialog
        open={moveToExtraDialogOpen}
        onOpenChange={setMoveToExtraDialogOpen}
        orderId={id!}
        phase="in_manufacturing"
        selections={extraSelections}
        totalQuantity={totalSelectedInManufacturing}
        onSuccess={() => {
          setProductSelections(new Map());
          fetchData();
        }}
        userId={user?.id}
      />
    </div>
  );
}
