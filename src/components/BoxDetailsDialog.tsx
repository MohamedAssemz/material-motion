import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Printer, RotateCcw } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { generateBoxLabelHTML } from '@/components/BoxLabel';

interface BoxDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxType: 'order' | 'extra';
  boxId: string | null;
  boxCode: string;
  createdAt: string;
  isActive: boolean;
  contentType: string;
  primaryState: string | null;
  onRefresh?: () => void;
}

interface OrderBatchDetail {
  id: string;
  qr_code_data: string | null;
  quantity: number;
  current_state: string;
  order_id: string;
  product: { name: string; sku: string } | null;
  order: { order_number: string } | null;
}

interface ExtraBatchDetail {
  id: string;
  qr_code_data: string | null;
  quantity: number;
  current_state: string;
  inventory_state: string;
  product: { name: string; sku: string } | null;
}

interface GroupedBySku {
  sku: string;
  name: string;
  totalQty: number;
  batchIds: string[];
}

interface ExtraGroupedBySku extends GroupedBySku {
  inventory_state: string;
}

export function BoxDetailsDialog({
  open,
  onOpenChange,
  boxType,
  boxId,
  boxCode,
  createdAt,
  isActive,
  contentType,
  primaryState,
  onRefresh,
}: BoxDetailsDialogProps) {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [forceEmptying, setForceEmptying] = useState(false);
  const [forceEmptyConfirmOpen, setForceEmptyConfirmOpen] = useState(false);
  const [orderBatches, setOrderBatches] = useState<OrderBatchDetail[]>([]);
  const [extraBatches, setExtraBatches] = useState<ExtraBatchDetail[]>([]);

  const isAdmin = hasRole('admin');
  const batchCount = boxType === 'order' ? orderBatches.length : extraBatches.length;
  const isEmpty = batchCount === 0;

  // Derive order number(s) from order batches
  const orderNumbers = useMemo(() => {
    if (boxType !== 'order' || orderBatches.length === 0) return [];
    const unique = new Set<string>();
    orderBatches.forEach(b => {
      if (b.order?.order_number) unique.add(b.order.order_number);
    });
    return Array.from(unique).sort();
  }, [orderBatches, boxType]);

  // Group order batches by SKU
  const groupedOrderBatches = useMemo((): GroupedBySku[] => {
    const map = new Map<string, GroupedBySku>();
    orderBatches.forEach(b => {
      const sku = b.product?.sku || 'N/A';
      if (!map.has(sku)) {
        map.set(sku, { sku, name: b.product?.name || '-', totalQty: 0, batchIds: [] });
      }
      const g = map.get(sku)!;
      g.totalQty += b.quantity;
      g.batchIds.push(b.id);
    });
    return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [orderBatches]);

  // Group extra batches by SKU + inventory_state
  const groupedExtraBatches = useMemo((): ExtraGroupedBySku[] => {
    const map = new Map<string, ExtraGroupedBySku>();
    extraBatches.forEach(b => {
      const sku = b.product?.sku || 'N/A';
      const key = `${sku}::${b.inventory_state}`;
      if (!map.has(key)) {
        map.set(key, { sku, name: b.product?.name || '-', totalQty: 0, batchIds: [], inventory_state: b.inventory_state });
      }
      const g = map.get(key)!;
      g.totalQty += b.quantity;
      g.batchIds.push(b.id);
    });
    return Array.from(map.values()).sort((a, b) => a.sku.localeCompare(b.sku));
  }, [extraBatches]);

  const previousStateMap: Record<string, string> = {
    ready_for_finishing: 'in_manufacturing',
    in_finishing: 'in_manufacturing',
    ready_for_packaging: 'in_finishing',
    in_packaging: 'in_finishing',
    ready_for_boxing: 'in_packaging',
    in_boxing: 'in_packaging',
    ready_for_shipment: 'in_boxing',
    shipped: 'in_boxing',
  };

  useEffect(() => {
    if (open && boxId) {
      fetchBatchDetails();
    }
  }, [open, boxId, boxType]);

  const fetchBatchDetails = async () => {
    if (!boxId) return;
    
    setLoading(true);
    try {
      if (boxType === 'order') {
        const { data, error } = await supabase
          .from('order_batches')
          .select(`
            id,
            qr_code_data,
            quantity,
            current_state,
            order_id,
            product:products(name, sku),
            order:orders(order_number)
          `)
          .eq('box_id', boxId);

        if (error) throw error;
        setOrderBatches((data || []).map(b => ({
          ...b,
          product: b.product as { name: string; sku: string } | null,
          order: b.order as { order_number: string } | null,
        })));
      } else {
        const { data, error } = await supabase
          .from('extra_batches')
          .select(`
            id,
            qr_code_data,
            quantity,
            current_state,
            inventory_state,
            product:products(name, sku)
          `)
          .eq('box_id', boxId);

        if (error) throw error;
        setExtraBatches((data || []).map(b => ({
          ...b,
          product: b.product as { name: string; sku: string } | null,
        })));
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

  const handleForceEmpty = async () => {
    if (!boxId || !isAdmin) return;
    setForceEmptying(true);
    try {
      if (boxType === 'order') {
        for (const batch of orderBatches) {
          const prevState = previousStateMap[batch.current_state];
          if (prevState) {
            await supabase
              .from('order_batches')
              .update({ current_state: prevState, box_id: null })
              .eq('id', batch.id);
          }
        }
      }
      const table = boxType === 'order' ? 'boxes' : 'extra_boxes';
      await supabase.from(table).update({ items_list: [] }).eq('id', boxId);

      toast({ title: 'Success', description: 'Box emptied successfully. Batches reverted.' });
      fetchBatchDetails();
      onRefresh?.();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setForceEmptying(false);
    }
  };

  const getStateColor = (state: string) => {
    const colors: Record<string, string> = {
      'in_manufacturing': 'bg-blue-500',
      'ready_for_finishing': 'bg-blue-300',
      'in_finishing': 'bg-purple-500',
      'ready_for_packaging': 'bg-orange-500',
      'in_packaging': 'bg-indigo-500',
      'ready_for_boxing': 'bg-cyan-300',
      'in_boxing': 'bg-cyan-500',
      'ready_for_shipment': 'bg-teal-300',
      'shipped': 'bg-green-500',
      'extra_manufacturing': 'bg-blue-500',
      'extra_finishing': 'bg-purple-500',
      'extra_packaging': 'bg-orange-500',
      'extra_boxing': 'bg-cyan-500',
    };
    return colors[state] || 'bg-gray-500';
  };

  const formatState = (state: string) => {
    return state?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN';
  };

  const getStatusBadge = () => {
    if (isEmpty && !loading) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-600">
          Empty
        </Badge>
      );
    }
    if (primaryState) {
      return (
        <Badge className={getStateColor(primaryState)}>
          {formatState(primaryState)}
        </Badge>
      );
    }
    return null;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <span className="font-mono">{boxCode}</span>
              {getStatusBadge()}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Box Info */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">{format(new Date(createdAt), 'PPP')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Active</p>
                <p className="font-medium">{isActive ? 'Yes' : 'No'}</p>
              </div>
              {boxType === 'order' && orderNumbers.length > 0 && (
                <div>
                  <p className="text-muted-foreground">Order</p>
                  <p className="font-medium font-mono">{orderNumbers.join(', ')}</p>
                </div>
              )}
            </div>

            {/* Batches Section */}
            <div>
              <h3 className="font-semibold mb-2">
                Products ({loading ? '...' : boxType === 'order' ? groupedOrderBatches.length : groupedExtraBatches.length})
              </h3>

              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : isEmpty ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No batches in this box</p>
                </div>
              ) : boxType === 'order' ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product SKU</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedOrderBatches.map((group) => (
                      <TableRow key={group.sku}>
                        <TableCell className="font-mono text-sm">{group.sku}</TableCell>
                        <TableCell>{group.name}</TableCell>
                        <TableCell className="text-right font-medium">{group.totalQty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product SKU</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead>Inv State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {groupedExtraBatches.map((group) => (
                      <TableRow key={`${group.sku}-${group.inventory_state}`}>
                        <TableCell className="font-mono text-sm">{group.sku}</TableCell>
                        <TableCell>{group.name}</TableCell>
                        <TableCell className="text-right font-medium">{group.totalQty}</TableCell>
                        <TableCell>
                          <Badge
                            variant={group.inventory_state === 'RESERVED' ? 'default' : 'outline'}
                            className={group.inventory_state === 'RESERVED' ? 'bg-amber-500' : ''}
                          >
                            {group.inventory_state}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            {isAdmin && !isEmpty && !loading && boxType === 'order' && (
              <Button
                variant="destructive"
                onClick={() => setForceEmptyConfirmOpen(true)}
                disabled={forceEmptying}
                className="sm:mr-auto"
              >
                {forceEmptying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Force Empty
              </Button>
            )}
            <Button 
              variant="outline" 
              onClick={() => {
                const baseUrl = window.location.origin;
                const html = generateBoxLabelHTML(
                  [{ boxCode, boxType }],
                  baseUrl
                );
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                window.open(url, '_blank', 'noopener,noreferrer');
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Label
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Empty Confirmation */}
      <AlertDialog open={forceEmptyConfirmOpen} onOpenChange={setForceEmptyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force Empty Box</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to force empty box {boxCode}? All batches will be reverted to their previous state. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setForceEmptyConfirmOpen(false); handleForceEmpty(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Force Empty
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}