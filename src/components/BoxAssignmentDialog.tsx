import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useLanguage } from '@/contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Box, Loader2, QrCode, Search, AlertTriangle, Settings } from 'lucide-react';
import { getStateLabel, type UnitState } from '@/lib/stateMachine';
import { useToast } from '@/hooks/use-toast';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useBoxScanner } from '@/hooks/useBoxScanner';
import { normalizeBoxCode } from '@/lib/boxUtils';
interface Machine {
  id: string;
  name: string;
  type: string;
}

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
  onConfirm: (boxId: string, boxCode: string, boxingOption?: 'needs_boxing' | 'skip_boxing', machineId?: string) => void;
  onCreateNewBox: () => Promise<{ id: string; box_code: string } | null>;
  products: ProductSelection[];
  currentState: UnitState;
  title?: string;
  allowMultipleItems?: boolean;
  batchType?: 'ORDER' | 'EXTRA';
  machineType?: 'manufacturing' | 'finishing' | 'packaging'; // If provided, show machine selector
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
  machineType,
}: BoxAssignmentDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [searchCode, setSearchCode] = useState('');
  const [selectedBox, setSelectedBox] = useState<BoxData | null>(null);
  const [emptyBoxes, setEmptyBoxes] = useState<BoxData[]>([]);
  const [compatibleBoxes, setCompatibleBoxes] = useState<BoxData[]>([]);
  const [selectedTab, setSelectedTab] = useState<'empty' | 'existing'>('empty');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const [boxingOption, setBoxingOption] = useState<'needs_boxing' | 'skip_boxing'>('needs_boxing');
  const [validationError, setValidationError] = useState<string | null>(null);
  
  // Machine selection state
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [loadingMachines, setLoadingMachines] = useState(false);
  // Check if in finishing state - validate needs_packing compatibility
  const isFinishingState = currentState === 'in_finishing';
  const isPackagingState = currentState === 'in_packaging';

  useEffect(() => {
    if (open) {
      fetchBoxes();
      if (machineType) {
        fetchMachines();
      }
      setSelectedBox(null);
      setSearchCode('');
      setBoxingOption('needs_boxing');
      setSelectedTab('empty');
      setSelectedMachine(null);
      validateProductSelection();
    }
  }, [open, products, machineType]);

  // Scanner handler - auto-select box when scanned
  const handleBoxScan = useCallback(async (code: string) => {
    setSearchCode('');
    const normalizedCode = normalizeBoxCode(code);

    // Detect extra box scans
    if (normalizedCode.startsWith('EBOX-')) {
      toast({
        title: 'Wrong Box Type',
        description: 'This is an extra box (EBOX). It cannot be used for orders.',
        variant: 'destructive',
      });
      return;
    }
    
    // Find box in empty or compatible boxes
    const emptyMatch = emptyBoxes.find(b => b.box_code.toUpperCase() === normalizedCode);
    if (emptyMatch) {
      setSelectedBox(emptyMatch);
      toast({
        title: 'Box Selected',
        description: `Selected empty box ${normalizedCode}`,
      });
      return;
    }

    const compatibleMatch = compatibleBoxes.find(b => b.box_code.toUpperCase() === normalizedCode);
    if (compatibleMatch && allowMultipleItems) {
      setSelectedBox(compatibleMatch);
      toast({
        title: 'Box Selected',
        description: `Selected box ${normalizedCode} (already has ${batchType} items)`,
      });
      return;
    }

    // Check if box exists at all
    const { data: box } = await supabase
      .from('boxes')
      .select('id, box_code, content_type')
      .eq('box_code', normalizedCode)
      .eq('is_active', true)
      .single();

    if (!box) {
      toast({
        title: 'Box Not Found',
        description: `No active box found with code "${code}"`,
        variant: 'destructive',
      });
      return;
    }

    // Box exists but is incompatible
    if (box.content_type && box.content_type !== 'EMPTY' && box.content_type !== batchType) {
      toast({
        title: 'Incompatible Box',
        description: `Box ${code} contains ${box.content_type} items. Cannot mix with ${batchType} items.`,
        variant: 'destructive',
      });
    } else if (!allowMultipleItems && box.content_type !== 'EMPTY') {
      toast({
        title: 'Box Occupied',
        description: `Box ${code} already contains items`,
        variant: 'destructive',
      });
    }
  }, [emptyBoxes, compatibleBoxes, allowMultipleItems, batchType, toast]);

  // Enable scanner when dialog is open
  useBoxScanner({
    onScan: handleBoxScan,
    enabled: open,
  });
  
  const fetchMachines = async () => {
    if (!machineType) return;
    setLoadingMachines(true);
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('id, name, type')
        .eq('type', machineType)
        .eq('is_active', true)
        .order('name');
      
      if (error) throw error;
      setMachines(data || []);
    } catch (error: any) {
      console.error('Error fetching machines:', error);
    } finally {
      setLoadingMachines(false);
    }
  };

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

    const codeToSearch = searchCode;
    setSearchCode('');
    setSearching(true);
    const normalizedCode = normalizeBoxCode(codeToSearch);

    // Detect extra box scans
    if (normalizedCode.startsWith('EBOX-')) {
      toast({
        title: 'Wrong Box Type',
        description: 'This is an extra box (EBOX). It cannot be used for orders.',
        variant: 'destructive',
      });
      setSearching(false);
      return;
    }

    try {
      const { data: box } = await supabase
        .from('boxes')
        .select('id, box_code, content_type, items_list')
        .eq('box_code', normalizedCode)
        .eq('is_active', true)
        .single();

      if (!box) {
        toast({
          title: 'Not Found',
          description: `Box ${codeToSearch} not found or inactive`,
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
    
    onConfirm(
      selectedBox.id, 
      selectedBox.box_code, 
      isPackagingState ? boxingOption : undefined,
      selectedMachine || undefined
    );
    onOpenChange(false);
  };

  const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0);
  const machineTypeLabel = machineType === 'manufacturing' ? t('box.manufacturing') : 
                            machineType === 'finishing' ? t('box.finishing') : 
                            machineType === 'packaging' ? t('box.packaging') : '';
  const currentBoxes = selectedTab === 'empty' ? emptyBoxes : compatibleBoxes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            {title || t('box.assign_to_box')}
          </DialogTitle>
        </DialogHeader>

        {/* Selected Products Summary */}
        <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
          <Label>{t('box.items_to_assign').replace('{n}', String(totalQuantity))}</Label>
          <div className="space-y-1">
            {products.map((product) => (
              <div key={product.product_id} className="flex items-center justify-between text-sm">
                <span>
                  {product.product_sku} - {product.product_name}
                  {isFinishingState && (
                    <Badge variant="outline" className="ms-2 text-xs">
                      {product.needs_packing ? t('phase.needs_packing') : t('phase.no_packing')}
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
            <Label>{t('box.boxing_requirement')}</Label>
            <RadioGroup value={boxingOption} onValueChange={(v) => setBoxingOption(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="needs_boxing" id="needs_boxing" />
                <Label htmlFor="needs_boxing" className="font-normal cursor-pointer">
                  {t('box.needs_boxing_desc')}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="skip_boxing" id="skip_boxing" />
                <Label htmlFor="skip_boxing" className="font-normal cursor-pointer">
                  {t('box.skip_boxing_desc')}
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}

        {/* Machine Selection */}
        {machineType && (
          <div className="space-y-2 p-3 border rounded-lg">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4 text-muted-foreground" />
              <Label>{t('box.machine_optional').replace('{type}', machineTypeLabel)}</Label>
            </div>
            <SearchableSelect
              options={machines.map(m => ({ value: m.id, label: m.name }))}
              value={selectedMachine}
              onValueChange={setSelectedMachine}
              placeholder={t('phase.select_machine_ph')}
              searchPlaceholder={t('phase.search_machines')}
              emptyText={`${t('phase.no_machines_found')}`}
              loading={loadingMachines}
            />
          </div>
        )}

        {/* Search/Scan Input */}
        <div className="space-y-2">
          <Label>{t('box.scan_enter_code')}</Label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <QrCode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value.toUpperCase())}
                readOnly={searching}
                placeholder={t('box.box_number_placeholder')}
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
