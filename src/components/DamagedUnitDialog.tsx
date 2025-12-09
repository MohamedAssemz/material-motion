import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { AlertTriangle } from 'lucide-react';

interface DamagedUnitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (action: 'redo' | 'terminated', reason: string) => void;
  unitCount: number;
}

export function DamagedUnitDialog({
  open,
  onOpenChange,
  onConfirm,
  unitCount,
}: DamagedUnitDialogProps) {
  const [action, setAction] = useState<'redo' | 'terminated'>('redo');
  const [reason, setReason] = useState('');

  const handleConfirm = () => {
    if (!reason.trim()) return;
    onConfirm(action, reason);
    setAction('redo');
    setReason('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Mark {unitCount} Unit(s) as Damaged
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Damage Action</Label>
            <RadioGroup value={action} onValueChange={(v) => setAction(v as 'redo' | 'terminated')}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="redo" id="redo" />
                <Label htmlFor="redo" className="font-normal cursor-pointer">
                  <span className="font-medium">Redo</span> - Return to Phase 1 for remanufacturing
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="terminated" id="terminated" />
                <Label htmlFor="terminated" className="font-normal cursor-pointer">
                  <span className="font-medium">Terminate</span> - Mark as lost, add new unit in Phase 1
                </Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reason">Damage Reason *</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Describe what happened..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={!reason.trim()}>
            Confirm Damage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}