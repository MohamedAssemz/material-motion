import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Box, Loader2, QrCode, Search, X, Printer } from 'lucide-react';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';
import { useToast } from '@/hooks/use-toast';

interface BoxBatch {
  id: string;
  batch_code: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
}

interface SelectedBox {
  id: string;
  box_code: string;
  batches: BoxBatch[];
  total_quantity: number;
}

interface BoxReceiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxes: SelectedBox[]) => void;
  orderId: string;
  filterState: UnitState;
  title?: string;
}

export function BoxReceiveDialog({
  open,
  onOpenChange,
  onConfirm,
  orderId,
  filterState,
  title,
}: BoxReceiveDialogProps) {
  const { toast } = useToast();
  const [searchCode, setSearchCode] = useState('');
  const [selectedBoxes, setSelectedBoxes] = useState<SelectedBox[]>([]);
  const [availableBoxes, setAvailableBoxes] = useState<SelectedBox[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (open) {
      fetchBoxesWithBatches();
      setSelectedBoxes([]);
      setSearchCode('');
    }
  }, [open, orderId, filterState]);

  const fetchBoxesWithBatches = async () => {
    setLoading(true);
    try {
      // Get batches in the specified state for this order
      const { data: batches, error } = await supabase
        .from('batches')
        .select(`
          id,
          batch_code,
          product_id,
          quantity,
          box_id,
          product:products(id, name, sku)
        `)
        .eq('order_id', orderId)
        .eq('current_state', filterState)
        .not('box_id', 'is', null)
        .eq('is_terminated', false);

      if (error) throw error;

      if (!batches?.length) {
        setAvailableBoxes([]);
        setLoading(false);
        return;
      }

      // Get unique box IDs
      const boxIds = [...new Set(batches.map(b => b.box_id).filter(Boolean))];
      
      const { data: boxes } = await supabase
        .from('boxes')
        .select('id, box_code')
        .in('id', boxIds);

      const boxMap = new Map(boxes?.map(b => [b.id, b]) || []);

      // Group batches by box
      const boxGroups = new Map<string, SelectedBox>();
      
      batches.forEach(batch => {
        if (!batch.box_id || !boxMap.has(batch.box_id)) return;
        
        const box = boxMap.get(batch.box_id)!;
        
        if (!boxGroups.has(batch.box_id)) {
          boxGroups.set(batch.box_id, {
            id: batch.box_id,
            box_code: box.box_code,
            batches: [],
            total_quantity: 0,
          });
        }
        
        const group = boxGroups.get(batch.box_id)!;
        group.batches.push({
          id: batch.id,
          batch_code: batch.batch_code,
          product_id: batch.product_id,
          product_name: (batch.product as any)?.name || 'Unknown',
          product_sku: (batch.product as any)?.sku || 'N/A',
          quantity: batch.quantity,
        });
        group.total_quantity += batch.quantity;
      });

      setAvailableBoxes(Array.from(boxGroups.values()));
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
    try {
      const { data: box } = await supabase
        .from('boxes')
        .select('id, box_code')
        .eq('box_code', searchCode.trim().toUpperCase())
        .eq('is_active', true)
        .single();

      if (!box) {
        toast({
          title: 'Not Found',
          description: `Box ${searchCode} not found`,
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
        setSearchCode('');
        return;
      }

      // Check if box has batches in the correct state for this order
      const { data: batches } = await supabase
        .from('batches')
        .select(`
          id,
          batch_code,
          product_id,
          quantity,
          product:products(id, name, sku)
        `)
        .eq('box_id', box.id)
        .eq('order_id', orderId)
        .eq('current_state', filterState)
        .eq('is_terminated', false);

      if (!batches?.length) {
        toast({
          title: 'Invalid Box',
          description: `Box ${box.box_code} doesn't contain items in ${getStateLabel(filterState)} state for this order`,
          variant: 'destructive',
        });
        return;
      }

      const selectedBox: SelectedBox = {
        id: box.id,
        box_code: box.box_code,
        batches: batches.map(b => ({
          id: b.id,
          batch_code: b.batch_code,
          product_id: b.product_id,
          product_name: (b.product as any)?.name || 'Unknown',
          product_sku: (b.product as any)?.sku || 'N/A',
          quantity: b.quantity,
        })),
        total_quantity: batches.reduce((sum, b) => sum + b.quantity, 0),
      };

      setSelectedBoxes(prev => [...prev, selectedBox]);
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

  const handleToggleBox = (box: SelectedBox) => {
    if (selectedBoxes.some(b => b.id === box.id)) {
      setSelectedBoxes(prev => prev.filter(b => b.id !== box.id));
    } else {
      setSelectedBoxes(prev => [...prev, box]);
    }
  };

  const handleRemoveSelected = (boxId: string) => {
    setSelectedBoxes(prev => prev.filter(b => b.id !== boxId));
  };

  const handlePrintBoxIds = () => {
    if (selectedBoxes.length === 0) return;

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
              font-size: 32px; 
              font-weight: bold; 
              padding: 15px 30px;
              margin: 15px 0;
              border: 3px solid black;
              display: inline-block;
            }
          </style>
        </head>
        <body>
          ${selectedBoxes.map(box => `<div class="box-id">${box.box_code}</div>`).join('')}
          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleConfirm = () => {
    if (selectedBoxes.length > 0) {
      onConfirm(selectedBoxes);
      onOpenChange(false);
    }
  };

  const totalQuantity = selectedBoxes.reduce((sum, b) => sum + b.total_quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            {title || `Receive from ${getStateLabel(filterState)}`}
          </DialogTitle>
        </DialogHeader>

        {/* Search/Scan Input */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchCode}
              onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
              placeholder="Scan or enter box code (e.g., BOX-0001)"
              className="pl-10"
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
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
              <Label>
                Selected ({selectedBoxes.length} box{selectedBoxes.length !== 1 ? 'es' : ''}, {totalQuantity} items)
              </Label>
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
                  {box.box_code} ({box.total_quantity})
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
        ) : availableBoxes.length === 0 ? (
          <div className="text-center py-8">
            <Box className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <p className="text-muted-foreground">No boxes in {getStateLabel(filterState)} state</p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label>Available Boxes ({availableBoxes.length})</Label>
            <div className="grid gap-2 max-h-[300px] overflow-y-auto">
              {availableBoxes.map((box) => {
                const isSelected = selectedBoxes.some(b => b.id === box.id);
                return (
                  <Card
                    key={box.id}
                    className={`cursor-pointer transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'}`}
                    onClick={() => handleToggleBox(box)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
                        <Checkbox checked={isSelected} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold">{box.box_code}</span>
                            <Badge variant="secondary">{box.total_quantity} items</Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {box.batches.map((b, i) => (
                              <span key={b.id}>
                                {i > 0 && ', '}
                                {b.product_sku} × {b.quantity}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
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
            Receive {selectedBoxes.length} Box{selectedBoxes.length !== 1 ? 'es' : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
