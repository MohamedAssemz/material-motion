import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Box, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useBoxScanner } from '@/hooks/useBoxScanner';
import { normalizeBoxCode } from '@/lib/boxUtils';

interface ExtraBoxOption {
  id: string;
  box_code: string;
  is_active: boolean;
  content_type: string;
  items_list: Array<{
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    batch_id: string;
  }>;
  batchState?: string | null; // The current_state of batches in this box
}

interface ExtraBoxSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxId: string, boxCode?: string) => void;
  title?: string;
  filterByState?: string; // Only show boxes that are empty or contain batches with this state
}

export function ExtraBoxSelectionDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Select Extra Box',
  filterByState,
}: ExtraBoxSelectionDialogProps) {
  const [boxes, setBoxes] = useState<ExtraBoxOption[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open) {
      fetchExtraBoxes();
      setSelectedBoxId('');
      setSearchQuery('');
    }
  }, [open, filterByState]);

  const handleBoxScan = useCallback(async (code: string) => {
    const normalizedCode = normalizeBoxCode(code);

    if (normalizedCode.startsWith('BOX-') && !normalizedCode.startsWith('EBOX-')) {
      toast.error('This is an order box. It cannot be used for extra inventory.');
      return;
    }

    if (!normalizedCode.startsWith('EBOX-')) {
      toast.error(`"${code}" is not an extra box code`);
      return;
    }

    const matchingBox = boxes.find(b => b.box_code.toUpperCase() === normalizedCode);
    if (matchingBox) {
      setSelectedBoxId(matchingBox.id);
      toast.success(`Selected ${code}`);
      return;
    }

    const { data: box } = await supabase
      .from('extra_boxes')
      .select('id, box_code, is_active')
      .eq('box_code', normalizedCode)
      .single();

    if (!box) {
      toast.error(`Extra box "${code}" not found`);
      return;
    }

    if (!box.is_active) {
      toast.error(`Extra box "${code}" is inactive`);
      return;
    }

    await fetchExtraBoxes();
    setSelectedBoxId(box.id);
    toast.success(`Selected ${code}`);
  }, [boxes]);

  useBoxScanner({
    onScan: handleBoxScan,
    enabled: open,
  });

  const fetchExtraBoxes = async () => {
    setLoading(true);
    try {
      const { data: allBoxes, error: boxesError } = await supabase
        .from('extra_boxes')
        .select('id, box_code, is_active, content_type, items_list')
        .eq('is_active', true)
        .order('box_code');

      if (boxesError) throw boxesError;

      let formattedBoxes: ExtraBoxOption[] = (allBoxes || []).map((box) => ({
        id: box.id,
        box_code: box.box_code,
        is_active: box.is_active,
        content_type: box.content_type || 'EMPTY',
        items_list: (box.items_list as ExtraBoxOption['items_list']) || [],
        batchState: null,
      }));

      // If filtering by state, fetch batch states per box
      if (filterByState) {
        const boxIds = formattedBoxes.map(b => b.id);
        if (boxIds.length > 0) {
          const { data: batchData } = await supabase
            .from('extra_batches')
            .select('box_id, current_state')
            .in('box_id', boxIds);

          // Map box_id -> state (all batches in a box share state)
          const boxStateMap = new Map<string, string>();
          batchData?.forEach(b => {
            if (b.box_id && !boxStateMap.has(b.box_id)) {
              boxStateMap.set(b.box_id, b.current_state);
            }
          });

          // Attach state and filter: show EMPTY or matching state
          formattedBoxes = formattedBoxes
            .map(box => ({ ...box, batchState: boxStateMap.get(box.id) || null }))
            .filter(box => !box.batchState || box.batchState === filterByState);
        }
      }

      setBoxes(formattedBoxes);
    } catch (error) {
      console.error('Error fetching extra boxes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedBoxId) {
      const box = boxes.find(b => b.id === selectedBoxId);
      onConfirm(selectedBoxId, box?.box_code);
      setSelectedBoxId('');
      onOpenChange(false);
    }
  };

  const selectedBox = boxes.find(b => b.id === selectedBoxId);
  
  const filteredBoxes = searchQuery.trim()
    ? boxes.filter(box => 
        box.box_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        box.items_list.some(item => 
          item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.product_sku.toLowerCase().includes(searchQuery.toLowerCase())
        )
      )
    : boxes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search boxes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {filteredBoxes.length === 0 ? (
              <div className="text-center py-8">
                <Box className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                {boxes.length === 0 ? (
                  <p className="text-muted-foreground">No compatible extra boxes available. Create EBoxes from the Warehouse page.</p>
                ) : (
                  <p className="text-muted-foreground">No boxes match your search</p>
                )}
              </div>
            ) : (
              <ScrollArea className="h-[250px]">
                <div className="space-y-2 pr-4">
                  {filteredBoxes.map((box) => {
                    const isSelected = selectedBoxId === box.id;
                    const totalQty = box.items_list.reduce((sum, item) => sum + item.quantity, 0);
                    
                    return (
                      <div
                        key={box.id}
                        onClick={() => setSelectedBoxId(box.id)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          isSelected 
                            ? 'border-primary bg-primary/5' 
                            : 'border-border hover:border-muted-foreground/50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Box className={`h-4 w-4 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                            <span className="font-mono font-medium">{box.box_code}</span>
                          </div>
                          {box.items_list.length > 0 ? (
                            <Badge variant="secondary" className="text-xs">
                              {totalQty} units in {box.items_list.length} batch(es)
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                              EMPTY
                            </Badge>
                          )}
                        </div>
                        
                        {box.items_list.length > 0 && (
                          <div className="mt-2 pl-6 text-xs text-muted-foreground space-y-0.5">
                            {box.items_list.slice(0, 3).map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span>{item.product_sku}</span>
                                <span>× {item.quantity}</span>
                              </div>
                            ))}
                            {box.items_list.length > 3 && (
                              <div className="text-muted-foreground/70">
                                +{box.items_list.length - 3} more...
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
            
            <p className="text-xs text-muted-foreground">
              {boxes.length} compatible box(es) available
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedBoxId || loading}>
            {selectedBox ? `Select ${selectedBox.box_code}` : 'Select Box'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
