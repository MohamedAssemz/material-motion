import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Box, Loader2, Search, Printer, ArrowRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateExtraBoxItemsList } from "@/lib/extraInventoryOperations";
import { normalizeBoxCode } from "@/lib/boxUtils";

interface ExtraBatch {
  id: string;
  qr_code_data: string | null;
  product_id: string;
  quantity: number;
  current_state: string;
  box_id: string | null;
  order_item_id: string | null;
  is_special?: boolean;
  product: {
    id: string;
    name: string;
    sku: string;
  };
  box?: {
    id: string;
    box_code: string;
  } | null;
}

interface ProductGroup {
  product_id: string;
  product_name: string;
  product_sku: string;
  source_box_code: string;
  quantity: number;
  batches: ExtraBatch[];
}

interface ExtraItemsTabProps {
  orderId: string;
  phase: "manufacturing" | "finishing" | "packaging" | "boxing";
  onRefresh?: () => void;
  canManage?: boolean;
  onCountChange?: (count: number) => void;
}

// Map phase to the current_state for extra items assigned to this order
// Extra batches in state X are usable when order is in phase X
const PHASE_CURRENT_STATE_MAP: Record<string, string> = {
  manufacturing: "extra_manufacturing",
  finishing: "extra_finishing",
  packaging: "extra_packaging",
  boxing: "extra_boxing",
};

const PHASE_NEXT_STATE_MAP: Record<string, string> = {
  manufacturing: "extra_finishing",
  finishing: "extra_packaging",
  packaging: "extra_boxing",
  boxing: "extra_boxing",
};

// Map phase to the "in" state of the next phase for direct moves (skipping box + receive)
const PHASE_DIRECT_MOVE_STATE: Record<string, string> = {
  manufacturing: "in_finishing",
  finishing: "in_packaging",
  packaging: "in_boxing",
};

const PHASE_LABELS: Record<string, string> = {
  manufacturing: "Extra Manufacturing",
  finishing: "Extra Finishing",
  packaging: "Extra Packaging",
  boxing: "Extra Boxing",
};

