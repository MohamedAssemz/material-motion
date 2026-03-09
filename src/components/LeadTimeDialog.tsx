import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { NumericInput } from '@/components/ui/numeric-input';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { cn } from '@/lib/utils';
import { z } from 'zod';

interface LeadTimeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (leadTimeDays: number, eta: Date) => void;
  unitCount: number;
  nextState: string;
}

const leadTimeSchema = z.object({
  leadTimeDays: z.number().min(1, 'Lead time must be at least 1 day').max(365, 'Lead time cannot exceed 365 days'),
});

export function LeadTimeDialog({ open, onOpenChange, onConfirm, unitCount, nextState }: LeadTimeDialogProps) {
  const [leadTimeDays, setLeadTimeDays] = useState<number>(7);
  const [eta, setEta] = useState<Date>(addDays(new Date(), 7));
  const [error, setError] = useState<string>('');

  const handleLeadTimeChange = (value: number) => {
    setLeadTimeDays(value);
    setEta(addDays(new Date(), value));
    setError('');
  };

  const handleEtaChange = (date: Date | undefined) => {
    if (date) {
      setEta(date);
      const days = Math.ceil((date.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      setLeadTimeDays(Math.max(1, days));
      setError('');
    }
  };

  const handleConfirm = () => {
    const validation = leadTimeSchema.safeParse({ leadTimeDays });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      return;
    }

    if (eta < new Date()) {
      setError('ETA cannot be in the past');
      return;
    }

    onConfirm(leadTimeDays, eta);
    onOpenChange(false);
  };

  const stateLabels: Record<string, string> = {
    in_manufacturing: 'Manufacturing',
    manufactured: 'Manufactured',
    waiting_for_pm: 'Waiting for PM',
    in_packaging: 'Packaging',
    packaged: 'Packaged',
    waiting_for_bm: 'Waiting for BM',
    in_boxing: 'Boxing',
    boxed: 'Boxed',
    qced: 'QC Complete',
    finished: 'Finished',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set Lead Time</DialogTitle>
          <DialogDescription>
            Set the lead time for {unitCount} unit(s) transitioning to {stateLabels[nextState] || nextState}
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="leadTime">Lead Time (days) *</Label>
            <NumericInput
              id="leadTime"
              min={1}
              max={365}
              value={leadTimeDays}
              onValueChange={(val) => handleLeadTimeChange(val ?? 1)}
              className="mt-1"
            />
          </div>

          <div>
            <Label>Estimated Completion Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal mt-1",
                    !eta && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {eta ? format(eta, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={eta}
                  onSelect={handleEtaChange}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Units will be expected to complete by <strong>{format(eta, 'PPP')}</strong>
            </p>
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <Button onClick={handleConfirm} className="flex-1">
            Confirm & Update Units
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
