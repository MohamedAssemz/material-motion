import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package } from "lucide-react";

interface ShipmentLine {
  shipmentNumber: number;
  sku: string;
  productName: string;
  quantity: number;
  length_cm?: number;
  width_cm?: number;
  height_cm?: number;
  weight_kg?: number;
}

function parsePackagingReference(notes: string | null): { lines: ShipmentLine[]; otherNotes: string } | null {
  if (!notes) return null;

  const startTag = "---PACKAGING_REFERENCE---";
  const endTag = "---END_PACKAGING_REFERENCE---";
  const startIdx = notes.indexOf(startTag);
  const endIdx = notes.indexOf(endTag);

  if (startIdx === -1 || endIdx === -1) {
    return { lines: [], otherNotes: notes.trim() };
  }

  const block = notes.substring(startIdx + startTag.length, endIdx).trim();
  const before = notes.substring(0, startIdx).trim();
  const after = notes.substring(endIdx + endTag.length).trim();
  const otherNotes = [before, after].filter(Boolean).join("\n");

  const lines: ShipmentLine[] = [];
  for (const line of block.split("\n")) {
    // Match with optional dimensions suffix: {L:10 W:20 H:30 Wt:5}
    const match = line.match(/^Shipment (\d+): \[(.+?)\] (.+?) x (\d+)(?:\s*\{(.+?)\})?$/);
    if (match) {
      const dims: Partial<Pick<ShipmentLine, 'length_cm' | 'width_cm' | 'height_cm' | 'weight_kg'>> = {};
      if (match[5]) {
        const dimParts = match[5].split(/\s+/);
        for (const part of dimParts) {
          const [key, val] = part.split(':');
          const num = parseFloat(val);
          if (!isNaN(num)) {
            if (key === 'L') dims.length_cm = num;
            else if (key === 'W') dims.width_cm = num;
            else if (key === 'H') dims.height_cm = num;
            else if (key === 'Wt') dims.weight_kg = num;
          }
        }
      }
      lines.push({
        shipmentNumber: parseInt(match[1]),
        sku: match[2],
        productName: match[3],
        quantity: parseInt(match[4]),
        ...dims,
      });
    }
  }

  return { lines, otherNotes };
}

interface PackagingReferenceDisplayProps {
  notes: string | null;
}

export function PackagingReferenceDisplay({ notes }: PackagingReferenceDisplayProps) {
  const parsed = parsePackagingReference(notes);
  if (!parsed) return null;

  const hasDims = parsed.lines.some(l => l.length_cm || l.width_cm || l.height_cm || l.weight_kg);

  return (
    <div className="space-y-3">
      {parsed.otherNotes && (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{parsed.otherNotes}</p>
      )}
      {parsed.lines.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Package className="h-4 w-4 text-primary" />
            <p className="text-sm font-medium">Packaging Reference</p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Shipment</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="w-[60px] text-right">Qty</TableHead>
                {hasDims && (
                  <>
                    <TableHead className="w-[70px] text-right">L (cm)</TableHead>
                    <TableHead className="w-[70px] text-right">W (cm)</TableHead>
                    <TableHead className="w-[70px] text-right">H (cm)</TableHead>
                    <TableHead className="w-[70px] text-right">Wt (kg)</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {parsed.lines.map((line, i) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">#{line.shipmentNumber}</TableCell>
                  <TableCell>
                    <span className="font-mono text-xs mr-2">{line.sku}</span>
                    <span className="text-muted-foreground">{line.productName}</span>
                  </TableCell>
                  <TableCell className="text-right">{line.quantity}</TableCell>
                  {hasDims && (
                    <>
                      <TableCell className="text-right">{line.length_cm ?? '—'}</TableCell>
                      <TableCell className="text-right">{line.width_cm ?? '—'}</TableCell>
                      <TableCell className="text-right">{line.height_cm ?? '—'}</TableCell>
                      <TableCell className="text-right">{line.weight_kg ?? '—'}</TableCell>
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
