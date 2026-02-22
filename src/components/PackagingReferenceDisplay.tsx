import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Package } from "lucide-react";

interface ShipmentLine {
  shipmentNumber: number;
  sku: string;
  productName: string;
  quantity: number;
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
    const match = line.match(/^Shipment (\d+): \[(.+?)\] (.+?) x (\d+)$/);
    if (match) {
      lines.push({
        shipmentNumber: parseInt(match[1]),
        sku: match[2],
        productName: match[3],
        quantity: parseInt(match[4]),
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
                <TableHead className="w-[100px]">Shipment</TableHead>
                <TableHead>Item</TableHead>
                <TableHead className="w-[80px] text-right">Qty</TableHead>
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
