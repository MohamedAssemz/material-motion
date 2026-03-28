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

  const toggleProgress = useCallback(async (orderItemId: string) => {
    if (!orderId || !userId) return;

    const isCurrentlyInProgress = inProgressItems.has(orderItemId);

    if (isCurrentlyInProgress) {
      // Remove
      const { error } = await supabase
        .from('order_item_progress')
        .delete()
        .eq('order_id', orderId)
        .eq('order_item_id', orderItemId)
        .eq('phase', phase);

      if (error) {
        toast.error(error.message);
        return;
      }
      setInProgressItems((prev) => {
        const next = new Set(prev);
        next.delete(orderItemId);
        return next;
      });
    } else {
      // Add
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
    }
  }, [orderId, userId, phase, inProgressItems]);

  const isInProgress = useCallback((orderItemId: string) => {
    return inProgressItems.has(orderItemId);
  }, [inProgressItems]);

  return { isInProgress, toggleProgress, inProgressItems };
}
