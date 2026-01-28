import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { QrCode, Loader2, Printer, CheckCircle2, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useBoxScanner } from '@/hooks/useBoxScanner';
import { format } from 'date-fns';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';
import { generateBoxLabelHTML } from '@/components/BoxLabel';

interface BatchInfo {
  id: string;
  qr_code_data: string | null;
  product_sku: string;
  product_name: string;
  quantity: number;
  current_state: string;
}

interface ScannedBoxData {
  boxType: 'order' | 'extra';
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  primary_state: string | null;
  batches: BatchInfo[];
}

interface BoxLookupScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BoxLookupScanDialog({ open, onOpenChange }: BoxLookupScanDialogProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [validating, setValidating] = useState(false);
  const [scannedBox, setScannedBox] = useState<ScannedBoxData | null>(null);

  // Deferred focus helper
  const focusInput = useCallback(() => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }, []);

  // Auto-focus input when dialog opens and reset state
  useEffect(() => {
    if (open) {
      setScannedBox(null);
      setInputValue('');
      focusInput();
    }
  }, [open, focusInput]);

  const lookupBox = useCallback(async (rawCode: string) => {
    if (validating) return;

    const normalized = rawCode.trim().toUpperCase();
    if (!normalized) return;

    // Extract box code from URL or raw input: BOX-#### or EBOX-####
    const boxMatch = normalized.match(/(EBOX-\d+|BOX-\d+)/);
    // Extract batch code from URL or raw input: B-XXXXXXXX or EB-XXXXXXXX
    const batchMatch = normalized.match(/(EB-[A-Z0-9]{8}|B-[A-Z0-9]{8})/);

    setValidating(true);

    try {
      let boxData: { boxType: 'order' | 'extra'; id: string; box_code: string; is_active: boolean; created_at: string; content_type: string } | null = null;

      // Priority: box code first, then batch code
      if (boxMatch) {
        const boxCode = boxMatch[1];

        // Try order boxes table
        const { data: dbOrderBox } = await supabase
          .from('boxes')
          .select('id, box_code, is_active, created_at, content_type')
          .eq('box_code', boxCode)
          .maybeSingle();

        if (dbOrderBox) {
          boxData = { boxType: 'order', ...dbOrderBox, content_type: dbOrderBox.content_type || 'EMPTY' };
        } else {
          // Try extra boxes table
          const { data: dbExtraBox } = await supabase
            .from('extra_boxes')
            .select('id, box_code, is_active, created_at, content_type')
            .eq('box_code', boxCode)
            .maybeSingle();

          if (dbExtraBox) {
            boxData = { boxType: 'extra', ...dbExtraBox, content_type: dbExtraBox.content_type || 'EMPTY' };
          }
        }

        if (!boxData) {
          toast({
            title: 'Box Not Found',
            description: `No box found with code "${boxCode}"`,
            variant: 'destructive',
          });
          return;
        }
      } else if (batchMatch) {
        const batchCode = batchMatch[1];

        // Check if it's an order batch (B-XXXXXXXX)
        if (batchCode.startsWith('B-')) {
          const { data: orderBatch } = await supabase
            .from('order_batches')
            .select('box_id, box:boxes(id, box_code, is_active, created_at, content_type)')
            .eq('qr_code_data', batchCode)
            .eq('is_terminated', false)
            .maybeSingle();

          if (orderBatch) {
            if (orderBatch.box_id && orderBatch.box) {
              const box = orderBatch.box as any;
              boxData = { boxType: 'order', id: box.id, box_code: box.box_code, is_active: box.is_active, created_at: box.created_at, content_type: box.content_type || 'EMPTY' };
            } else {
              toast({
                title: 'Batch Not In Box',
                description: `Batch ${batchCode} is not currently assigned to a box`,
                variant: 'destructive',
              });
              return;
            }
          }
        }

        // Check if it's an extra batch (EB-XXXXXXXX)
        if (!boxData && batchCode.startsWith('EB-')) {
          const { data: extraBatch } = await supabase
            .from('extra_batches')
            .select('box_id, box:extra_boxes(id, box_code, is_active, created_at, content_type)')
            .eq('qr_code_data', batchCode)
            .maybeSingle();

          if (extraBatch) {
            if (extraBatch.box_id && extraBatch.box) {
              const box = extraBatch.box as any;
              boxData = { boxType: 'extra', id: box.id, box_code: box.box_code, is_active: box.is_active, created_at: box.created_at, content_type: box.content_type || 'EMPTY' };
            } else {
              toast({
                title: 'Batch Not In Box',
                description: `Batch ${batchCode} is not currently assigned to a box`,
                variant: 'destructive',
              });
              return;
            }
          }
        }

        if (!boxData) {
          toast({
            title: 'Batch Not Found',
            description: `No batch found with code "${batchCode}"`,
            variant: 'destructive',
          });
          return;
        }
      } else {
        // Unrecognized scan format
        toast({
          title: 'Unrecognized Scan',
          description: `Could not parse box or batch code from "${normalized.slice(0, 30)}${normalized.length > 30 ? '...' : ''}"`,
          variant: 'destructive',
        });
        return;
      }

      // Fetch batches for this box
      let batches: BatchInfo[] = [];
      let primaryState: string | null = null;

      if (boxData.boxType === 'order') {
        const { data: orderBatches } = await supabase
          .from('order_batches')
          .select(`
            id,
            qr_code_data,
            quantity,
            current_state,
            product:products(sku, name)
          `)
          .eq('box_id', boxData.id)
          .eq('is_terminated', false);

        batches = (orderBatches || []).map(b => ({
          id: b.id,
          qr_code_data: b.qr_code_data,
          product_sku: (b.product as any)?.sku || 'N/A',
          product_name: (b.product as any)?.name || 'Unknown',
          quantity: b.quantity,
          current_state: b.current_state,
        }));

        if (batches.length > 0) {
          primaryState = batches[0].current_state;
        }
      } else {
        const { data: extraBatches } = await supabase
          .from('extra_batches')
          .select(`
            id,
            qr_code_data,
            quantity,
            current_state,
            product:products(sku, name)
          `)
          .eq('box_id', boxData.id);

        batches = (extraBatches || []).map(b => ({
          id: b.id,
          qr_code_data: b.qr_code_data,
          product_sku: (b.product as any)?.sku || 'N/A',
          product_name: (b.product as any)?.name || 'Unknown',
          quantity: b.quantity,
          current_state: b.current_state,
        }));

        if (batches.length > 0) {
          primaryState = batches[0].current_state;
        }
      }

      setScannedBox({
        boxType: boxData.boxType,
        id: boxData.id,
        box_code: boxData.box_code,
        is_active: boxData.is_active,
        created_at: boxData.created_at,
        content_type: boxData.content_type,
        primary_state: primaryState,
        batches,
      });

      toast({
        title: 'Box Found',
        description: `Loaded details for ${boxData.box_code}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
      setInputValue('');
      focusInput();
    }
  }, [validating, toast, focusInput]);

  // Fallback scanner hook - catches scans when input loses focus
  useBoxScanner({
    onScan: lookupBox,
    enabled: open,
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim() && !validating) {
      e.preventDefault();
      lookupBox(inputValue);
    }
  };

  const handlePrintLabel = () => {
    if (!scannedBox) return;

    const baseUrl = window.location.origin;
    const labelHtml = generateBoxLabelHTML(
      [{ boxCode: scannedBox.box_code, boxType: scannedBox.boxType }],
      baseUrl
    );
    const blob = new Blob([labelHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');

    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      };
    }
  };

  const getStateColor = (state: string) => {
    if (state.includes('manufacturing') || state === 'ready_for_finishing') return 'bg-primary';
    if (state.includes('finishing') || state === 'ready_for_packaging') return 'bg-secondary';
    if (state.includes('packaging') || state === 'ready_for_boxing') return 'bg-accent';
    if (state.includes('boxing') || state === 'ready_for_shipment') return 'bg-primary/80';
    if (state === 'shipped') return 'bg-muted-foreground';
    return 'bg-muted';
  };

  const totalQuantity = scannedBox?.batches.reduce((sum, b) => sum + b.quantity, 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Scan Box
          </DialogTitle>
        </DialogHeader>

        {/* Scan Input */}
        <div className="relative">
          <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder={validating ? 'Looking up...' : 'Scan barcode here...'}
            className="pl-10"
            readOnly={validating}
          />
          {validating && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {!scannedBox ? (
            // Empty state
            <div className="text-center py-12 text-muted-foreground border rounded-md border-dashed">
              <QrCode className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">Scan a box to view details</p>
              <p className="text-sm mt-1">Supports barcode and QR code scanning</p>
            </div>
          ) : (
            // Box details
            <div className="space-y-4">
              {/* Box Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl font-mono font-bold">{scannedBox.box_code}</span>
                  {scannedBox.primary_state && (
                    <Badge className={`${getStateColor(scannedBox.primary_state)} text-white`}>
                      {getStateLabel(scannedBox.primary_state as UnitState)}
                    </Badge>
                  )}
                  {scannedBox.boxType === 'extra' && (
                    <Badge variant="outline">Extra</Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {scannedBox.is_active ? (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-red-600 border-red-600">
                      <XCircle className="h-3 w-3 mr-1" />
                      Inactive
                    </Badge>
                  )}
                </div>
              </div>

              {/* Box Info */}
              <div className="grid grid-cols-2 gap-4 text-sm border-t border-b py-3">
                <div>
                  <span className="text-muted-foreground">Created:</span>{' '}
                  <span className="font-medium">{format(new Date(scannedBox.created_at), 'MMMM d, yyyy')}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Content Type:</span>{' '}
                  <span className="font-medium">{scannedBox.content_type}</span>
                </div>
              </div>

              {/* Batches Table */}
              <div>
                <h4 className="text-sm font-medium mb-2">
                  Batches ({scannedBox.batches.length}) • {totalQuantity} items
                </h4>
                {scannedBox.batches.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                    No batches in this box
                  </p>
                ) : (
                  <div className="border rounded-md max-h-[200px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>QR Code</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {scannedBox.batches.map((batch) => (
                          <TableRow key={batch.id}>
                            <TableCell className="font-mono text-xs">
                              {batch.qr_code_data || '-'}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {batch.product_sku}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {batch.product_name}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {batch.quantity}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          {scannedBox && (
            <Button variant="outline" onClick={handlePrintLabel}>
              <Printer className="h-4 w-4 mr-2" />
              Print Label
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
