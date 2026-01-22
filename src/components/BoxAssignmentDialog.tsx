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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Box, Loader2, QrCode, Search, AlertTriangle, Plus, Package } from 'lucide-react';
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

interface BoxItem {
  product_id: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  batch_id: string;
  batch_type: string;
}

interface BoxData {
  id: string;
  box_code: string;
  content_type: string;
  items_list: BoxItem[];
}

interface BoxAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (boxId: string, boxCode: string, boxingOption?: 'needs_boxing' | 'skip_boxing') => void;
  onCreateNewBox: () => Promise<{ id: string; box_code: string } | null>;
  products: ProductSelection[];
  currentState: UnitState;
  title?: string;
  allowMultipleItems?: boolean; // Allow adding to boxes with existing items of same type
  batchType?: 'ORDER' | 'EXTRA'; // Type of batch being assigned
}

export function BoxAssignmentDialog({
  open,
  onOpenChange,
  onConfirm,
  onCreateNewBox,
  products,
  currentState,
  title,
  allowMultipleItems = true,
  batchType = 'ORDER',
}: BoxAssignmentDialogProps) {
  const { toast } = useToast();
  const [searchCode, setSearchCode] = useState('');
  const [selectedBox, setSelectedBox] = useState<BoxData | null>(null);
  const [emptyBoxes, setEmptyBoxes] = useState<BoxData[]>([]);
  const [compatibleBoxes, setCompatibleBoxes] = useState<BoxData[]>([]); // Boxes with same batch type
  const [selectedTab, setSelectedTab] = useState<'empty' | 'existing'>('empty');
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
      fetchBoxes();
      setSelectedBox(null);
      setSearchCode('');
      setBoxingOption('needs_boxing');
      setSelectedTab('empty');
      validateProductSelection();
    }
  }, [open, products]);

  const validateProductSelection = () => {
    // Check if all products have the same next phase (based on needs_packing)
    if (isFinishingState && products.length > 1) {
      const allNeedPacking = products.every(p => p.needs_packing);
      const noneNeedPacking = products.every(p => !p.needs_packing);
      
      if (!allNeedPacking && !noneNeedPacking) {
        setValidationError(
          'Cannot assign products with different next phases to the same box. Products needing packaging go to "Ready for Packaging", others go to "Ready for Boxing".'
        );
        return false;
      }
    }
    setValidationError(null);
    return true;
  };

  const fetchBoxes = async () => {
    setLoading(true);
    try {
      const { data: allBoxes } = await supabase
        .from('boxes')
        .select('id, box_code, content_type, items_list')
        .eq('is_active', true)
        .order('box_code');

      const empty: BoxData[] = [];
      const compatible: BoxData[] = [];

      allBoxes?.forEach((box) => {
        const itemsList = Array.isArray(box.items_list) ? box.items_list as unknown as BoxItem[] : [];
        const boxData: BoxData = {
          id: box.id,
          box_code: box.box_code,
          content_type: box.content_type || 'EMPTY',
          items_list: itemsList,
        };

        if (box.content_type === 'EMPTY' || !box.content_type || itemsList.length === 0) {
          empty.push(boxData);
        } else if (allowMultipleItems && box.content_type === batchType) {
          // Box has same type of content - can add more items
          compatible.push(boxData);
        }
      });

      setEmptyBoxes(empty);
      setCompatibleBoxes(compatible);
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
        .select('id, box_code, content_type, items_list')
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

      const itemsList = Array.isArray(box.items_list) ? box.items_list as unknown as BoxItem[] : [];
      const boxData: BoxData = {
        id: box.id,
        box_code: box.box_code,
        content_type: box.content_type || 'EMPTY',
        items_list: itemsList,
      };

      // Check if box is compatible
      if (boxData.content_type !== 'EMPTY' && boxData.items_list.length > 0) {
        if (!allowMultipleItems) {
          toast({
            title: 'Box Occupied',
            description: `Box ${box.box_code} already contains items`,
            variant: 'destructive',
          });
          return;
        }
        if (boxData.content_type !== batchType) {
          toast({
            title: 'Incompatible Box',
            description: `Box ${box.box_code} contains ${boxData.content_type} items. Cannot mix with ${batchType} items.`,
            variant: 'destructive',
          });
          return;
        }
      }

      setSelectedBox(boxData);
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
        const boxData: BoxData = {
          id: newBox.id,
          box_code: newBox.box_code,
          content_type: 'EMPTY',
          items_list: [],
        };
        setSelectedBox(boxData);
        await fetchBoxes();
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
  const currentBoxes = selectedTab === 'empty' ? emptyBoxes : compatibleBoxes;

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


        {/* Selected Box */}
        {selectedBox && (
          <Card className="border-primary bg-primary/5">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Box className="h-5 w-5 text-primary" />
                  <span className="font-mono font-bold text-lg">{selectedBox.box_code}</span>
                </div>
                <Badge className="bg-primary">Selected</Badge>
              </div>
              {selectedBox.items_list.length > 0 && (
                <div className="mt-2 pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-1">Current contents:</p>
                  <div className="space-y-1">
                    {selectedBox.items_list.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-sm">
                        <span>{item.product_sku}</span>
                        <span className="font-medium">× {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Available Boxes with Tabs */}
        {!selectedBox && !loading && (allowMultipleItems && compatibleBoxes.length > 0 ? (
          <Tabs value={selectedTab} onValueChange={(v) => setSelectedTab(v as 'empty' | 'existing')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="empty">Empty ({emptyBoxes.length})</TabsTrigger>
              <TabsTrigger value="existing">With {batchType} ({compatibleBoxes.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="empty" className="mt-3">
              <BoxGrid boxes={emptyBoxes} onSelect={setSelectedBox} />
            </TabsContent>

            <TabsContent value="existing" className="mt-3">
              <BoxGrid boxes={compatibleBoxes} onSelect={setSelectedBox} showContents />
            </TabsContent>
          </Tabs>
        ) : (
          <BoxGrid boxes={emptyBoxes} onSelect={setSelectedBox} />
        ))}

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
            {selectedBox?.items_list.length ? 'Add to' : 'Assign to'} {selectedBox?.box_code || 'Box'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface BoxGridProps {
  boxes: BoxData[];
  onSelect: (box: BoxData) => void;
  showContents?: boolean;
}

function BoxGrid({ boxes, onSelect, showContents }: BoxGridProps) {
  if (boxes.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        <Box className="mx-auto h-8 w-8 opacity-50 mb-2" />
        <p className="text-sm">No boxes available</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Available Boxes ({boxes.length})</Label>
      <div className="grid grid-cols-3 gap-2 max-h-[150px] overflow-y-auto">
        {boxes.slice(0, 12).map((box) => (
          <Button
            key={box.id}
            variant="outline"
            size="sm"
            className="font-mono flex-col h-auto py-2"
            onClick={() => onSelect(box)}
          >
            <span>{box.box_code}</span>
            {showContents && box.items_list.length > 0 && (
              <Badge variant="secondary" className="text-xs mt-1">
                {box.items_list.length} item(s)
              </Badge>
            )}
          </Button>
        ))}
        {boxes.length > 12 && (
          <p className="text-xs text-muted-foreground col-span-3 text-center">
            +{boxes.length - 12} more boxes available
          </p>
        )}
      </div>
    </div>
  );
}
