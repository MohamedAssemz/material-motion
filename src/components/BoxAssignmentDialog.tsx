import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Box, Loader2, QrCode, Search, AlertTriangle, Plus } from 'lucide-react';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';
import { useToast } from '@/hooks/use-toast';

interface ProductSelection {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  needs_packing: boolean;
  batches: Array<{ id: string; quantity: number }>;
}

interface BoxAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxId: string, boxCode: string, boxingOption?: 'needs_boxing' | 'skip_boxing') => void;
  onCreateNewBox: () => Promise<{ id: string; box_code: string } | null>;
  products: ProductSelection[];
  currentState: UnitState;
  title?: string;
}

export function BoxAssignmentDialog({
  open,
  onOpenChange,
  onConfirm,
  onCreateNewBox,
  products,
  currentState,
  title,
}: BoxAssignmentDialogProps) {
  const { toast } = useToast();
  const [searchCode, setSearchCode] = useState('');
  const [selectedBox, setSelectedBox] = useState<{ id: string; box_code: string } | null>(null);
  const [availableBoxes, setAvailableBoxes] = useState<Array<{ id: string; box_code: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [boxingOption, setBoxingOption] = useState<'needs_boxing' | 'skip_boxing'>('needs_boxing');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Check if in finishing state - validate needs_packing compatibility
  const isFinishingState = currentState === 'in_finishing';
  const isPackagingState = currentState === 'in_packaging';

  useEffect(() => {
    if (open) {
      fetchEmptyBoxes();
      setSelectedBox(null);
      setSearchCode('');
      setBoxingOption('needs_boxing');
      validateProductSelection();
    }
  }, [open, products]);

  const validateProductSelection = () => {
    if (isFinishingState && products.length > 1) {
      const allNeedPacking = products.every(p => p.needs_packing);
      const noneNeedPacking = products.every(p => !p.needs_packing);
      
      if (!allNeedPacking && !noneNeedPacking) {
        setValidationError(
          'Products in finishing state can only be assigned to the same box if they ALL need packing or ALL don\'t need packing.'
        );
        return false;
      }
    }
    setValidationError(null);
    return true;
  };

  const fetchEmptyBoxes = async () => {
    setLoading(true);
    try {
      const { data: allBoxes } = await supabase
        .from('boxes')
        .select('id, box_code')
        .eq('is_active', true)
        .order('box_code');

      const { data: occupiedBatches } = await supabase
        .from('batches')
        .select('box_id')
        .not('box_id', 'is', null)
        .eq('is_terminated', false);

      const occupiedBoxIds = new Set(occupiedBatches?.map(b => b.box_id) || []);
      const emptyBoxes = allBoxes?.filter(box => !occupiedBoxIds.has(box.id)) || [];
      
      setAvailableBoxes(emptyBoxes);
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
          description: `Box ${searchCode} not found or inactive`,
          variant: 'destructive',
        });
        return;
      }

      // Check if box is empty
      const { data: existingBatch } = await supabase
        .from('batches')
        .select('id')
        .eq('box_id', box.id)
        .eq('is_terminated', false)
        .maybeSingle();

      if (existingBatch) {
        toast({
          title: 'Box Occupied',
          description: `Box ${box.box_code} already contains a batch`,
          variant: 'destructive',
        });
        return;
      }

      setSelectedBox(box);
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

  const handleCreateNewBox = async () => {
    setCreating(true);
    try {
      const newBox = await onCreateNewBox();
      if (newBox) {
        setSelectedBox(newBox);
        await fetchEmptyBoxes();
        toast({
          title: 'Box Created',
          description: `Created new box ${newBox.box_code}`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const handleConfirm = () => {
    if (!selectedBox) return;
    if (validationError) {
      toast({
        title: 'Validation Error',
        description: validationError,
        variant: 'destructive',
      });
      return;
    }
    
    onConfirm(selectedBox.id, selectedBox.box_code, isPackagingState ? boxingOption : undefined);
    onOpenChange(false);
  };

  const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            {title || 'Assign to Box'}
          </DialogTitle>
        </DialogHeader>

        {/* Selected Products Summary */}
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
          <Label>Items to Assign ({totalQuantity} total)</Label>
          <div className="space-y-1">
            {products.map((product) => (
              <div key={product.product_id} className="flex items-center justify-between text-sm">
                <span>
                  {product.product_sku} - {product.product_name}
                  {isFinishingState && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {product.needs_packing ? 'Needs Packing' : 'No Packing'}
                    </Badge>
                  )}
                </span>
                <span className="font-medium">× {product.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Validation Error */}
        {validationError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{validationError}</AlertDescription>
          </Alert>
        )}

        {/* Boxing Option for Packaging State */}
        {isPackagingState && !validationError && (
          <div className="space-y-3 p-3 border rounded-lg">
            <Label>Boxing Requirement</Label>
            <RadioGroup value={boxingOption} onValueChange={(v) => setBoxingOption(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="needs_boxing" id="needs_boxing" />
                <Label htmlFor="needs_boxing" className="font-normal cursor-pointer">
                  Needs Boxing - Will go through boxing phase
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="skip_boxing" id="skip_boxing" />
                <Label htmlFor="skip_boxing" className="font-normal cursor-pointer">
                  Skip Boxing - Ready for receiving directly
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Search/Scan Input */}
        <div className="space-y-2">
          <Label>Scan or Enter Box Code</Label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                placeholder="e.g., BOX-0001"
                className="pl-10"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={searching || !searchCode.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Create New Box Button */}
        <Button 
          variant="outline" 
          onClick={handleCreateNewBox}
          disabled={creating}
          className="w-full"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Plus className="h-4 w-4 mr-2" />
          )}
          Create New Box
        </Button>

        {/* Selected Box */}
        {selectedBox && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Box className="h-5 w-5 text-primary" />
                <span className="font-mono font-bold text-lg">{selectedBox.box_code}</span>
              </div>
              <Badge className="bg-primary">Selected</Badge>
            </CardContent>
          </Card>
        )}

        {/* Available Boxes */}
        {!selectedBox && !loading && availableBoxes.length > 0 && (
          <div className="space-y-2">
            <Label>Available Empty Boxes ({availableBoxes.length})</Label>
            <div className="grid grid-cols-3 gap-2 max-h-[150px] overflow-y-auto">
              {availableBoxes.slice(0, 12).map((box) => (
                <Button
                  key={box.id}
                  variant="outline"
                  size="sm"
                  className="font-mono"
                  onClick={() => setSelectedBox(box)}
                >
                  {box.box_code}
                </Button>
              ))}
              {availableBoxes.length > 12 && (
                <p className="text-xs text-muted-foreground col-span-3 text-center">
                  +{availableBoxes.length - 12} more boxes available
                </p>
              )}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!selectedBox || !!validationError}
          >
            Assign to {selectedBox?.box_code || 'Box'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
