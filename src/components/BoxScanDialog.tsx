import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Box, Loader2, QrCode, Search, Check, X, Printer } from 'lucide-react';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';
import { useToast } from '@/hooks/use-toast';
import { normalizeBoxCode } from '@/lib/boxUtils';

interface BoxWithBatch {
  id: string;
  box_code: string;
  batch?: {
    id: string;
    qr_code_data: string | null;
    current_state: string;
    quantity: number;
    product: {
      name: string;
      sku: string;
    };
  } | null;
}

interface BoxScanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxes: BoxWithBatch[]) => void;
  mode: 'assign' | 'receive'; // assign = moving to Ready state, receive = moving to In state
  title?: string;
  filterState?: string; // Filter boxes containing batches in this state
}

export function BoxScanDialog({
  open,
  onOpenChange,
  onConfirm,
  mode,
  title,
  filterState,
}: BoxScanDialogProps) {
  const { toast } = useToast();
  const [searchCode, setSearchCode] = useState('');
  const [selectedBoxes, setSelectedBoxes] = useState<BoxWithBatch[]>([]);
  const [allBoxes, setAllBoxes] = useState<BoxWithBatch[]>([]);
  const [filteredBoxes, setFilteredBoxes] = useState<BoxWithBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  useEffect(() => {
    if (open) {
      fetchBoxes();
      setSelectedBoxes([]);
      setSearchCode('');
      setIsSearchFocused(false);
    }
  }, [open, mode, filterState]);

  // Real-time filtering as user types
  useEffect(() => {
    if (!searchCode.trim()) {
      setFilteredBoxes(allBoxes);
      return;
    }

    const searchTerm = searchCode.trim().toUpperCase();
    const filtered = allBoxes.filter(box => {
      // Match by box code
      if (box.box_code.toUpperCase().includes(searchTerm)) return true;
      // Match by product SKU or name (for receive mode)
      if (box.batch) {
        if (box.batch.product.sku.toUpperCase().includes(searchTerm)) return true;
        if (box.batch.product.name.toUpperCase().includes(searchTerm)) return true;
      }
      return false;
    });
    setFilteredBoxes(filtered);
  }, [searchCode, allBoxes]);

  const fetchBoxes = async () => {
    setLoading(true);
    try {
      if (mode === 'assign') {
        // Get empty boxes for assignment
        const { data: allBoxes } = await supabase
          .from('boxes')
          .select('id, box_code')
          .eq('is_active', true)
          .order('box_code');

        // Get boxes that have active batches
        const { data: occupiedBatches } = await supabase
          .from('order_batches')
          .select('box_id')
          .not('box_id', 'is', null)
          .eq('is_terminated', false);

        const occupiedBoxIds = new Set(occupiedBatches?.map(b => b.box_id) || []);
        const emptyBoxes = allBoxes?.filter(box => !occupiedBoxIds.has(box.id)) || [];
        const boxesData = emptyBoxes.map(b => ({ ...b, batch: null }));
        setAllBoxes(boxesData);
        setFilteredBoxes(boxesData);
      } else {
        // Get boxes containing batches in the specified state
        const { data: batches } = await supabase
          .from('order_batches')
          .select(`
            id,
            qr_code_data,
            current_state,
            quantity,
            box_id,
            product:products(name, sku)
          `)
          .eq('current_state', filterState || '')
          .not('box_id', 'is', null)
          .eq('is_terminated', false);

      if (!batches?.length) {
          setAllBoxes([]);
          setFilteredBoxes([]);
          setLoading(false);
          return;
        }

        const boxIds = batches.map(b => b.box_id).filter(Boolean);
        const { data: boxes } = await supabase
          .from('boxes')
          .select('id, box_code')
          .in('id', boxIds);

        const boxMap = new Map(boxes?.map(b => [b.id, b]) || []);
        const boxesWithBatches: BoxWithBatch[] = batches
          .filter(b => b.box_id && boxMap.has(b.box_id))
          .map(b => ({
            id: b.box_id!,
            box_code: boxMap.get(b.box_id!)!.box_code,
            batch: {
              id: b.id,
              qr_code_data: b.qr_code_data,
              current_state: b.current_state,
              quantity: b.quantity,
              product: b.product as any,
            },
          }));

        setAllBoxes(boxesWithBatches);
        setFilteredBoxes(boxesWithBatches);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchCode.trim()) return;

    setSearching(true);
    const normalizedCode = normalizeBoxCode(searchCode);
    try {
      const { data: box } = await supabase
        .from('boxes')
        .select('id, box_code')
        .eq('box_code', normalizedCode)
        .eq('is_active', true)
        .single();

      if (!box) {
        toast({
          title: 'Not Found',
          description: `Box ${searchCode} not found or inactive`,
          variant: 'destructive',
        });
        return;
      }

      // Check if already selected
      if (selectedBoxes.some(b => b.id === box.id)) {
        toast({
          title: 'Already Selected',
          description: `Box ${box.box_code} is already selected`,
        });
        return;
      }

      if (mode === 'assign') {
        // Check if box is empty
        const { data: existingBatch } = await supabase
          .from('order_batches')
          .select('id')
          .eq('box_id', box.id)
          .eq('is_terminated', false)
          .single();

        if (existingBatch) {
          toast({
            title: 'Box Occupied',
            description: `Box ${box.box_code} already contains a batch`,
            variant: 'destructive',
          });
          return;
        }

        setSelectedBoxes(prev => [...prev, { ...box, batch: null }]);
      } else {
        // Check if box has batch in correct state
        const { data: batch } = await supabase
          .from('order_batches')
          .select(`
            id,
            qr_code_data,
            current_state,
            quantity,
            product:products(name, sku)
          `)
          .eq('box_id', box.id)
          .eq('current_state', filterState || '')
          .eq('is_terminated', false)
          .single();

        if (!batch) {
          toast({
            title: 'Invalid Box',
            description: `Box ${box.box_code} doesn't contain items in the expected state`,
            variant: 'destructive',
          });
          return;
        }

        setSelectedBoxes(prev => [...prev, {
          ...box,
          batch: {
            id: batch.id,
            qr_code_data: batch.qr_code_data,
            current_state: batch.current_state,
            quantity: batch.quantity,
            product: batch.product as any,
          },
        }]);
      }

      setSearchCode('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSearching(false);
    }
  };

  const handleToggleBox = (box: BoxWithBatch) => {
    if (selectedBoxes.some(b => b.id === box.id)) {
      setSelectedBoxes(prev => prev.filter(b => b.id !== box.id));
    } else {
      setSelectedBoxes(prev => [...prev, box]);
    }
  };

  const handleRemoveSelected = (boxId: string) => {
    setSelectedBoxes(prev => prev.filter(b => b.id !== boxId));
  };

  const handleConfirm = () => {
    if (selectedBoxes.length > 0) {
      onConfirm(selectedBoxes);
      onOpenChange(false);
    }
  };

  const handlePrintBoxIds = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Box IDs</title>
          <style>
            body { font-family: monospace; padding: 20px; }
            .box-id { 
              font-size: 24px; 
              font-weight: bold; 
              padding: 10px 20px;
              margin: 10px 0;
              border: 2px solid black;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          ${selectedBoxes.map(box => `<div class="box-id">${box.box_code}</div>`).join('')}
          <script>
            setTimeout(function() {
              window.print();
            }, 100);
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const totalQuantity = selectedBoxes.reduce((sum, b) => sum + (b.batch?.quantity || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            {title || (mode === 'assign' ? 'Assign to Box' : 'Receive from Box')}
          </DialogTitle>
        </DialogHeader>

        {/* Search/Scan Input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="Search by box code, product SKU, or product name"
              className="pl-10"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => {
                setIsSearchFocused(false);
                // Reset filter on blur if search is empty
                if (!searchCode.trim()) {
                  setFilteredBoxes(allBoxes);
                }
              }}
            />
          </div>
          <Button onClick={handleSearch} disabled={searching || !searchCode.trim()}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {/* Selected Boxes */}
        {selectedBoxes.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Selected ({selectedBoxes.length} box{selectedBoxes.length !== 1 ? 'es' : ''}{mode === 'receive' && `, ${totalQuantity} items`})</Label>
              <Button variant="outline" size="sm" onClick={handlePrintBoxIds}>
                <Printer className="h-4 w-4 mr-1" />
                Print IDs
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedBoxes.map((box) => (
                <Badge
                  key={box.id}
                  variant="secondary"
                  className="text-sm py-1 px-3 cursor-pointer hover:bg-destructive/10"
                  onClick={() => handleRemoveSelected(box.id)}
                >
                  {box.box_code}
                  {box.batch && ` (${box.batch.quantity})`}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Available Boxes */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredBoxes.length === 0 ? (
          <div className="text-center py-8">
            <Box className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <p className="text-muted-foreground">
              {searchCode.trim() 
                ? `No boxes matching "${searchCode}"` 
                : (mode === 'assign' ? 'No empty boxes available' : 'No boxes with items in this state')}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Available Boxes ({filteredBoxes.length})</Label>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
              {filteredBoxes.map((box) => {
                const isSelected = selectedBoxes.some(b => b.id === box.id);
                return (
                  <Card
                    key={box.id}
                    className={`cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                    onClick={() => handleToggleBox(box)}
                  >
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30'}`}>
                          {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div>
                          <span className="font-mono font-bold">{box.box_code}</span>
                          {box.batch && (
                            <div className="text-sm text-muted-foreground">
                              {box.batch.product.sku} • {box.batch.product.name} • {box.batch.quantity} items
                            </div>
                          )}
                        </div>
                      </div>
                      {box.batch && (
                        <Badge variant="outline">
                          {getStateLabel(box.batch.current_state as UnitState)}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={selectedBoxes.length === 0}>
            {mode === 'assign' ? 'Assign' : 'Receive'} ({selectedBoxes.length})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
