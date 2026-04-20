import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { generateDeliveryOrderPDF, type DeliveryOrderRow } from "@/lib/productionFormsPdf";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

interface ShipmentRow {
  id: string;
  shipment_code: string;
  created_at: string;
}

function genDeliveryOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `DO-${ymd}-${rand}`;
}

export function DeliveryOrderDialog({ open, onOpenChange }: Props) {
  const [orders, setOrders] = useState<SearchableSelectOption[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [shipments, setShipments] = useState<ShipmentRow[]>([]);
  const [selectedShipmentIds, setSelectedShipmentIds] = useState<string[]>([]);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [deliveryOrderNumber, setDeliveryOrderNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [deliveryLocation, setDeliveryLocation] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrderId(null);
    setShipments([]);
    setSelectedShipmentIds([]);
    setInvoiceNumber("");
    setDeliveryOrderNumber(genDeliveryOrderNo());
    setVehicleNumber("");
    setDeliveryLocation("");
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, customers(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      setOrders((data || []).map((o: any) => ({
        value: o.id,
        label: o.order_number,
        description: o.customers?.name || "",
      })));
    })();
  }, [open]);

  // When order selected, load its shipments
  useEffect(() => {
    if (!orderId) { setShipments([]); setSelectedShipmentIds([]); return; }
    (async () => {
      const { data } = await supabase
        .from("shipments")
        .select("id, shipment_code, created_at")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      setShipments((data || []) as ShipmentRow[]);
      setSelectedShipmentIds([]);
    })();
  }, [orderId]);

  const toggleShipment = (id: string) => {
    setSelectedShipmentIds((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const allSelected = useMemo(() => shipments.length > 0 && selectedShipmentIds.length === shipments.length, [shipments, selectedShipmentIds]);
  const toggleAll = () => setSelectedShipmentIds(allSelected ? [] : shipments.map(s => s.id));

  const handleGenerate = async () => {
    if (!orderId) { toast.error("Pick an order"); return; }
    if (selectedShipmentIds.length === 0) { toast.error("Select at least one shipment"); return; }
    if (!invoiceNumber.trim()) { toast.error("Invoice number is required"); return; }
    if (!deliveryOrderNumber.trim()) { toast.error("Delivery order number is required"); return; }

    setLoading(true);
    try {
      const { data: order, error } = await supabase
        .from("orders")
        .select("order_number, country, customers(name)")
        .eq("id", orderId)
        .single();
      if (error) throw error;

      const { data: batches } = await supabase
        .from("order_batches")
        .select("quantity, qr_code_data, products(name_en, sku)")
        .in("shipment_id", selectedShipmentIds);

      const rows: DeliveryOrderRow[] = (batches || []).map((b: any) => ({
        description: b.products?.name_en || b.products?.sku || "—",
        lot: b.qr_code_data || "—",
        unit: "pcs",
        quantity: b.quantity,
      }));

      generateDeliveryOrderPDF({
        invoiceNumber: invoiceNumber.trim(),
        deliveryOrderNumber: deliveryOrderNumber.trim(),
        vehicleNumber: vehicleNumber.trim(),
        orderNumber: (order as any).order_number || "—",
        customer: (order as any).customers?.name || "—",
        deliveryLocation: deliveryLocation.trim() || (order as any).country || "—",
        date: new Date().toISOString(),
        rows,
      });

      logAudit({
        action: "report.generated",
        entity_type: "report",
        entity_id: "06_delivery_order",
        module: "reports",
        order_id: orderId,
        metadata: {
          delivery_order_number: deliveryOrderNumber,
          invoice_number: invoiceNumber,
          shipment_ids: selectedShipmentIds,
        },
      });
      toast.success("Delivery Order generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery Order</DialogTitle>
          <DialogDescription>Pick an order, choose its shipments, and fill the delivery details.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Order</Label>
            <SearchableSelect
              options={orders}
              value={orderId}
              onValueChange={setOrderId}
              placeholder="Select order..."
              searchPlaceholder="Search ORD-XXXXX..."
            />
          </div>

          {orderId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Shipments {shipments.length > 0 && `(${selectedShipmentIds.length}/${shipments.length})`}</Label>
                {shipments.length > 0 && (
                  <Button type="button" variant="ghost" size="sm" onClick={toggleAll}>
                    {allSelected ? "Clear all" : "Select all"}
                  </Button>
                )}
              </div>
              {shipments.length === 0 ? (
                <p className="text-sm text-muted-foreground border rounded-md p-3">No shipments found for this order.</p>
              ) : (
                <ScrollArea className="h-40 border rounded-md p-2">
                  <div className="space-y-2">
                    {shipments.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1 rounded">
                        <Checkbox
                          checked={selectedShipmentIds.includes(s.id)}
                          onCheckedChange={() => toggleShipment(s.id)}
                        />
                        <span className="font-medium text-sm">{s.shipment_code}</span>
                        <span className="text-xs text-muted-foreground ml-auto">
                          {new Date(s.created_at).toLocaleDateString()}
                        </span>
                      </label>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Invoice Number</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-..." />
            </div>
            <div className="space-y-2">
              <Label>Delivery Order Number</Label>
              <Input value={deliveryOrderNumber} onChange={(e) => setDeliveryOrderNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Vehicle Number</Label>
              <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. ABC-1234" />
            </div>
            <div className="space-y-2">
              <Label>Delivery Location</Label>
              <Input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="Address / city" />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading || !orderId || selectedShipmentIds.length === 0}>
            {loading ? "Generating..." : "Generate PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
