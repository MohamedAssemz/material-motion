import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Box, Loader2, Package } from 'lucide-react';

interface BoxOption {
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
    batch_type: string;
  }>;
}

interface BoxSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxId: string, isExistingExtraBox?: boolean) => void;
  title?: string;
  allowExtraBoxes?: boolean; // Allow selecting boxes that already contain EXTRA batches
}

export function BoxSelectionDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Assign Box',
  allowExtraBoxes = false,
}: BoxSelectionDialogProps) {
  const [emptyBoxes, setEmptyBoxes] = useState<BoxOption[]>([]);
  const [extraBoxes, setExtraBoxes] = useState<BoxOption[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [selectedTab, setSelectedTab] = useState<'empty' | 'extra'>('empty');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchBoxes();
      setSelectedBoxId('');
      setSelectedTab('empty');
    }
  }, [open]);

  const fetchBoxes = async () => {
    setLoading(true);
    try {
      // Get all active boxes
      const { data: allBoxes, error: boxesError } = await supabase
        .from('boxes')
        .select('id, box_code, is_active, content_type, items_list')
        .eq('is_active', true)
        .order('box_code');

      if (boxesError) throw boxesError;

      // Query order batches to find which boxes actually have items
      const { data: batchesInBoxes } = await supabase
        .from('order_batches')
        .select('box_id')
        .not('box_id', 'is', null)
        .eq('is_terminated', false);

      // Create set of box IDs that have batches
      const boxesWithBatches = new Set(batchesInBoxes?.map(b => b.box_id) || []);

      // Separate empty boxes and boxes with EXTRA content
      const empty: BoxOption[] = [];
      const extra: BoxOption[] = [];

      allBoxes?.forEach((box) => {
        const boxData: BoxOption = {
          id: box.id,
          box_code: box.box_code,
          is_active: box.is_active,
          content_type: box.content_type || 'EMPTY',
          items_list: (box.items_list as BoxOption['items_list']) || [],
        };

        // Check both content_type AND actual batch presence
        const hasOrderBatches = boxesWithBatches.has(box.id);

        if (box.content_type === 'EXTRA' && !hasOrderBatches) {
          extra.push(boxData);
        } else if (!hasOrderBatches && (box.content_type === 'EMPTY' || !box.content_type)) {
          empty.push(boxData);
        }
        // Boxes with order batches are excluded from both lists
      });

      setEmptyBoxes(empty);
      setExtraBoxes(extra);
    } catch (error) {
      console.error('Error fetching boxes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedBoxId) {
      const isExistingExtraBox = selectedTab === 'extra';
      onConfirm(selectedBoxId, isExistingExtraBox);
      setSelectedBoxId('');
      onOpenChange(false);
    }
  };

  const currentBoxes = selectedTab === 'empty' ? emptyBoxes : extraBoxes;
  const selectedBox = currentBoxes.find(b => b.id === selectedBoxId);

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
            {allowExtraBoxes && extraBoxes.length > 0 ? (
              <Tabs value={selectedTab} onValueChange={(v) => { setSelectedTab(v as 'empty' | 'extra'); setSelectedBoxId(''); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="empty">Empty Boxes ({emptyBoxes.length})</TabsTrigger>
                  <TabsTrigger value="extra">With Extra ({extraBoxes.length})</TabsTrigger>
                </TabsList>

                <TabsContent value="empty" className="mt-4">
                  {emptyBoxes.length === 0 ? (
                    <div className="text-center py-4">
                      <Box className="mx-auto h-8 w-8 text-muted-foreground opacity-50 mb-2" />
                      <p className="text-sm text-muted-foreground">No empty boxes available</p>
                    </div>
                  ) : (
                    <BoxSelect boxes={emptyBoxes} selectedBoxId={selectedBoxId} onSelect={setSelectedBoxId} />
                  )}
                </TabsContent>

                <TabsContent value="extra" className="mt-4">
                  {extraBoxes.length === 0 ? (
                    <div className="text-center py-4">
                      <Package className="mx-auto h-8 w-8 text-muted-foreground opacity-50 mb-2" />
                      <p className="text-sm text-muted-foreground">No boxes with extra inventory</p>
                    </div>
                  ) : (
                    <BoxSelect boxes={extraBoxes} selectedBoxId={selectedBoxId} onSelect={setSelectedBoxId} showContents />
                  )}
                </TabsContent>
              </Tabs>
            ) : (
              <>
                {emptyBoxes.length === 0 ? (
                  <div className="text-center py-8">
                    <Box className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                    <p className="text-muted-foreground">No empty boxes available</p>
                    <p className="text-sm text-muted-foreground">Create more boxes or wait for boxes to be emptied</p>
                  </div>
                ) : (
                  <BoxSelect boxes={emptyBoxes} selectedBoxId={selectedBoxId} onSelect={setSelectedBoxId} />
                )}
              </>
            )}

            {/* Show selected box contents if it has items */}
            {selectedBox && selectedBox.items_list.length > 0 && (
              <div className="p-3 bg-muted/50 rounded-lg space-y-2">
                <Label className="text-xs text-muted-foreground">Current Contents:</Label>
                <div className="space-y-1">
                  {selectedBox.items_list.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span>{item.product_sku} - {item.product_name}</span>
                      <span className="font-medium">× {item.quantity}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedBoxId || loading}>
            {selectedTab === 'extra' ? 'Add to Box' : 'Assign Box'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BoxSelectProps {
  boxes: BoxOption[];
  selectedBoxId: string;
  onSelect: (id: string) => void;
  showContents?: boolean;
}

function BoxSelect({ boxes, selectedBoxId, onSelect, showContents }: BoxSelectProps) {
  return (
    <div>
      <Label>{showContents ? 'Select Box with Extra Inventory' : 'Select Empty Box'}</Label>
      <Select value={selectedBoxId} onValueChange={onSelect}>
        <SelectTrigger>
          <SelectValue placeholder="Choose a box..." />
        </SelectTrigger>
        <SelectContent>
          {boxes.map((box) => (
            <SelectItem key={box.id} value={box.id}>
              <div className="flex items-center gap-2">
                <span className="font-mono">{box.box_code}</span>
                {showContents && box.items_list.length > 0 ? (
                  <Badge variant="outline" className="text-xs text-amber-600 border-amber-600">
                    {box.items_list.length} item(s)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                    EMPTY
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground mt-1">
        {boxes.length} box(es) available
      </p>
    </div>
  );
}
