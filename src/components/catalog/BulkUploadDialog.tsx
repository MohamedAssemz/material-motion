import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { Download, Upload, Loader2, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SIZE_OPTIONS } from '@/lib/catalogConstants';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ExcelJS from 'exceljs';
import { logAudit } from '@/lib/auditLog';

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name_en: string }[];
  onSuccess: () => void;
}

interface UploadResult {
  created: number;
  skipped: number;
  warnings: string[];
}

interface ParsedProduct {
  sku: string;
  name_en: string;
  name_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  sizes: string[];
  color_en: string | null;
  color_ar: string | null;
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
  const timestamp = Date.now().toString(36).toUpperCase();
  return `SKU-${timestamp}${String(index).padStart(3, '0')}`;
}

export function BulkUploadDialog({ open, onOpenChange, brands, onSuccess }: BulkUploadDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
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
      { header: 'english_name', key: 'english_name', width: 30 },
      { header: 'arabic_name', key: 'arabic_name', width: 30 },
      { header: 'english_description', key: 'english_description', width: 40 },
      { header: 'arabic_description', key: 'arabic_description', width: 40 },
      { header: 'sizes', key: 'sizes', width: 25 },
      { header: 'english_color', key: 'english_color', width: 15 },
      { header: 'arabic_color', key: 'arabic_color', width: 15 },
      { header: 'english_brand', key: 'english_brand', width: 20 },
      { header: 'arabic_brand', key: 'arabic_brand', width: 20 },
      { header: 'needs_packing', key: 'needs_packing', width: 15 },
      { header: 'image_url', key: 'image_url', width: 40 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    headerRow.alignment = { horizontal: 'center' };




    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const processRows = (rows: Record<string, string>[]): ParsedData => {
    const brandMap = new Map(brands.map(b => [b.name_en.toLowerCase(), b.id]));
    const warnings: string[] = [];
    const productsToInsert: ParsedProduct[] = [];
    const newBrands: Map<string, { name_en: string; name_ar: string | null }> = new Map();

    // First pass: detect new brands
    rows.forEach((row) => {
      const brandNameEn = (row.english_brand || row.brand || '').trim();
      const brandNameAr = (row.arabic_brand || '').trim();
      if (brandNameEn && !brandMap.has(brandNameEn.toLowerCase()) && !newBrands.has(brandNameEn.toLowerCase())) {
        newBrands.set(brandNameEn.toLowerCase(), { name_en: brandNameEn, name_ar: brandNameAr || null });
      }
    });

    rows.forEach((row, idx) => {
      const rowNum = idx + 2;
      const nameEn = (row.english_name || row.name || '').trim();
      if (!nameEn) {
        warnings.push(`Row ${rowNum}: Skipped – missing english name.`);
        return;
      }

      // Parse sizes (comma-separated)
      const sizesRaw = (row.sizes || row.size || '').trim().toUpperCase();
      const parsedSizes: string[] = [];
      if (sizesRaw) {
        sizesRaw.split(/[,;]+/).forEach(s => {
          const trimmed = s.trim();
          if (sizeSet.has(trimmed)) {
            parsedSizes.push(trimmed);
          } else if (trimmed) {
            warnings.push(`Row ${rowNum}: Invalid size "${trimmed}" – skipped.`);
          }
        });
      }

      const brandNameEn = (row.english_brand || row.brand || '').trim();
      let brand_id: string | null = null;
      if (brandNameEn) {
        brand_id = brandMap.get(brandNameEn.toLowerCase()) ?? null;
        if (!brand_id) {
          // Will be auto-created
          warnings.push(`Row ${rowNum}: Brand "${brandNameEn}" will be auto-created.`);
        }
      }

      const needsPackingRaw = (row.needs_packing || '').trim().toLowerCase();
      const needs_packing = needsPackingRaw === 'false' ? false : true;

      const imageUrl = (row.image_url || '').trim() || null;

      productsToInsert.push({
        sku: generateSKU(idx),
        name_en: nameEn,
        name_ar: (row.arabic_name || '').trim() || null,
        description_en: (row.english_description || row.description || '').trim() || null,
        description_ar: (row.arabic_description || '').trim() || null,
        sizes: parsedSizes,
        color_en: (row.english_color || row.color || '').trim() || null,
        color_ar: (row.arabic_color || '').trim() || null,
        brand_id,
        brand_name: brandNameEn || '',
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
      let rows: Record<string, string>[] = [];
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
            const raw = cell.value;
            let strVal = '';
            if (raw == null) {
              strVal = '';
            } else if (typeof raw === 'object') {
              strVal = (raw as any).text ?? (raw as any).hyperlink ?? (raw as any).result ?? String(raw);
            } else {
              strVal = String(raw);
            }
            vals[colNumber - 1] = strVal.trim();
          });
          const getVal = (col: string) => {
            const idx = headers.indexOf(col);
            return idx >= 0 ? vals[idx] ?? '' : '';
          };
          const rowData: Record<string, string> = {};
          headers.forEach(h => { rowData[h] = getVal(h); });
          rows.push(rowData);
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
        if (!headers.includes('english_name') && !headers.includes('name')) {
          toast({ title: 'Error', description: 'File must contain an "english_name" or "name" column.', variant: 'destructive' });
          setUploading(false);
          return;
        }
        const getVal = (values: string[], col: string) => {
          const idx = headers.indexOf(col);
          return idx >= 0 && idx < values.length ? values[idx].replace(/^"|"$/g, '') : '';
        };
        for (let i = 1; i < lines.length; i++) {
          const values = parseCSVLine(lines[i]);
          const rowData: Record<string, string> = {};
          headers.forEach(h => { rowData[h] = getVal(values, h); });
          rows.push(rowData);
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
      // Auto-create new brands
      const brandMap = new Map(brands.map(b => [b.name_en.toLowerCase(), b.id]));
      const newBrandNames = new Set<string>();
      parsedData.productsToInsert.forEach(p => {
        if (p.brand_name && !p.brand_id && !brandMap.has(p.brand_name.toLowerCase())) {
          newBrandNames.add(p.brand_name.toLowerCase());
        }
      });

      if (newBrandNames.size > 0) {
        const brandsToCreate = Array.from(newBrandNames).map(name => {
          const product = parsedData.productsToInsert.find(p => p.brand_name.toLowerCase() === name);
          return { name_en: product?.brand_name || name };
        });
        const { data: createdBrands } = await supabase
          .from('brands')
          .insert(brandsToCreate)
          .select('id, name_en');
        createdBrands?.forEach(b => brandMap.set(b.name_en.toLowerCase(), b.id));
      }

      // Assign brand_ids for auto-created brands
      const productsWithBrands = parsedData.productsToInsert.map(p => ({
        ...p,
        brand_id: p.brand_id || (p.brand_name ? brandMap.get(p.brand_name.toLowerCase()) || null : null),
      }));

      const toInsert = productsWithBrands.map(({ brand_name, image_url, ...p }) => p);
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
      logAudit({
        action: "product.bulk_uploaded",
        entity_type: "product",
        module: "catalog",
        metadata: {
          created,
          skipped: parsedData.totalRows - created,
          total_rows: parsedData.totalRows,
          new_brands: newBrandNames.size,
        },
      });
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
          <DialogTitle>{t('catalog.bulk_upload_title')}</DialogTitle>
          <DialogDescription>
            {parsedData
              ? `${t('catalog.bulk_review_desc')} (${parsedData.productsToInsert.length})`
              : t('catalog.bulk_upload_desc')}
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
                    <TableHead className="text-xs">{t('catalog.name')}</TableHead>
                    <TableHead className="text-xs">{t('catalog.size')}</TableHead>
                    <TableHead className="text-xs">{t('catalog.color')}</TableHead>
                    <TableHead className="text-xs">{t('catalog.brands')}</TableHead>
                    <TableHead className="text-xs">{t('catalog.packing')}</TableHead>
                    <TableHead className="text-xs">{t('catalog.image')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.productsToInsert.map((p, i) => (
                    <TableRow key={i}>
                    <TableCell className="text-xs font-medium">{p.name_en}</TableCell>
                      <TableCell className="text-xs">{p.sizes.length > 0 ? p.sizes.join(', ') : '—'}</TableCell>
                      <TableCell className="text-xs">{p.color_en || '—'}</TableCell>
                      <TableCell className="text-xs">{p.brand_name || '—'}</TableCell>
                      <TableCell className="text-xs">{p.needs_packing ? t('common.yes') : t('common.no')}</TableCell>
                      <TableCell className="text-xs truncate max-w-[120px]">{p.image_url || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" size="sm" onClick={handleCancelInsert} disabled={inserting}>
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={handleConfirmInsert} disabled={inserting}>
                {inserting ? (
                  <>
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                    {t('catalog.inserting')}
                  </>
                ) : (
                  `${t('catalog.confirm_create')} ${parsedData.productsToInsert.length} ${t('catalog.product_s')}`
                )}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Initial upload UI */}
        {!parsedData && (
          <div className="space-y-6 py-2">
            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t('catalog.download_step')}</h4>
              <p className="text-xs text-muted-foreground">
                {t('catalog.template_desc')}
              </p>
              <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
                <Download className="me-2 h-4 w-4" />
                {t('catalog.download_excel')}
              </Button>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">{t('catalog.upload_step')}</h4>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="me-2 h-4 w-4" />
                  )}
                  {uploading ? t('catalog.processing') : t('catalog.choose_file')}
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
                    {result.created} {t('catalog.created_label')}
                  </Badge>
                  {result.skipped > 0 && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {result.skipped} {t('catalog.skipped')}
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
