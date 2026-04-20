import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { generateProductionOrderPDF, type ProductionOrderItem } from "@/lib/productionFormsPdf";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function ProductionOrderDialog({ open, onOpenChange }: Props) {
  const [orders, setOrders] = useState<SearchableSelectOption[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrderId(null);
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, customers(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      setOrders((data || []).map((o: any) => ({
        value: o.id,
        label: `${o.order_number} — ${o.customers?.name || "—"}`,
      })));
    })();
  }, [open]);

  const handleGenerate = async () => {
    if (!orderId) { toast.error("Pick an order"); return; }
    setLoading(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .select("order_number, created_at, estimated_fulfillment_time, customers(name), order_items(quantity, size, is_special, products(name_en, sku))")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      const items: ProductionOrderItem[] = (order.order_items || []).map((it: any) => ({
        productName: it.products?.name_en || it.products?.sku || "Unknown",
        quantity: it.quantity,
        unit: "pcs",
        remarks: [it.size, it.is_special ? "Special" : ""].filter(Boolean).join(" • "),
      }));
      generateProductionOrderPDF({
        orderNumber: order.order_number,
        customer: (order as any).customers?.name || "—",
        issueDate: order.created_at as string,
        deliveryDate: order.estimated_fulfillment_time,
        items,
      });
      logAudit({ action: "report.generated", entity_type: "report", entity_id: "02_production_order", module: "reports", order_id: orderId, metadata: { order_number: order.order_number } });
      toast.success("Production Order generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Production Order Form</DialogTitle>
          <DialogDescription>Pick an order to generate its production order PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Order</Label>
          <SearchableSelect options={orders} value={orderId} onValueChange={setOrderId} placeholder="Select order..." searchPlaceholder="Search by order number or customer..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading || !orderId}>{loading ? "Generating..." : "Generate PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
