import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Box, Loader2 } from 'lucide-react';

interface BoxOption {
  id: string;
  box_code: string;
  is_active: boolean;
}

interface BoxSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxId: string) => void;
  title?: string;
}

export function BoxSelectionDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Assign Box',
}: BoxSelectionDialogProps) {
  const [boxes, setBoxes] = useState<BoxOption[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (open) {
      fetchEmptyBoxes();
    }
  }, [open]);

  const fetchEmptyBoxes = async () => {
    setLoading(true);
    try {
      // Get all active boxes
      const { data: allBoxes, error: boxesError } = await supabase
        .from('boxes')
        .select('id, box_code, is_active')
        .eq('is_active', true)
        .order('box_code');

      if (boxesError) throw boxesError;

      // Get boxes that currently have batches
      const { data: occupiedBatches } = await supabase
        .from('batches')
        .select('box_id')
        .not('box_id', 'is', null)
        .eq('is_terminated', false);

      const occupiedBoxIds = new Set(occupiedBatches?.map(b => b.box_id) || []);

      // Filter to only empty boxes
      const emptyBoxes = allBoxes?.filter(box => !occupiedBoxIds.has(box.id)) || [];
      setBoxes(emptyBoxes);
    } catch (error) {
      console.error('Error fetching boxes:', error);
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
            <p className="text-muted-foreground">No empty boxes available</p>
            <p className="text-sm text-muted-foreground">Create more boxes or wait for boxes to be emptied</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Select Empty Box</Label>
              <Select value={selectedBoxId} onValueChange={setSelectedBoxId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a box..." />
                </SelectTrigger>
                <SelectContent>
                  {boxes.map((box) => (
                    <SelectItem key={box.id} value={box.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono">{box.box_code}</span>
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                          EMPTY
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {boxes.length} empty box(es) available
              </p>
            </div>
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
