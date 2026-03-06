import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { AlertTriangle, RotateCcw, X } from 'lucide-react';

interface FlaggedBatch {
  id: string;
  batch_code: string;
  product_name: string;
  product_sku: string;
  quantity: number;
  current_state: string;
  is_flagged: boolean;
  is_redo: boolean;
}

interface FlaggedItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batches: FlaggedBatch[];
  orderId: string;
  onRefresh: () => void;
}

export function FlaggedItemsDialog({ 
  open, 
  onOpenChange, 
  batches, 
  orderId,
  onRefresh 
}: FlaggedItemsDialogProps) {
  const { user } = useAuth();
  const [selectedBatches, setSelectedBatches] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Map<string, number>>(new Map());
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'redo' | 'terminate' | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleToggleBatch = (batchId: string) => {
    setSelectedBatches(prev => {
      const newSet = new Set(prev);
      if (newSet.has(batchId)) {
        newSet.delete(batchId);
      } else {
        newSet.add(batchId);
        // Set default quantity to full batch
        const batch = batches.find(b => b.id === batchId);
        if (batch && !quantities.has(batchId)) {
          setQuantities(prev => new Map(prev).set(batchId, batch.quantity));
        }
      }
      return newSet;
    });
  };

  const handleQuantityChange = (batchId: string, qty: number, max: number) => {
    setQuantities(prev => {
      const newMap = new Map(prev);
      newMap.set(batchId, Math.min(Math.max(0, qty), max));
      return newMap;
    });
  };

  const handleSubmit = async () => {
    if (selectedBatches.size === 0) {
      toast.error('Please select at least one item');
      return;
    }
    if (!action) {
      toast.error('Please choose an action');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    setSubmitting(true);
    try {
      for (const batchId of selectedBatches) {
        const batch = batches.find(b => b.id === batchId);
        if (!batch) continue;

        const qty = quantities.get(batchId) || batch.quantity;

        if (action === 'redo') {
          // Mark as redo - move back to in_manufacturing
          if (qty === batch.quantity) {
            await supabase
              .from('order_batches')
              .update({
                current_state: 'in_manufacturing',
                is_redo: true,
                redo_reason: reason.trim(),
                redo_by: user?.id,
                is_flagged: false,
              })
              .eq('id', batchId);
          } else {
            // Split batch
            await supabase
              .from('order_batches')
              .update({ quantity: batch.quantity - qty })
              .eq('id', batchId);

            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            await supabase.from('order_batches').insert({
              qr_code_data: batchCode,
              order_id: orderId,
              product_id: batch.id,
              current_state: 'in_manufacturing',
              quantity: qty,
              is_redo: true,
              redo_reason: reason.trim(),
              redo_by: user?.id,
              created_by: user?.id,
            });
          }
        } else if (action === 'terminate') {
          // Mark as terminated
          if (qty === batch.quantity) {
            await supabase
              .from('order_batches')
              .update({
                is_terminated: true,
                terminated_reason: reason.trim(),
                terminated_by: user?.id,
                is_flagged: false,
              })
              .eq('id', batchId);
          } else {
            // Split batch
            await supabase
              .from('order_batches')
              .update({ quantity: batch.quantity - qty })
              .eq('id', batchId);

            const { data: batchCode } = await supabase.rpc('generate_batch_code');
            await supabase.from('order_batches').insert({
              qr_code_data: batchCode,
              order_id: orderId,
              product_id: batch.id,
              current_state: batch.current_state,
              quantity: qty,
              is_terminated: true,
              terminated_reason: reason.trim(),
              terminated_by: user?.id,
              created_by: user?.id,
            });
          }
        }
      }

      const totalQty = Array.from(selectedBatches).reduce((sum, id) => {
        const batch = batches.find(b => b.id === id);
        return sum + (quantities.get(id) || batch?.quantity || 0);
      }, 0);

      toast.success(`${totalQty} item(s) marked as ${action}`);
      setSelectedBatches(new Set());
      setQuantities(new Map());
      setReason('');
      setAction(null);
      onRefresh();
      onOpenChange(false);
    } catch (error) {
      console.error('Error processing flagged items:', error);
      toast.error('Failed to process items');
    } finally {
      setSubmitting(false);
    }
  };

  const flaggedBatches = batches.filter(b => b.is_flagged);
  const redoBatches = batches.filter(b => b.is_redo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-warning" />
            Flagged & Redo Items
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Flagged Items Section */}
          {flaggedBatches.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Flagged Items ({flaggedBatches.length})
              </h4>
              <div className="space-y-2">
                {flaggedBatches.map((batch) => (
                  <div 
                    key={batch.id}
                    className={`flex items-center gap-3 p-3 border rounded-lg ${
                      selectedBatches.has(batch.id) ? 'border-primary bg-primary/5' : ''
                    }`}
                  >
                    <Checkbox
                      checked={selectedBatches.has(batch.id)}
                      onCheckedChange={() => handleToggleBatch(batch.id)}
                    />
                    <div className="flex-1">
                      <p className="font-medium">{batch.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {batch.product_sku} · {batch.batch_code}
                      </p>
                    </div>
                    {selectedBatches.has(batch.id) ? (
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Qty:</Label>
                        <Input
                          type="number"
                          min={1}
                          max={batch.quantity}
                          value={quantities.get(batch.id) || batch.quantity}
                          onChange={(e) => handleQuantityChange(batch.id, parseInt(e.target.value) || 0, batch.quantity)}
                          className="w-20"
                        />
                        <span className="text-sm text-muted-foreground">/ {batch.quantity}</span>
                      </div>
                    ) : (
                      <Badge variant="secondary">{batch.quantity}</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redo Required Section */}
          {redoBatches.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-medium flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-primary" />
                Redo Required ({redoBatches.length})
              </h4>
              <div className="space-y-2">
                {redoBatches.map((batch) => (
                  <div 
                    key={batch.id}
                    className="flex items-center gap-3 p-3 border rounded-lg border-primary/30 bg-primary/5"
                  >
                    <div className="flex-1">
                      <p className="font-medium">{batch.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {batch.product_sku} · {batch.batch_code}
                      </p>
                    </div>
                    <Badge variant="outline">{batch.quantity} units</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action form */}
          {selectedBatches.size > 0 && (
            <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
              <div className="flex gap-3">
                <Button
                  variant={action === 'redo' ? 'default' : 'outline'}
                  onClick={() => setAction('redo')}
                  className="flex-1"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Mark as Redo
                </Button>
                <Button
                  variant={action === 'terminate' ? 'destructive' : 'outline'}
                  onClick={() => setAction('terminate')}
                  className="flex-1"
                >
                  <X className="h-4 w-4 mr-2" />
                  Terminate
                </Button>
              </div>

              {action && (
                <>
                  <div>
                    <Label>Reason *</Label>
                    <Textarea
                      placeholder={`Enter reason for ${action}...`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={handleSubmit} disabled={submitting}>
                      {submitting ? 'Processing...' : 'Confirm'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {flaggedBatches.length === 0 && redoBatches.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No flagged or redo items
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
