import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle, RotateCcw, XCircle, Flag } from 'lucide-react';

export type BatchActionType = 'terminate' | 'flag_terminate' | 'redo';

interface BatchActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (action: BatchActionType, reason: string) => void;
  itemCount: number;
  currentState: string;
}

export function BatchActionDialog({
  open,
  onOpenChange,
  onConfirm,
  itemCount,
  currentState,
}: BatchActionDialogProps) {
  const [action, setAction] = useState<BatchActionType>('terminate');
  const [reason, setReason] = useState('');

  const canTerminate = ['in_manufacturing', 'manufactured', 'in_packaging'].includes(currentState);
  const canRedo = ['manufactured', 'in_packaging', 'packaged'].includes(currentState);
  const canFlagTerminate = ['in_manufacturing', 'manufactured', 'in_packaging'].includes(currentState);

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(action, reason);
    setAction('terminate');
    setReason('');
    onOpenChange(false);
  };

  const getActionDescription = () => {
    switch (action) {
      case 'terminate':
        return 'Items will be marked as terminated. The termination counter will increase and replacement items will be created in "Waiting for RM" state.';
      case 'flag_terminate':
        return 'Items will be flagged and returned to "In Manufacturing" state for review and possible repair.';
      case 'redo':
        return 'Items will be sent back to "In Manufacturing" state for reprocessing with a redo flag.';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Batch Action - {itemCount} Item(s)
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Select Action</Label>
            <RadioGroup value={action} onValueChange={(v) => setAction(v as BatchActionType)}>
              {canTerminate && (
                <div className="flex items-start space-x-2 p-2 rounded-md border hover:bg-muted/50">
                  <RadioGroupItem value="terminate" id="terminate" className="mt-1" />
                  <Label htmlFor="terminate" className="font-normal cursor-pointer flex-1">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <span className="font-medium">Terminate</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Mark as lost, create replacement in Phase 1
                    </p>
                  </Label>
                </div>
              )}
              {canFlagTerminate && (
                <div className="flex items-start space-x-2 p-2 rounded-md border hover:bg-muted/50">
                  <RadioGroupItem value="flag_terminate" id="flag_terminate" className="mt-1" />
                  <Label htmlFor="flag_terminate" className="font-normal cursor-pointer flex-1">
                    <div className="flex items-center gap-2">
                      <Flag className="h-4 w-4 text-warning" />
                      <span className="font-medium">Flag for Review</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Return to Manufacturing for inspection
                    </p>
                  </Label>
                </div>
              )}
              {canRedo && (
                <div className="flex items-start space-x-2 p-2 rounded-md border hover:bg-muted/50">
                  <RadioGroupItem value="redo" id="redo" className="mt-1" />
                  <Label htmlFor="redo" className="font-normal cursor-pointer flex-1">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-4 w-4 text-primary" />
                      <span className="font-medium">Send for Redo</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Return to Manufacturing with redo flag
                    </p>
                  </Label>
                </div>
              )}
            </RadioGroup>
          </div>

          <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
            {getActionDescription()}
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Reason *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe why this action is needed..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            variant={action === 'terminate' ? 'destructive' : 'default'} 
            onClick={handleConfirm} 
            disabled={!reason.trim()}
          >
            Confirm {action === 'terminate' ? 'Termination' : action === 'flag_terminate' ? 'Flag' : 'Redo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
