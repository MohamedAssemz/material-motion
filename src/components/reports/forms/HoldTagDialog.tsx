import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { generateHoldItemsTagPDF } from "@/lib/productionFormsPdf";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function HoldTagDialog({ open, onOpenChange }: Props) {
  const [orders, setOrders] = useState<SearchableSelectOption[]>([]);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [items, setItems] = useState<SearchableSelectOption[]>([]);
  const [itemId, setItemId] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("Under Inspection");
  const [info, setInfo] = useState("");
  const [qty, setQty] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOrderId(null); setItemId(null); setReason("Under Inspection"); setInfo(""); setQty(0); setItems([]);
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, customers(name)")
        .order("created_at", { ascending: false })
        .limit(500);
      setOrders((data || []).map((o: any) => ({ value: o.id, label: `${o.order_number} — ${o.customers?.name || "—"}` })));
    })();
  }, [open]);

  useEffect(() => {
    if (!orderId) { setItems([]); setItemId(null); return; }
    (async () => {
      const { data } = await supabase
        .from("order_items")
        .select("id, quantity, size, products(name_en, sku)")
        .eq("order_id", orderId);
      setItems((data || []).map((it: any) => ({
        value: it.id,
        label: `${it.products?.name_en || it.products?.sku} ${it.size ? `(${it.size})` : ""}`.trim(),
        description: `Ordered: ${it.quantity}`,
      })));
    })();
  }, [orderId]);

  const handleGenerate = async () => {
    if (!orderId || !itemId) { toast.error("Pick an order and item"); return; }
    if (qty <= 0) { toast.error("Quantity must be > 0"); return; }
    setLoading(true);
    try {
      const { data: order } = await supabase.from("orders").select("order_number").eq("id", orderId).single();
      const { data: item } = await supabase.from("order_items").select("products(name_en, sku), size").eq("id", itemId).single();
      const productName = `${(item as any)?.products?.name_en || (item as any)?.products?.sku || "—"}${(item as any)?.size ? ` (${(item as any).size})` : ""}`;
      generateHoldItemsTagPDF({
        productName,
        orderNumber: order!.order_number,
        quantity: qty,
        unit: "pcs",
        reason,
        additionalInfo: info,
        date: new Date().toISOString(),
      });
      logAudit({ action: "report.generated", entity_type: "report", entity_id: "05_hold_tag", module: "reports", order_id: orderId, metadata: { order_number: order!.order_number, reason, qty } });
      toast.success("Hold Tag generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Hold Items Identification Tag</DialogTitle>
          <DialogDescription>Mark items on hold and print the identification tag.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-2">
            <Label>Order</Label>
            <SearchableSelect options={orders} value={orderId} onValueChange={setOrderId} placeholder="Select order..." />
          </div>
          <div className="space-y-2">
            <Label>Item</Label>
            <SearchableSelect options={items} value={itemId} onValueChange={setItemId} placeholder="Select item..." disabled={!orderId} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Quantity on Hold</Label>
              <Input type="number" min={1} value={qty || ""} onChange={(e) => setQty(parseInt(e.target.value) || 0)} />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Under Inspection">Under Inspection</SelectItem>
                  <SelectItem value="Under Repair">Under Repair</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Additional Information</Label>
            <Textarea value={info} onChange={(e) => setInfo(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading || !orderId || !itemId}>{loading ? "Generating..." : "Generate PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
