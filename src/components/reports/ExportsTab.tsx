import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileDown, FileSpreadsheet, FileText } from 'lucide-react';

export function ExportsTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Exports</h2>
        <p className="text-muted-foreground text-sm">Export templates and data downloads</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-dashed border-2 opacity-60">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-base">Orders Export</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Export all orders with items, status, and timeline data to CSV/Excel.
            </p>
            <p className="text-xs text-muted-foreground mt-3 italic">Coming soon</p>
          </CardContent>
        </Card>

        <Card className="border-dashed border-2 opacity-60">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <FileText className="h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-base">Production Report</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Generate production summary reports by date range and phase.
            </p>
            <p className="text-xs text-muted-foreground mt-3 italic">Coming soon</p>
          </CardContent>
        </Card>

        <Card className="border-dashed border-2 opacity-60">
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <FileDown className="h-8 w-8 text-muted-foreground" />
            <CardTitle className="text-base">Inventory Snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Export current inventory state including boxes and extra inventory.
            </p>
            <p className="text-xs text-muted-foreground mt-3 italic">Coming soon</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
