import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { generateWeeklyProductionPlanPDF, type WeeklyPlanRow } from "@/lib/productionFormsPdf";
import { logAudit } from "@/lib/auditLog";
import { toast } from "sonner";

function startOfWeekSat(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay(); // Sun=0..Sat=6
  const diff = (day + 1) % 7; // distance back to Saturday
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function WeeklyPlanDialog({ open, onOpenChange }: Props) {
  const today = new Date();
  const sat = startOfWeekSat(today);
  const thu = new Date(sat);
  thu.setDate(sat.getDate() + 5);
  const [from, setFrom] = useState(sat.toISOString().slice(0, 10));
  const [to, setTo] = useState(thu.toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      const s = startOfWeekSat(new Date());
      const e = new Date(s); e.setDate(s.getDate() + 5);
      setFrom(s.toISOString().slice(0, 10));
      setTo(e.toISOString().slice(0, 10));
    }
  }, [open]);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const { data: batches, error } = await supabase
        .from("order_batches")
        .select("quantity, production_date, product_id, products(name_en, sku), orders(order_number)")
        .gte("production_date", from)
        .lte("production_date", to)
        .not("production_date", "is", null);
      if (error) throw error;

      const map = new Map<string, WeeklyPlanRow>();
      for (const b of batches || []) {
        const key = `${(b as any).orders?.order_number || "—"}|${b.product_id}`;
        const name = (b as any).products?.name_en || (b as any).products?.sku || "Unknown";
        const wo = (b as any).orders?.order_number || "—";
        const row = map.get(key) || {
          workOrderNo: wo, productName: name,
          sat: 0, sun: 0, mon: 0, tue: 0, wed: 0, thu: 0, total: 0,
        };
        const day = new Date(b.production_date as string).getDay();
        const qty = b.quantity || 0;
        if (day === 6) row.sat += qty;
        else if (day === 0) row.sun += qty;
        else if (day === 1) row.mon += qty;
        else if (day === 2) row.tue += qty;
        else if (day === 3) row.wed += qty;
        else if (day === 4) row.thu += qty;
        row.total += qty;
        map.set(key, row);
      }
      const rows = Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 30);
      if (rows.length === 0) {
        toast.error("No production data in selected week");
        setLoading(false);
        return;
      }
      generateWeeklyProductionPlanPDF({ weekFrom: from, weekTo: to, rows });
      logAudit({ action: "report.generated", entity_type: "report", entity_id: "01_weekly_plan", module: "reports", metadata: { from, to, rows: rows.length } });
      toast.success("Weekly Production Plan generated");
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Weekly Production Plan</DialogTitle>
          <DialogDescription>Select the week range to generate the plan PDF.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-2">
            <Label>From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={loading}>{loading ? "Generating..." : "Generate PDF"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
