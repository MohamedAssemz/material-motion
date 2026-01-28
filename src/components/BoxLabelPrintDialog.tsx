import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Box, Printer, Loader2 } from 'lucide-react';
import { generateBoxLabelHTML } from '@/components/BoxLabel';

interface BoxForPrinting {
  id: string;
  box_code: string;
  box_type: 'order' | 'extra' | 'shipment';
}

interface BoxLabelPrintDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxes: BoxForPrinting[];
  preselectedBoxIds?: string[];
  title?: string;
}

export function BoxLabelPrintDialog({
  open,
  onOpenChange,
  boxes,
  preselectedBoxIds = [],
  title = 'Print Box Labels',
}: BoxLabelPrintDialogProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(preselectedBoxIds));
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(preselectedBoxIds));
    }
  }, [open, preselectedBoxIds]);

  const handleToggle = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === boxes.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(boxes.map(b => b.id)));
    }
  };

  const handlePrint = () => {
    const selectedBoxes = boxes.filter(b => selectedIds.has(b.id));
    if (selectedBoxes.length === 0) return;

    setPrinting(true);

    // Get base URL for QR codes
    const baseUrl = window.location.origin;
    
    // Generate HTML for labels
    const html = generateBoxLabelHTML(
      selectedBoxes.map(b => ({ boxCode: b.box_code, boxType: b.box_type })),
      baseUrl
    );

    // Open in new window (non-blocking print pattern)
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank', 'noopener,noreferrer');
    
    // Clean up blob URL after a delay
    setTimeout(() => {
      URL.revokeObjectURL(url);
      setPrinting(false);
    }, 1000);

    // Close dialog
    onOpenChange(false);
  };

  const allSelected = selectedIds.size === boxes.length && boxes.length > 0;
  const someSelected = selectedIds.size > 0 && selectedIds.size < boxes.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Select All */}
          <div className="flex items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all"
                checked={allSelected}
                onCheckedChange={handleSelectAll}
                className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
              />
              <Label htmlFor="select-all" className="cursor-pointer">
                Select All ({boxes.length})
              </Label>
            </div>
            <Badge variant="secondary">
              {selectedIds.size} selected
            </Badge>
          </div>

          {/* Box List */}
          {boxes.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Box className="h-12 w-12 mx-auto opacity-50 mb-2" />
              <p>No boxes available</p>
            </div>
          ) : (
            <ScrollArea className="h-[300px] pr-4">
              <div className="space-y-2">
                {boxes.map((box) => {
                  const isSelected = selectedIds.has(box.id);
                  return (
                    <div
                      key={box.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'
                      }`}
                      onClick={() => handleToggle(box.id)}
                    >
                      <Checkbox checked={isSelected} />
                      <Box className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                      <span className="font-mono font-medium flex-1">{box.box_code}</span>
                      <Badge variant="outline" className="text-xs">
                        {box.box_type === 'order' ? 'Order' : box.box_type === 'extra' ? 'Extra' : 'Shipment'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handlePrint} 
            disabled={selectedIds.size === 0 || printing}
          >
            {printing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Preparing...
              </>
            ) : (
              <>
                <Printer className="h-4 w-4 mr-2" />
                Print {selectedIds.size} Label{selectedIds.size !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
