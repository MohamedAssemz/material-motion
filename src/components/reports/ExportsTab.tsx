import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, ClipboardList, CheckCircle2, AlertOctagon, Truck, FileOutput } from "lucide-react";
import { WeeklyPlanDialog } from "./forms/WeeklyPlanDialog";
import { ProductionOrderDialog } from "./forms/ProductionOrderDialog";
import { AcceptedTagDialog } from "./forms/AcceptedTagDialog";
import { HoldTagDialog } from "./forms/HoldTagDialog";
import { DeliveryOrderDialog } from "./forms/DeliveryOrderDialog";
import { ReleaseOrderDialog } from "./forms/ReleaseOrderDialog";

type FormKey = null | "weekly" | "production" | "accepted" | "hold" | "delivery" | "release";

const FORMS: Array<{
  key: Exclude<FormKey, null>;
  code: string;
  titleEn: string;
  titleAr: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "weekly", code: "01", titleEn: "Weekly Production Plan", titleAr: "خطة الإنتاج الأسبوعية", description: "Sat–Thu production quantities by product and work order.", icon: Calendar },
  { key: "production", code: "02", titleEn: "Production Order Form", titleAr: "أمر الإنتاج", description: "Issue an order to production with items, quantities and remarks.", icon: ClipboardList },
  { key: "accepted", code: "04", titleEn: "Accepted Items Tag", titleAr: "علامة تعريف المنتجات المقبولة", description: "Identification tag for accepted/passed boxes.", icon: CheckCircle2 },
  { key: "hold", code: "05", titleEn: "Hold Items Tag", titleAr: "بطاقة تعريف المنتجات المحجوزة", description: "Tag items placed on hold with reason and details.", icon: AlertOctagon },
  { key: "delivery", code: "06", titleEn: "Delivery Order", titleAr: "أمر التوصيل", description: "Per-shipment delivery slip with description, lot and quantity.", icon: Truck },
  { key: "release", code: "07", titleEn: "Release Order Form", titleAr: "طلب الإصدار", description: "Authorize release of order batches from inventory.", icon: FileOutput },
];

export function ExportsTab() {
  const [active, setActive] = useState<FormKey>(null);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Production Forms</h2>
        <p className="text-muted-foreground text-sm">
          Generate official production paperwork as printable PDFs.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {FORMS.map((f) => {
          const Icon = f.icon;
          return (
            <Card key={f.key} className="flex flex-col">
              <CardHeader className="flex flex-row items-start gap-3 pb-2">
                <div className="rounded-md bg-primary/10 p-2">
                  <Icon className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-mono text-muted-foreground">{f.code}</div>
                  <CardTitle className="text-base leading-snug">{f.titleEn}</CardTitle>
                  <div className="text-xs text-muted-foreground mt-0.5" dir="rtl">{f.titleAr}</div>
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 justify-between gap-4">
                <p className="text-sm text-muted-foreground">{f.description}</p>
                <Button onClick={() => setActive(f.key)} className="w-full">Generate</Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <WeeklyPlanDialog open={active === "weekly"} onOpenChange={(o) => !o && setActive(null)} />
      <ProductionOrderDialog open={active === "production"} onOpenChange={(o) => !o && setActive(null)} />
      <AcceptedTagDialog open={active === "accepted"} onOpenChange={(o) => !o && setActive(null)} />
      <HoldTagDialog open={active === "hold"} onOpenChange={(o) => !o && setActive(null)} />
      <DeliveryOrderDialog open={active === "delivery"} onOpenChange={(o) => !o && setActive(null)} />
      <ReleaseOrderDialog open={active === "release"} onOpenChange={(o) => !o && setActive(null)} />
    </div>
  );
}
