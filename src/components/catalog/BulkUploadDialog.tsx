import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Download, Upload, Loader2, FileText, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SIZE_OPTIONS } from '@/lib/catalogConstants';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BulkUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  onSuccess: () => void;
}

interface ParsedRow {
  name: string;
  description: string;
  size: string;
  color: string;
  brand: string;
  country: string;
  needs_packing: string;
  categories: string;
}

interface UploadResult {
  created: number;
  skipped: number;
  warnings: string[];
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

export function BulkUploadDialog({ open, onOpenChange, brands, categories, onSuccess }: BulkUploadDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const sizeSet = new Set(SIZE_OPTIONS as readonly string[]);

  const handleDownloadTemplate = () => {
    const headers = ['name', 'description', 'size', 'color', 'brand', 'country', 'needs_packing', 'categories'];
    const exampleRow = ['Example Product', 'A sample description', 'M', 'Red', 'MyBrand', 'US', 'true', 'Category1; Category2'];
    const csv = [headers.join(','), exampleRow.map(v => `"${v}"`).join(',')].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    setUploading(true);

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      
      if (lines.length < 2) {
        toast({ title: 'Error', description: 'CSV file must have a header row and at least one data row.', variant: 'destructive' });
        setUploading(false);
        return;
      }

      const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const nameIdx = headers.indexOf('name');

      if (nameIdx === -1) {
        toast({ title: 'Error', description: 'CSV must contain a "name" column.', variant: 'destructive' });
        setUploading(false);
        return;
      }

      const getVal = (values: string[], col: string) => {
        const idx = headers.indexOf(col);
        return idx >= 0 && idx < values.length ? values[idx] : '';
      };

      // Build lookup maps
      const brandMap = new Map(brands.map(b => [b.name.toLowerCase(), b.id]));
      const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c.id]));

      const warnings: string[] = [];
      const productsToInsert: {
        sku: string;
        name: string;
        description: string | null;
        size: string | null;
        color: string | null;
        brand_id: string | null;
        country: string | null;
        needs_packing: boolean;
        categoryIds: string[];
      }[] = [];

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const name = getVal(values, 'name').replace(/^"|"$/g, '');

        if (!name) {
          warnings.push(`Row ${i + 1}: Skipped – missing name.`);
          continue;
        }

        const description = getVal(values, 'description').replace(/^"|"$/g, '') || null;
        let size: string | null = getVal(values, 'size').replace(/^"|"$/g, '').toUpperCase() || null;
        const color = getVal(values, 'color').replace(/^"|"$/g, '') || null;
        const brandName = getVal(values, 'brand').replace(/^"|"$/g, '');
        const country = getVal(values, 'country').replace(/^"|"$/g, '').toUpperCase() || null;
        const needsPackingRaw = getVal(values, 'needs_packing').replace(/^"|"$/g, '').toLowerCase();
        const categoriesRaw = getVal(values, 'categories').replace(/^"|"$/g, '');

        // Validate size
        if (size && !sizeSet.has(size)) {
          warnings.push(`Row ${i + 1}: Invalid size "${size}" – cleared.`);
          size = null;
        }

        // Match brand
        let brand_id: string | null = null;
        if (brandName) {
          brand_id = brandMap.get(brandName.toLowerCase()) ?? null;
          if (!brand_id) {
            warnings.push(`Row ${i + 1}: Brand "${brandName}" not found – skipped.`);
          }
        }

        // Match categories
        const categoryIds: string[] = [];
        if (categoriesRaw) {
          const catNames = categoriesRaw.split(/[;,]/).map(s => s.trim()).filter(Boolean);
          for (const cn of catNames) {
            const catId = categoryMap.get(cn.toLowerCase());
            if (catId) {
              categoryIds.push(catId);
            } else {
              warnings.push(`Row ${i + 1}: Category "${cn}" not found – skipped.`);
            }
          }
        }

        const needs_packing = needsPackingRaw === 'false' ? false : true;

        productsToInsert.push({
          sku: generateSKU(i),
          name,
          description,
          size,
          color,
          brand_id,
          country,
          needs_packing,
          categoryIds,
        });
      }

      if (productsToInsert.length === 0) {
        setResult({ created: 0, skipped: lines.length - 1, warnings });
        setUploading(false);
        return;
      }

      // Batch insert products
      const { data: inserted, error } = await supabase
        .from('products')
        .insert(productsToInsert.map(({ categoryIds, ...p }) => p))
        .select('id');

      if (error) throw error;

      // Insert category associations
      const categoryLinks: { product_id: string; category_id: string }[] = [];
      if (inserted) {
        inserted.forEach((prod, idx) => {
          const catIds = productsToInsert[idx].categoryIds;
          catIds.forEach(catId => {
            categoryLinks.push({ product_id: prod.id, category_id: catId });
          });
        });
      }

      if (categoryLinks.length > 0) {
        const { error: catError } = await supabase.from('product_categories').insert(categoryLinks);
        if (catError) {
          warnings.push(`Warning: Products created but category links failed: ${catError.message}`);
        }
      }

      const created = inserted?.length ?? 0;
      setResult({ created, skipped: (lines.length - 1) - created, warnings });
      onSuccess();
    } catch (err: any) {
      toast({ title: 'Upload Failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClose = (open: boolean) => {
    if (!uploading) {
      onOpenChange(open);
      if (!open) {
        setResult(null);
        setFileName(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload Products</DialogTitle>
          <DialogDescription>
            Download the CSV template, fill in your products, then upload the file.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* Step 1: Download Template */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">1. Download Template</h4>
            <p className="text-xs text-muted-foreground">
              The template includes columns: name (required), description, size, color, brand, country, needs_packing, categories.
            </p>
            <Button variant="outline" size="sm" onClick={handleDownloadTemplate}>
              <Download className="mr-2 h-4 w-4" />
              Download CSV Template
            </Button>
          </div>

          {/* Step 2: Upload */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium">2. Upload Completed CSV</h4>
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
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Results */}
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
      </DialogContent>
    </Dialog>
  );
}
