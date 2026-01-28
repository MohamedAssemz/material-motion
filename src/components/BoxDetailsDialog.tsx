import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
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
import { Loader2, Printer } from 'lucide-react';
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
  
}

interface OrderBatchDetail {
  id: string;
  qr_code_data: string | null;
  quantity: number;
  current_state: string;
  product: { name: string; sku: string } | null;
}

interface ExtraBatchDetail {
  id: string;
  qr_code_data: string | null;
  quantity: number;
  current_state: string;
  inventory_state: string;
  product: { name: string; sku: string } | null;
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
}: BoxDetailsDialogProps) {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [orderBatches, setOrderBatches] = useState<OrderBatchDetail[]>([]);
  const [extraBatches, setExtraBatches] = useState<ExtraBatchDetail[]>([]);

  const isAdmin = hasRole('admin');
  const batchCount = boxType === 'order' ? orderBatches.length : extraBatches.length;
  const isEmpty = batchCount === 0;

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
            product:products(name, sku)
          `)
          .eq('box_id', boxId)
          .eq('is_terminated', false);

        if (error) throw error;
        setOrderBatches((data || []).map(b => ({
          ...b,
          product: b.product as { name: string; sku: string } | null,
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

  const getStateColor = (state: string) => {
    const colors: Record<string, string> = {
      'pending_rm': 'bg-yellow-500',
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
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Created</p>
                <p className="font-medium">{format(new Date(createdAt), 'PPP')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Active</p>
                <p className="font-medium">{isActive ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Content Type</p>
                <p className="font-medium">{contentType}</p>
              </div>
            </div>

            {/* Batches Section */}
            <div>
              <h3 className="font-semibold mb-2">
                Batches ({loading ? '...' : batchCount})
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
                      <TableHead>QR Code</TableHead>
                      <TableHead>Product SKU</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderBatches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-mono text-sm">
                          {batch.qr_code_data || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {batch.product?.sku || '-'}
                        </TableCell>
                        <TableCell>{batch.product?.name || '-'}</TableCell>
                        <TableCell className="text-right">{batch.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>QR Code</TableHead>
                      <TableHead>Product SKU</TableHead>
                      <TableHead>Product Name</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead>Inv State</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {extraBatches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell className="font-mono text-sm">
                          {batch.qr_code_data || '-'}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {batch.product?.sku || '-'}
                        </TableCell>
                        <TableCell>{batch.product?.name || '-'}</TableCell>
                        <TableCell className="text-right">{batch.quantity}</TableCell>
                        <TableCell>
                          <Badge
                            variant={batch.inventory_state === 'RESERVED' ? 'default' : 'outline'}
                            className={batch.inventory_state === 'RESERVED' ? 'bg-amber-500' : ''}
                          >
                            {batch.inventory_state}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <DialogFooter>
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
    </>
  );
}