export function ExtraItemsTab({ orderId, phase, onRefresh, canManage = true, onCountChange }: ExtraItemsTabProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [extraBatches, setExtraBatches] = useState<ExtraBatch[]>([]);
  const [retrievedCounts, setRetrievedCounts] = useState<Map<string, number>>(new Map());
  const [productSelections, setProductSelections] = useState<Map<string, number>>(new Map());

  // Box assignment dialog
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [boxSearchCode, setBoxSearchCode] = useState("");
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loadingBoxes, setLoadingBoxes] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [moveDirectlyConfirmOpen, setMoveDirectlyConfirmOpen] = useState(false);

  useEffect(() => {
    fetchExtraBatches();
    fetchRetrievedCounts();

    const channel = supabase
      .channel(`extra-batches-${orderId}-${phase}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "extra_batches",
          filter: `order_id=eq.${orderId}`,
        },
        () => {
          fetchExtraBatches();
          fetchRetrievedCounts();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orderId, phase]);

  const fetchRetrievedCounts = async () => {
    try {
      const targetState = PHASE_CURRENT_STATE_MAP[phase];
      const { data, error } = await supabase
        .from("extra_batch_history")
        .select("product_id, quantity")
        .eq("event_type", "CONSUMED")
        .eq("consuming_order_id", orderId)
        .eq("from_state", targetState);

      if (error) throw error;

      const counts = new Map<string, number>();
      data?.forEach((row) => {
        if (row.product_id) {
          counts.set(row.product_id, (counts.get(row.product_id) || 0) + row.quantity);
        }
      });
      setRetrievedCounts(counts);
    } catch (error: any) {
      console.error("Error fetching retrieved counts:", error);
    }
  };

  const fetchExtraBatches = async () => {
    setLoading(true);
    try {
      const targetState = PHASE_CURRENT_STATE_MAP[phase];

      const { data, error } = await supabase
        .from("extra_batches")
        .select(
          `
          id, qr_code_data, product_id, quantity, current_state, box_id, order_item_id, is_special,
          product:products(id, name_en, sku)
        `,
        )
        .eq("order_id", orderId)
        .eq("current_state", targetState);

      if (error) throw error;

      // Fetch box info from extra_boxes
      const boxIds = data?.filter((b) => b.box_id).map((b) => b.box_id) || [];
      let boxMap = new Map<string, { id: string; box_code: string }>();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase
          .from("extra_boxes")
          .select("id, box_code")
          .in("id", [...new Set(boxIds)]);
        boxesData?.forEach((box) => boxMap.set(box.id, box));
      }

      const batchesWithBox: ExtraBatch[] = (data || []).map((batch) => ({
        id: batch.id,
        qr_code_data: batch.qr_code_data,
        product_id: batch.product_id,
        quantity: batch.quantity,
        current_state: batch.current_state,
        box_id: batch.box_id,
        order_item_id: batch.order_item_id,
        is_special: (batch as any).is_special || false,
        product: { id: (batch.product as any)?.id, name: (batch.product as any)?.name_en, sku: (batch.product as any)?.sku } as ExtraBatch["product"],
        box: batch.box_id ? boxMap.get(batch.box_id) : null,
      }));

      setExtraBatches(batchesWithBox);

      // Report count to parent
      const totalCount = batchesWithBox.reduce((sum, b) => sum + b.quantity, 0);
      onCountChange?.(totalCount);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmptyBoxes = async () => {
    setLoadingBoxes(true);
    try {
      // Fetch ORDER boxes (not extra_boxes) for assigning extra items during order processing
      const { data: allBoxes } = await supabase
        .from("boxes")
        .select("id, box_code")
        .eq("is_active", true)
        .order("box_code");

      // Check which boxes already have order batches assigned
      const { data: occupiedBatches } = await supabase.from("order_batches").select("box_id").not("box_id", "is", null);

      const occupiedIds = new Set(occupiedBatches?.map((b) => b.box_id) || []);
      setAvailableBoxes(allBoxes?.filter((box) => !occupiedIds.has(box.id)) || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoadingBoxes(false);
    }
  };

  const searchBox = async () => {
    if (!boxSearchCode.trim()) return;
    const normalizedCode = normalizeBoxCode(boxSearchCode);
    try {
      // Search in ORDER boxes (not extra_boxes)
      const { data: box } = await supabase
        .from("boxes")
        .select("id, box_code")
        .eq("box_code", normalizedCode)
        .eq("is_active", true)
        .single();

      if (!box) {
        toast.error(`Box ${boxSearchCode} not found`);
        return;
      }

      // Check if box is occupied by any order_batches
      const { data: existingBatch } = await supabase
        .from("order_batches")
        .select("id")
        .eq("box_id", box.id)
        .maybeSingle();

      if (existingBatch) {
        toast.error(`Box ${box.box_code} is already occupied`);
        return;
      }

      setSelectedBox(box);
      setBoxSearchCode("");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Group batches by product
  const productGroups: ProductGroup[] = [];
  const groupMap = new Map<string, ProductGroup>();

  extraBatches.forEach((batch) => {
    const key = batch.product_id;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        product_id: batch.product_id,
        product_name: batch.product?.name || "Unknown",
        product_sku: batch.product?.sku || "N/A",
        source_box_code: batch.box?.box_code || "No Box",
        quantity: 0,
        batches: [],
      });
    }
    const group = groupMap.get(key)!;
    group.batches.push(batch);
    group.quantity += batch.quantity;
  });
  groupMap.forEach((g) => productGroups.push(g));

  const totalSelected = Array.from(productSelections.values()).reduce((a, b) => a + b, 0);
  const totalItems = extraBatches.reduce((sum, b) => sum + b.quantity, 0);

  const handleOpenBoxDialog = () => {
    if (totalSelected === 0) {
      toast.error("Please select items first");
      return;
    }
    // Enforce single product per box
    const selectedProductIds = new Set(
      Array.from(productSelections.entries())
        .filter(([_, qty]) => qty > 0)
        .map(([key]) => productGroups.find(g => g.product_id === key)?.product_id)
        .filter(Boolean)
    );
    if (selectedProductIds.size > 1) {
      toast.error("A box can only contain one product. Please select items from a single product.");
      return;
    }
    // For boxing phase, skip box dialog and move directly
    if (phase === "boxing") {
      handleMoveToReady();
      return;
    }
    setSelectedBox(null);
    setBoxSearchCode("");
    fetchEmptyBoxes();
    setBoxDialogOpen(true);
  };

  // Direct move to ready_for_shipment for boxing phase (no box needed)
  const handleMoveToReady = async () => {
    if (totalSelected === 0) return;
    setSubmitting(true);

    try {
      // Collect all operations to perform
      const operations: Array<{
        batch: ExtraBatch;
        useQty: number;
      }> = [];

      // First pass: determine which batches to process and how much from each
      for (const [productId, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;

        const group = productGroups.find((g) => g.product_id === productId);
        if (!group) continue;

        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;

          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          operations.push({ batch, useQty });
        }
      }

      // Second pass: execute all operations
      for (const { batch, useQty } of operations) {
        // Create an order_batch in ready_for_shipment state (no box_id needed)
        const { data: batchCode } = await supabase.rpc("generate_extra_batch_code");
        const { error: insertError } = await supabase.from("order_batches").insert({
          qr_code_data: batchCode || `OB-${Date.now()}`,
          order_id: orderId,
          order_item_id: batch.order_item_id,
          product_id: batch.product_id,
          current_state: "ready_for_shipment",
          quantity: useQty,
          box_id: null,
          created_by: user?.id,
          from_extra_state: batch.current_state,
          is_special: batch.is_special || false,
        });

        if (insertError) throw insertError;

        // Log CONSUMED event in extra_batch_history
        await supabase.from("extra_batch_history").insert({
          extra_batch_id: batch.id,
          event_type: "CONSUMED",
          quantity: useQty,
          from_state: batch.current_state,
          consuming_order_id: orderId,
          consuming_order_item_id: batch.order_item_id,
          product_id: batch.product_id,
          performed_by: user?.id,
        });

        // Delete or reduce the extra_batch
        const extraBoxId = batch.box_id;
        if (useQty >= batch.quantity) {
          const { error: deleteError } = await supabase.from("extra_batches").delete().eq("id", batch.id);
          if (deleteError) throw deleteError;
        } else {
          const { error: updateError } = await supabase
            .from("extra_batches")
            .update({ quantity: batch.quantity - useQty })
            .eq("id", batch.id);
          if (updateError) throw updateError;
        }

        // Update the source EBox's items_list
        if (extraBoxId) {
          await updateExtraBoxItemsList(extraBoxId);
        }
      }

      toast.success(`Moved ${totalSelected} items to Ready for Shipment`);
      setProductSelections(new Map());
      fetchExtraBatches();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Direct move to the next phase's "in" state (no box, no receive step)
  const handleMoveDirectly = async () => {
    if (totalSelected === 0) return;
    const directState = PHASE_DIRECT_MOVE_STATE[phase];
    if (!directState) return;
    setSubmitting(true);

    try {
      const operations: Array<{ batch: ExtraBatch; useQty: number }> = [];

      for (const [productId, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;
        const group = productGroups.find((g) => g.product_id === productId);
        if (!group) continue;

        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;
          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;
          operations.push({ batch, useQty });
        }
      }

      for (const { batch, useQty } of operations) {
        // Special items go directly to ready_for_shipment (no box needed)
        const targetState = batch.is_special ? "ready_for_shipment" : directState;
        const { data: batchCode } = await supabase.rpc("generate_extra_batch_code");
        const { error: insertError } = await supabase.from("order_batches").insert({
          qr_code_data: batchCode || `OB-${Date.now()}`,
          order_id: orderId,
          order_item_id: batch.order_item_id,
          product_id: batch.product_id,
          current_state: targetState,
          quantity: useQty,
          box_id: null,
          created_by: user?.id,
          from_extra_state: batch.current_state,
          is_special: batch.is_special || false,
        });

        if (insertError) throw insertError;

        await supabase.from("extra_batch_history").insert({
          extra_batch_id: batch.id,
          event_type: "CONSUMED",
          quantity: useQty,
          from_state: batch.current_state,
          consuming_order_id: orderId,
          consuming_order_item_id: batch.order_item_id,
          product_id: batch.product_id,
          performed_by: user?.id,
        });

        const extraBoxId = batch.box_id;
        if (useQty >= batch.quantity) {
          const { error: deleteError } = await supabase.from("extra_batches").delete().eq("id", batch.id);
          if (deleteError) throw deleteError;
        } else {
          const { error: updateError } = await supabase
            .from("extra_batches")
            .update({ quantity: batch.quantity - useQty })
            .eq("id", batch.id);
          if (updateError) throw updateError;
        }

        if (extraBoxId) {
          await updateExtraBoxItemsList(extraBoxId);
        }
      }

      const stateLabel = directState.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      toast.success(`Moved ${totalSelected} items directly to ${stateLabel}`);
      setProductSelections(new Map());
      fetchExtraBatches();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignToBox = async () => {
    if (!selectedBox || totalSelected === 0) return;
    setSubmitting(true);

    try {
      // Get the next order_batch state based on the phase
      const PHASE_TO_ORDER_STATE: Record<string, string> = {
        manufacturing: "ready_for_finishing",
        finishing: "ready_for_packaging",
        packaging: "ready_for_boxing",
        boxing: "ready_for_shipment",
      };

      const nextOrderState = PHASE_TO_ORDER_STATE[phase];

      // Fetch current box items_list
      const { data: boxData } = await supabase.from("boxes").select("items_list").eq("id", selectedBox.id).single();

      const currentItems = Array.isArray(boxData?.items_list) ? boxData.items_list : [];
      const newItems: Array<{
        product_id: string;
        product_name: string;
        product_sku: string;
        quantity: number;
        batch_id: string;
      }> = [];

      // Collect all operations first
      const operations: Array<{
        batch: ExtraBatch;
        useQty: number;
        group: ProductGroup;
      }> = [];

      for (const [productId, quantity] of productSelections.entries()) {
        if (quantity <= 0) continue;

        const group = productGroups.find((g) => g.product_id === productId);
        if (!group) continue;

        let remainingQty = quantity;
        for (const batch of group.batches) {
          if (remainingQty <= 0) break;

          const useQty = Math.min(batch.quantity, remainingQty);
          remainingQty -= useQty;

          operations.push({ batch, useQty, group });
        }
      }

      // Execute all operations
      for (const { batch, useQty, group } of operations) {
        // Special items go to ready_for_boxing (will be received as ready_for_shipment in boxing)
        const batchNextState = batch.is_special ? "ready_for_boxing" : nextOrderState;
        // Create an order_batch from the extra batch
        const { data: batchCode } = await supabase.rpc("generate_extra_batch_code");
        const { data: newOrderBatch, error: insertError } = await supabase
          .from("order_batches")
          .insert({
            qr_code_data: batchCode || `OB-${Date.now()}`,
            order_id: orderId,
            order_item_id: batch.order_item_id,
            product_id: batch.product_id,
            current_state: batchNextState,
            quantity: useQty,
            box_id: selectedBox.id,
            created_by: user?.id,
            from_extra_state: batch.current_state,
            is_special: batch.is_special || false,
          })
          .select("id")
          .single();

        if (insertError) throw insertError;

        newItems.push({
          product_id: group.product_id,
          product_name: group.product_name,
          product_sku: group.product_sku,
          quantity: useQty,
          batch_id: newOrderBatch?.id || "",
        });

        // Log CONSUMED event in extra_batch_history
        await supabase.from("extra_batch_history").insert({
          extra_batch_id: batch.id,
          event_type: "CONSUMED",
          quantity: useQty,
          from_state: batch.current_state,
          consuming_order_id: orderId,
          consuming_order_item_id: batch.order_item_id,
          product_id: batch.product_id,
          performed_by: user?.id,
        });

        // Delete or reduce the extra_batch
        const extraBoxId = batch.box_id;
        if (useQty >= batch.quantity) {
          const { error: deleteError } = await supabase.from("extra_batches").delete().eq("id", batch.id);
          if (deleteError) throw deleteError;
        } else {
          const { error: updateError } = await supabase
            .from("extra_batches")
            .update({ quantity: batch.quantity - useQty })
            .eq("id", batch.id);
          if (updateError) throw updateError;
        }

        // Update the source EBox's items_list
        if (extraBoxId) {
          await updateExtraBoxItemsList(extraBoxId);
        }
      }

      // Update the order box's items_list
      const updatedItems = [...currentItems, ...newItems];
      await supabase
        .from("boxes")
        .update({
          items_list: updatedItems,
          content_type: "ORDER",
        })
        .eq("id", selectedBox.id);

      toast.success(`Assigned ${totalSelected} extra items to ${selectedBox.box_code}`);
      setBoxDialogOpen(false);
      setProductSelections(new Map());
      fetchExtraBatches();
      onRefresh?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrintGuide = () => {
    if (extraBatches.length === 0) {
      toast.error("No extra items to print");
      return;
    }

    // Group items by box for the guide
    const boxGroups = new Map<string, { box_code: string; items: Array<{ sku: string; name: string; qty: number }> }>();

    extraBatches.forEach((batch) => {
      const boxCode = batch.box?.box_code || "No Box";
      if (!boxGroups.has(boxCode)) {
        boxGroups.set(boxCode, { box_code: boxCode, items: [] });
      }
      const group = boxGroups.get(boxCode)!;
      const existing = group.items.find((i) => i.sku === batch.product?.sku);
      if (existing) {
        existing.qty += batch.quantity;
      } else {
        group.items.push({
          sku: batch.product?.sku || "N/A",
          name: batch.product?.name || "Unknown",
          qty: batch.quantity,
        });
      }
    });

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Could not open print window");
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${PHASE_LABELS[phase]} Guide</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          h1 { font-size: 24px; margin-bottom: 20px; }
          .box-section { margin-bottom: 24px; page-break-inside: avoid; }
          .box-header { background: #f3f4f6; padding: 10px; font-weight: bold; font-size: 18px; border-radius: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f9fafb; }
          .total { font-weight: bold; margin-top: 20px; padding: 10px; background: #f3f4f6; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>${PHASE_LABELS[phase]} - Picking Guide</h1>
        ${Array.from(boxGroups.values())
          .map(
            (group) => `
          <div class="box-section">
            <div class="box-header">📦 ${group.box_code}</div>
            <table>
              <thead>
                <tr><th>SKU</th><th>Product</th><th>Quantity</th></tr>
              </thead>
              <tbody>
                ${group.items
                  .map(
                    (item) => `
                  <tr><td>${item.sku}</td><td>${item.name}</td><td>${item.qty}</td></tr>
                `,
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        `,
          )
          .join("")}
        <div class="total">Total Items: ${totalItems}</div>
      </body>
      </html>
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
      <Card>
        <CardContent className="p-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <Badge variant="secondary" className="text-lg px-3 py-1">
              {totalItems} extra items
            </Badge>
            {totalSelected > 0 && (
              <Badge variant="default" className="px-3 py-1">
                {totalSelected} selected
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handlePrintGuide} disabled={extraBatches.length === 0}>
              <Printer className="h-4 w-4 mr-2" />
              Print Guide
            </Button>
            {canManage && phase !== "boxing" && (
              <Button
                variant="secondary"
                onClick={() => setMoveDirectlyConfirmOpen(true)}
                disabled={totalSelected === 0 || submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4 mr-2" />
                )}
                Move Directly
              </Button>
            )}
            {canManage && (
              <Button onClick={handleOpenBoxDialog} disabled={totalSelected === 0 || submitting}>
                {phase === "boxing" ? (
                  <>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ArrowRight className="h-4 w-4 mr-2" />
                    )}
                    Move to Ready
                  </>
                ) : (
                  <>
                    <Box className="h-4 w-4 mr-2" />
                    Assign to Box
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Extra Items List */}
      <div className="space-y-3">
        {productGroups.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">No extra items in this phase</CardContent>
          </Card>
        ) : (
          productGroups.map((group) => (
            <Card key={group.product_id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{group.product_name}</p>
                      <Badge
                        variant="outline"
                        className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                      >
                        EXTRA
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{group.product_sku}</p>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <Box className="h-3 w-3" />
                      <span>{group.source_box_code}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center min-w-0">
                        <p className="text-lg font-semibold truncate max-w-[60px]">{group.quantity}</p>
                        <p className="text-xs text-muted-foreground">available</p>
                      </div>
                      {(retrievedCounts.get(group.product_id) || 0) > 0 && (
                        <div className="flex flex-col items-center min-w-0">
                          <p className="text-lg font-semibold text-green-600 dark:text-green-400 truncate max-w-[60px]">
                            {retrievedCounts.get(group.product_id)}
                          </p>
                          <p className="text-xs text-green-600 dark:text-green-400">retrieved</p>
                        </div>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Select:</Label>
                        <NumericInput
                          min={0}
                          max={group.quantity}
                          value={productSelections.get(group.product_id) || undefined}
                          onValueChange={(val) => {
                            setProductSelections((prev) => {
                              const newMap = new Map(prev);
                              if (val && val > 0) {
                                newMap.set(group.product_id, val);
                              } else {
                                newMap.delete(group.product_id);
                              }
                              return newMap;
                            });
                          }}
                          className="w-20 h-8"
                          placeholder="0"
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

      {/* Box Assignment Dialog */}
      <Dialog open={boxDialogOpen} onOpenChange={setBoxDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign to Box</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Search Box */}
            <div className="flex gap-2">
              <Input
                placeholder="Box number (e.g., 42)"
                value={boxSearchCode}
                onChange={(e) => setBoxSearchCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && searchBox()}
              />
              <Button variant="outline" onClick={searchBox}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {/* Selected Box */}
            {selectedBox && (
              <div className="p-3 border rounded-lg bg-primary/5 border-primary">
                <p className="font-medium">Selected: {selectedBox.box_code}</p>
              </div>
            )}

            {/* Available Boxes */}
            {loadingBoxes ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Or select an available box:</Label>
                <Select
                  value={selectedBox?.id || ""}
                  onValueChange={(val) => {
                    const box = availableBoxes.find((b) => b.id === val);
                    if (box) setSelectedBox(box);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a box" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBoxes.map((box) => (
                      <SelectItem key={box.id} value={box.id}>
                        {box.box_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBoxDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignToBox} disabled={!selectedBox || submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Assign ({totalSelected})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Directly Confirmation */}
      <AlertDialog open={moveDirectlyConfirmOpen} onOpenChange={setMoveDirectlyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move Directly to Next Phase?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move {totalSelected} item(s) directly into the next phase without assigning them to a box or
              requiring a receive step. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setMoveDirectlyConfirmOpen(false);
                handleMoveDirectly();
              }}
            >
              Confirm Move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
