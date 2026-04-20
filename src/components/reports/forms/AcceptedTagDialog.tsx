import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect, type SearchableSelectOption } from "@/components/ui/searchable-select";
import { supabase } from "@/integrations/supabase/client";
import { generateAcceptedItemsTagPDF } from "@/lib/productionFormsPdf";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

export function AcceptedTagDialog({ open, onOpenChange }: Props) {
  const [boxes, setBoxes] = useState<SearchableSelectOption[]>([]);
  const [boxId, setBoxId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setBoxId(null);
    (async () => {
      const { data } = await supabase
        .from("boxes")
        .select("id, box_code, content_type")
        .eq("is_active", true)
        .order("box_code", { ascending: true })
        .limit(500);
      setBoxes((data || []).map((b: any) => ({
        value: b.id,
        label: b.box_code,
        description: b.content_type || "EMPTY",
      })));
    })();
  }, [open]);

  const handleGenerate = async () => {
    if (!boxId) { toast.error("Pick a box"); return; }
    setLoading(true);
    try {
      const { data: box, error } = await supabase
        .from("boxes")
        .select("box_code, items_list")
        .eq("id", boxId)
        .single();
      if (error) throw error;

      const { data: batches } = await supabase
        .from("order_batches")
        .select("quantity, products(name_en, sku), orders(order_number, estimated_fulfillment_time)")
        .eq("box_id", boxId)
        .limit(1);
      const sample: any = batches?.[0];
      const items = (box.items_list as any[]) || [];
      const totalQty = items.reduce((s, it: any) => s + (it.quantity || 0), 0);
      const productName = sample?.products?.name_en || items[0]?.product_name || "—";

      generateAcceptedItemsTagPDF({
        productName,
        workOrderNo: sample?.orders?.order_number || "—",
        deliveryDate: sample?.orders?.estimated_fulfillment_time,
        quantity: totalQty,
        unit: "pcs",
        source: "Production",
        lotNo: box.box_code,
        date: new Date().toISOString(),
      });
      logAudit({ action: "report.generated", entity_type: "report", entity_id: "04_accepted_tag", module: "reports", metadata: { box_code: box.box_code } });
      toast.success("Accepted Tag generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Accepted Items Identification Tag</DialogTitle>
          <DialogDescription>Pick a box to print its accepted-items tag.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Box</Label>
          <SearchableSelect options={boxes} value={boxId} onValueChange={setBoxId} placeholder="Select box..." searchPlaceholder="Search BOX-XXXX..." />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading || !boxId}>{loading ? "Generating..." : "Generate PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
