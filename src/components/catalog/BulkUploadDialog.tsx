import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, Loader2, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SIZE_OPTIONS } from '@/lib/catalogConstants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ExcelJS from 'exceljs';

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name: string }[];
  onSuccess: () => void;
}

interface UploadResult {
  created: number;
  skipped: number;
  warnings: string[];
}

interface ParsedProduct {
  sku: string;
  name: string;
  description: string | null;
  size: string | null;
  color: string | null;
  brand_id: string | null;
  brand_name: string;
  needs_packing: boolean;
  image_url: string | null;
}

interface ParsedData {
  productsToInsert: ParsedProduct[];
  warnings: string[];
  totalRows: number;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function generateSKU(index: number): string {
  const timestamp = Date.now();
  return `PRD-${timestamp}-${String(index).padStart(3, '0')}`;
}

export function BulkUploadDialog({ open, onOpenChange, brands, onSuccess }: BulkUploadDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);

  const sizeSet = new Set(SIZE_OPTIONS as readonly string[]);

  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Products');

    sheet.columns = [
      { header: 'name', key: 'name', width: 30 },
      { header: 'description', key: 'description', width: 40 },
      { header: 'size', key: 'size', width: 12 },
      { header: 'color', key: 'color', width: 15 },
      { header: 'brand', key: 'brand', width: 20 },
      { header: 'needs_packing', key: 'needs_packing', width: 15 },
      { header: 'image_url', key: 'image_url', width: 40 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { horizontal: 'center' };

    sheet.addRow({
      name: 'Example Product',
      description: 'A sample description',
      size: 'M',
      color: 'Red',
      brand: brands.length > 0 ? brands[0].name : 'MyBrand',
      needs_packing: 'true',
      image_url: 'https://example.com/image.jpg',
    });



    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const processRows = (rows: { name: string; description: string; size: string; color: string; brand: string; needs_packing: string; image_url: string }[]): ParsedData => {
    const brandMap = new Map(brands.map(b => [b.name.toLowerCase(), b.id]));
    const warnings: string[] = [];
    const productsToInsert: ParsedProduct[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const name = row.name?.trim();
      if (!name) {
        warnings.push(`Row ${rowNum}: Skipped – missing name.`);
        return;
      }

      let size: string | null = row.size?.trim().toUpperCase() || null;
      if (size && !sizeSet.has(size)) {
        warnings.push(`Row ${rowNum}: Invalid size "${size}" – cleared.`);
        size = null;
      }

      const brandName = row.brand?.trim();
      let brand_id: string | null = null;
      if (brandName) {
        brand_id = brandMap.get(brandName.toLowerCase()) ?? null;
        if (!brand_id) {
          warnings.push(`Row ${rowNum}: Brand "${brandName}" not found – skipped.`);
        }
      }

      const needsPackingRaw = row.needs_packing?.trim().toLowerCase();
      const needs_packing = needsPackingRaw === 'false' ? false : true;

      const imageUrl = row.image_url?.trim() || null;

      productsToInsert.push({
        sku: generateSKU(idx),
        name,
        description: row.description?.trim() || null,
        size,
        color: row.color?.trim() || null,
        brand_id,
        brand_name: brandName || '',
        needs_packing,
        image_url: imageUrl,
      });
    });

    return { productsToInsert, warnings, totalRows: rows.length };
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setParsedData(null);
    setUploading(true);

    try {
      let rows: { name: string; description: string; size: string; color: string; brand: string; needs_packing: string; image_url: string }[] = [];
      const isExcel = file.name.match(/\.xlsx?$/i);

      if (isExcel) {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const sheet = workbook.worksheets[0];
        if (!sheet) throw new Error('No worksheet found in the file.');

        const headers: string[] = [];
        sheet.getRow(1).eachCell((cell, colNumber) => {
          headers[colNumber - 1] = String(cell.value ?? '').toLowerCase().trim();
        });

        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return;
          const vals: string[] = [];
          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            vals[colNumber - 1] = String(cell.value ?? '').trim();
          });
          const getVal = (col: string) => {
            const idx = headers.indexOf(col);
            return idx >= 0 ? vals[idx] ?? '' : '';
          };
          rows.push({
            name: getVal('name'),
            description: getVal('description'),
            size: getVal('size'),
            color: getVal('color'),
            brand: getVal('brand'),
            needs_packing: getVal('needs_packing'),
            image_url: getVal('image_url'),
          });
        });
      } else {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) {
          toast({ title: 'Error', description: 'File must have a header row and at least one data row.', variant: 'destructive' });
          setUploading(false);
          return;
        }
        const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
        if (!headers.includes('name')) {
          toast({ title: 'Error', description: 'File must contain a "name" column.', variant: 'destructive' });
          setUploading(false);
          return;
        }
        const getVal = (values: string[], col: string) => {
          const idx = headers.indexOf(col);
          return idx >= 0 && idx < values.length ? values[idx].replace(/^"|"$/g, '') : '';
        };
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          rows.push({
            name: getVal(values, 'name'),
            description: getVal(values, 'description'),
            size: getVal(values, 'size'),
            color: getVal(values, 'color'),
            brand: getVal(values, 'brand'),
            needs_packing: getVal(values, 'needs_packing'),
            image_url: getVal(values, 'image_url'),
          });
        }
      }

      if (rows.length === 0) {
        toast({ title: 'Error', description: 'No data rows found.', variant: 'destructive' });
        setUploading(false);
        return;
      }

      const parsed = processRows(rows);

      if (parsed.productsToInsert.length === 0) {
        setResult({ created: 0, skipped: rows.length, warnings: parsed.warnings });
        setUploading(false);
        return;
      }

      setParsedData(parsed);
    } catch (err: any) {
      toast({ title: 'Upload Failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmInsert = async () => {
    if (!parsedData) return;
    setInserting(true);

    try {
      const toInsert = parsedData.productsToInsert.map(({ brand_name, image_url, ...p }) => p);
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(toInsert)
        .select('id');

      if (error) throw error;

      // Insert product images for any rows with image_url
      const imageInserts = parsedData.productsToInsert
        .map((p, i) => ({ image_url: p.image_url, product_id: inserted?.[i]?.id }))
        .filter((item): item is { image_url: string; product_id: string } => !!item.image_url && !!item.product_id);

      if (imageInserts.length > 0) {
        const { error: imgError } = await supabase
          .from('product_images')
          .insert(imageInserts.map(item => ({
            product_id: item.product_id,
            image_url: item.image_url,
            is_main: true,
            sort_order: 0,
          })));
        if (imgError) {
          console.error('Image insert error:', imgError);
        }
      }

      const created = inserted?.length ?? 0;
      setResult({ created, skipped: parsedData.totalRows - created, warnings: parsedData.warnings });
      setParsedData(null);
      onSuccess();
    } catch (err: any) {
      toast({ title: 'Upload Failed', description: err.message, variant: 'destructive' });
    } finally {
      setInserting(false);
    }
  };

  const handleCancelInsert = () => {
    setParsedData(null);
    setFileName(null);
  };

  const handleClose = (open: boolean) => {
    if (!uploading && !inserting) {
      onOpenChange(open);
      if (!open) {
        setResult(null);
        setFileName(null);
        setParsedData(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Products</DialogTitle>
          <DialogDescription>
            {parsedData
              ? `Review the ${parsedData.productsToInsert.length} product(s) below before confirming.`
              : 'Download the Excel template, fill in your products, then upload the file.'}
          </DialogDescription>
        </DialogHeader>

        {/* Confirmation preview */}
        {parsedData && !result && (
          <div className="space-y-4">
            {parsedData.warnings.length > 0 && (
              <ScrollArea className="max-h-24">
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {parsedData.warnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500" />
                      {w}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            )}

            <ScrollArea className="max-h-72 border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Name</TableHead>
                    <TableHead className="text-xs">Size</TableHead>
                    <TableHead className="text-xs">Color</TableHead>
                    <TableHead className="text-xs">Brand</TableHead>
                    <TableHead className="text-xs">Packing</TableHead>
                    <TableHead className="text-xs">Image</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.productsToInsert.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-medium">{p.name}</TableCell>
                      <TableCell className="text-xs">{p.size || '—'}</TableCell>
                      <TableCell className="text-xs">{p.color || '—'}</TableCell>
                      <TableCell className="text-xs">{p.brand_name || '—'}</TableCell>
                      <TableCell className="text-xs">{p.needs_packing ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">{p.image_url || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={handleCancelInsert} disabled={inserting}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleConfirmInsert} disabled={inserting}>
                {inserting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inserting...
                  </>
                ) : (
                  `Confirm & Create ${parsedData.productsToInsert.length} Product(s)`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Initial upload UI */}
        {!parsedData && (
          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">1. Download Template</h4>
              <p className="text-xs text-muted-foreground">
                The template includes columns: name (required), description, size, color, brand, needs_packing. Size, brand, and needs_packing have dropdown lists.
              </p>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="mr-2 h-4 w-4" />
                Download Excel Template
              </Button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">2. Upload Completed File</h4>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="mr-2 h-4 w-4" />
                  )}
                  {uploading ? 'Processing...' : 'Choose File'}
                </Button>
                {fileName && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {fileName}
                  </span>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
            </div>

            {result && (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center gap-4">
                  <Badge variant="default" className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {result.created} created
                  </Badge>
                  {result.skipped > 0 && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {result.skipped} skipped
                    </Badge>
                  )}
                </div>

                {result.warnings.length > 0 && (
                  <ScrollArea className="max-h-40">
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {result.warnings.map((w, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-yellow-500" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
