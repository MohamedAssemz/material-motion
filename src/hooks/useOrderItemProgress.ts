import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useOrderItemProgress(orderId: string | undefined, phase: string, userId?: string) {
  const [inProgressItems, setInProgressItems] = useState<Set<string>>(new Set());

  const fetchProgress = useCallback(async () => {
    if (!orderId) return;
    const { data, error } = await supabase
      .from('order_item_progress')
      .select('order_item_id')
      .eq('order_id', orderId)
      .eq('phase', phase);

    if (!error && data) {
      setInProgressItems(new Set(data.map((d: any) => d.order_item_id)));
    }
  }, [orderId, phase]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const markInProgress = useCallback(async (orderItemId: string) => {
    if (!orderId || !userId) return;
    if (inProgressItems.has(orderItemId)) return; // Already in progress, no toggle back

    const { error } = await supabase
      .from('order_item_progress')
      .insert({
        order_id: orderId,
        order_item_id: orderItemId,
        phase,
        marked_by: userId,
      });

    if (error) {
      toast.error(error.message);
      return;
    }
    setInProgressItems((prev) => new Set(prev).add(orderItemId));
  }, [orderId, userId, phase, inProgressItems]);

  const isInProgress = useCallback((orderItemId: string) => {
    return inProgressItems.has(orderItemId);
  }, [inProgressItems]);

  return { isInProgress, markInProgress, inProgressItems };
}
