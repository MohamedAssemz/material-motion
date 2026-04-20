import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { generateReleaseOrderPDF, type ReleaseOrderRow } from "@/lib/productionFormsPdf";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function ReleaseOrderDialog({ open, onOpenChange }: Props) {
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
      setOrders((data || []).map((o: any) => ({ value: o.id, label: `${o.order_number} — ${o.customers?.name || "—"}` })));
    })();
  }, [open]);

  const handleGenerate = async () => {
    if (!orderId) { toast.error("Pick an order"); return; }
    setLoading(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .select("order_number, created_at, customers(name)")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      const { data: batches } = await supabase
        .from("order_batches")
        .select("quantity, qr_code_data, current_state, products(name_en, sku)")
        .eq("order_id", orderId);
      const rows: ReleaseOrderRow[] = (batches || []).map((b: any) => ({
        description: b.products?.name_en || b.products?.sku || "—",
        unit: "pcs",
        quantity: b.quantity,
        lot: b.qr_code_data || "—",
        notes: (b.current_state || "").replace(/_/g, " "),
      }));
      generateReleaseOrderPDF({
        reference: order.order_number,
        customer: (order as any).customers?.name || "—",
        date: new Date().toISOString(),
        rows,
      });
      logAudit({ action: "report.generated", entity_type: "report", entity_id: "07_release_order", module: "reports", order_id: orderId, metadata: { order_number: order.order_number, rows: rows.length } });
      toast.success("Release Order generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Release Order Form</DialogTitle>
          <DialogDescription>Pick an order to generate the release form PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Order</Label>
          <SearchableSelect options={orders} value={orderId} onValueChange={setOrderId} placeholder="Select order..." searchPlaceholder="Search ORD-XXXXX..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading || !orderId}>{loading ? "Generating..." : "Generate PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
