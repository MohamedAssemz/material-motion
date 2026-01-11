import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Box, Loader2 } from 'lucide-react';

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
}

interface ExtraBoxSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxId: string) => void;
  title?: string;
}

export function ExtraBoxSelectionDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Assign Extra Box',
}: ExtraBoxSelectionDialogProps) {
  const [boxes, setBoxes] = useState<ExtraBoxOption[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchExtraBoxes();
      setSelectedBoxId('');
    }
  }, [open]);

  const fetchExtraBoxes = async () => {
    setLoading(true);
    try {
      const { data: allBoxes, error: boxesError } = await supabase
        .from('extra_boxes')
        .select('id, box_code, is_active, content_type, items_list')
        .eq('is_active', true)
        .order('box_code');

      if (boxesError) throw boxesError;

      const formattedBoxes: ExtraBoxOption[] = allBoxes?.map((box) => ({
        id: box.id,
        box_code: box.box_code,
        is_active: box.is_active,
        content_type: box.content_type || 'EMPTY',
        items_list: (box.items_list as ExtraBoxOption['items_list']) || [],
      })) || [];

      setBoxes(formattedBoxes);
    } catch (error) {
      console.error('Error fetching extra boxes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (selectedBoxId) {
      onConfirm(selectedBoxId);
      setSelectedBoxId('');
      onOpenChange(false);
    }
  };

  const selectedBox = boxes.find(b => b.id === selectedBoxId);

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
        ) : boxes.length === 0 ? (
          <div className="text-center py-8">
            <Box className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
            <p className="text-muted-foreground">No extra boxes available</p>
            <p className="text-sm text-muted-foreground">Create extra boxes from the Boxes page</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Select Extra Box</Label>
              <Select value={selectedBoxId} onValueChange={setSelectedBoxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a box..." />
                </SelectTrigger>
                <SelectContent>
                  {boxes.map((box) => (
                    <SelectItem key={box.id} value={box.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{box.box_code}</span>
                        {box.items_list.length > 0 ? (
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
                {boxes.length} extra box(es) available
              </p>
            </div>

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
            Assign Box
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
