import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { QrCode, X, Loader2 } from 'lucide-react';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';
import { useToast } from '@/hooks/use-toast';

interface BoxBatch {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
}

interface ScannedBox {
  id: string;
  box_code: string;
  batches: BoxBatch[];
  total_quantity: number;
}

interface BoxScanPopupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddBoxes: (boxes: ScannedBox[]) => void;
  orderId: string;
  filterState: UnitState;
  alreadySelectedIds: string[];
}

export function BoxScanPopup({
  open,
  onOpenChange,
  onAddBoxes,
  orderId,
  filterState,
  alreadySelectedIds,
}: BoxScanPopupProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [scannedBoxes, setScannedBoxes] = useState<ScannedBox[]>([]);
  const [validating, setValidating] = useState(false);

  // Auto-focus input when popup opens
  useEffect(() => {
    if (open) {
      setScannedBoxes([]);
      setInputValue('');
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [open]);

  const validateAndAddBox = useCallback(async (code: string) => {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return;

    // Check if already scanned in this session
    if (scannedBoxes.some(b => b.box_code.toUpperCase() === normalizedCode)) {
      toast({
        title: 'Already Scanned',
        description: `Box ${normalizedCode} is already in the scan list`,
      });
      return;
    }

    // Check if already selected in main dialog
    if (alreadySelectedIds.some(id => {
      const box = scannedBoxes.find(b => b.id === id);
      return box?.box_code.toUpperCase() === normalizedCode;
    })) {
      toast({
        title: 'Already Selected',
        description: `Box ${normalizedCode} is already selected in the main list`,
      });
      return;
    }

    setValidating(true);

    try {
      // Query the box from database
      const { data: box } = await supabase
        .from('boxes')
        .select('id, box_code')
        .eq('box_code', normalizedCode)
        .eq('is_active', true)
        .maybeSingle();

      if (!box) {
        toast({
          title: 'Box Not Found',
          description: `No active box found with code "${normalizedCode}"`,
          variant: 'destructive',
        });
        return;
      }

      // Check if already selected in main dialog by ID
      if (alreadySelectedIds.includes(box.id)) {
        toast({
          title: 'Already Selected',
          description: `Box ${normalizedCode} is already selected`,
        });
        return;
      }

      // Fetch batches in this box for this order
      const { data: batches } = await supabase
        .from('order_batches')
        .select(`
          id,
          product_id,
          quantity,
          current_state,
          product:products(id, name, sku)
        `)
        .eq('box_id', box.id)
        .eq('order_id', orderId)
        .eq('is_terminated', false);

      if (!batches || batches.length === 0) {
        toast({
          title: 'Empty or Wrong Order',
          description: `Box ${normalizedCode} has no items for this order`,
          variant: 'destructive',
        });
        return;
      }

      // Check if batches are in the expected state
      const validBatches = batches.filter(b => b.current_state === filterState);

      if (validBatches.length === 0) {
        const actualState = batches[0].current_state;
        toast({
          title: 'Wrong State',
          description: `Box ${normalizedCode} items are in "${getStateLabel(actualState as UnitState)}" state, expected "${getStateLabel(filterState)}"`,
          variant: 'destructive',
        });
        return;
      }

      // Box is valid - add to scanned list
      const scannedBox: ScannedBox = {
        id: box.id,
        box_code: box.box_code,
        batches: validBatches.map(b => ({
          id: b.id,
          product_id: b.product_id,
          product_name: (b.product as any)?.name || 'Unknown',
          product_sku: (b.product as any)?.sku || 'N/A',
          quantity: b.quantity,
        })),
        total_quantity: validBatches.reduce((sum, b) => sum + b.quantity, 0),
      };

      setScannedBoxes(prev => [...prev, scannedBox]);
      toast({
        title: 'Box Scanned',
        description: `${normalizedCode} added (${scannedBox.total_quantity} items)`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setValidating(false);
      // Re-focus input after validation completes
      inputRef.current?.focus();
    }
  }, [scannedBoxes, alreadySelectedIds, orderId, filterState, toast]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && inputValue.trim()) {
      e.preventDefault();
      validateAndAddBox(inputValue);
      setInputValue('');
      // Keep focus on input for continuous scanning
      inputRef.current?.focus();
    }
  };

  const handleRemoveBox = (boxId: string) => {
    setScannedBoxes(prev => prev.filter(b => b.id !== boxId));
  };

  const handleAddSelected = () => {
    if (scannedBoxes.length > 0) {
      onAddBoxes(scannedBoxes);
    }
  };

  const handleCancel = () => {
    setScannedBoxes([]);
    setInputValue('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5" />
            Scan Boxes
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
            placeholder="Scan barcode here..."
            className="pl-10"
            disabled={validating}
          />
          {validating && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Scanned Boxes List */}
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Scanned Boxes ({scannedBoxes.length})
          </p>
          
          {scannedBoxes.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground border rounded-md border-dashed">
              <QrCode className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No boxes scanned yet</p>
              <p className="text-xs">Scan a barcode to add boxes</p>
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto space-y-2">
              {scannedBoxes.map((box) => (
                <div
                  key={box.id}
                  className="flex items-center justify-between p-2 border rounded-md bg-muted/30"
                >
                  <div>
                    <span className="font-mono font-medium">{box.box_code}</span>
                    <Badge variant="secondary" className="ml-2">
                      {box.total_quantity} items
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => handleRemoveBox(box.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleAddSelected} disabled={scannedBoxes.length === 0}>
            Add Selected ({scannedBoxes.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
