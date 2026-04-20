import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { generateDeliveryOrderPDF, type DeliveryOrderRow } from "@/lib/productionFormsPdf";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function DeliveryOrderDialog({ open, onOpenChange }: Props) {
  const [shipments, setShipments] = useState<SearchableSelectOption[]>([]);
  const [shipmentId, setShipmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setShipmentId(null);
    (async () => {
      const { data } = await supabase
        .from("shipments")
        .select("id, shipment_code, orders(order_number)")
        .order("created_at", { ascending: false })
        .limit(500);
      setShipments((data || []).map((s: any) => ({
        value: s.id,
        label: s.shipment_code,
        description: s.orders?.order_number || "",
      })));
    })();
  }, [open]);

  const handleGenerate = async () => {
    if (!shipmentId) { toast.error("Pick a shipment"); return; }
    setLoading(true);
    try {
      const { data: shipment, error } = await supabase
        .from("shipments")
        .select("shipment_code, created_at, order_id, orders(order_number, country, customers(name))")
        .eq("id", shipmentId)
        .single();
      if (error) throw error;
      const { data: batches } = await supabase
        .from("order_batches")
        .select("quantity, qr_code_data, products(name_en, sku)")
        .eq("shipment_id", shipmentId);
      const rows: DeliveryOrderRow[] = (batches || []).map((b: any) => ({
        description: b.products?.name_en || b.products?.sku || "—",
        lot: b.qr_code_data || "—",
        unit: "pcs",
        quantity: b.quantity,
      }));
      generateDeliveryOrderPDF({
        shipmentCode: shipment.shipment_code,
        orderNumber: (shipment as any).orders?.order_number || "—",
        customer: (shipment as any).orders?.customers?.name || "—",
        deliveryLocation: (shipment as any).orders?.country || "—",
        date: shipment.created_at as string,
        rows,
      });
      logAudit({ action: "report.generated", entity_type: "report", entity_id: "06_delivery_order", module: "reports", order_id: (shipment as any).order_id, metadata: { shipment_code: shipment.shipment_code } });
      toast.success("Delivery Order generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delivery Order</DialogTitle>
          <DialogDescription>Pick a shipment to generate the delivery order PDF.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Shipment</Label>
          <SearchableSelect options={shipments} value={shipmentId} onValueChange={setShipmentId} placeholder="Select shipment..." searchPlaceholder="Search SHP-XXXX..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading || !shipmentId}>{loading ? "Generating..." : "Generate PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
