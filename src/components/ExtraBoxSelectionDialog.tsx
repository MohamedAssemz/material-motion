import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Box, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useBoxScanner } from '@/hooks/useBoxScanner';

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
  onConfirm: (boxId: string, boxCode?: string) => void;
  title?: string;
  allowCreate?: boolean;
}

export function ExtraBoxSelectionDialog({
  open,
  onOpenChange,
  onConfirm,
  title = 'Select Extra Box',
  allowCreate = true,
}: ExtraBoxSelectionDialogProps) {
  const [boxes, setBoxes] = useState<ExtraBoxOption[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open) {
      fetchExtraBoxes();
      setSelectedBoxId('');
      setSearchQuery('');
    }
  }, [open]);

  // Scanner handler - auto-select extra box when scanned
  const handleBoxScan = useCallback(async (code: string) => {
    // Check if code matches an EBOX
    if (!code.startsWith('EBOX-')) {
      toast.error(`"${code}" is not an extra box code`);
      return;
    }

    // Find in loaded boxes
    const matchingBox = boxes.find(b => b.box_code.toUpperCase() === code);
    if (matchingBox) {
      setSelectedBoxId(matchingBox.id);
      toast.success(`Selected ${code}`);
      return;
    }

    // Check if box exists
    const { data: box } = await supabase
      .from('extra_boxes')
      .select('id, box_code, is_active')
      .eq('box_code', code)
      .single();

    if (!box) {
      toast.error(`Extra box "${code}" not found`);
      return;
    }

    if (!box.is_active) {
      toast.error(`Extra box "${code}" is inactive`);
      return;
    }

    // Box exists but wasn't in our list - refresh and select
    await fetchExtraBoxes();
    setSelectedBoxId(box.id);
    toast.success(`Selected ${code}`);
  }, [boxes]);

  // Enable scanner when dialog is open
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

  const handleCreateNewBox = async () => {
    setCreating(true);
    try {
      const { data: boxCode } = await supabase.rpc('generate_extra_box_code');
      
      const { data: newBox, error } = await supabase
        .from('extra_boxes')
        .insert({
          box_code: boxCode || `EBOX-${Date.now()}`,
          is_active: true,
          content_type: 'EMPTY',
          items_list: [],
        })
        .select('id, box_code, is_active, content_type, items_list')
        .single();

      if (error) throw error;

      toast.success(`Created new box: ${newBox.box_code}`);
      
      // Add to list and auto-select
      const formattedBox: ExtraBoxOption = {
        id: newBox.id,
        box_code: newBox.box_code,
        is_active: newBox.is_active,
        content_type: newBox.content_type || 'EMPTY',
        items_list: [],
      };
      
      setBoxes(prev => [formattedBox, ...prev]);
      setSelectedBoxId(newBox.id);
    } catch (error: any) {
      toast.error(error.message || 'Failed to create box');
    } finally {
      setCreating(false);
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
  
  // Filter boxes by search query
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
            {/* Search and Create Row */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search boxes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              {allowCreate && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={handleCreateNewBox}
                  disabled={creating}
                  title="Create new EBox"
                >
                  {creating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              )}
            </div>

            {/* Box List */}
            {filteredBoxes.length === 0 ? (
              <div className="text-center py-8">
                <Box className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                {boxes.length === 0 ? (
                  <>
                    <p className="text-muted-foreground">No extra boxes available</p>
                    {allowCreate && (
                      <Button 
                        variant="link" 
                        onClick={handleCreateNewBox}
                        disabled={creating}
                        className="mt-2"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Create your first EBox
                      </Button>
                    )}
                  </>
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
                        
                        {/* Show contents preview if box has items */}
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
              {boxes.length} extra box(es) available • Multiple batches can share the same box
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
