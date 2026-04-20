import { useState } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { logAudit } from '@/lib/auditLog';

interface DeleteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  user: { id: string; email: string; full_name: string } | null;
}

export function DeleteUserDialog({ open, onOpenChange, onSuccess, user }: DeleteUserDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=delete`,
        { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ user_id: user.id }) }
      );
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Failed to delete user');
      toast({ title: t('toast.success'), description: t('admin.user_deleted') });
      logAudit({
        action: "user.deleted",
        entity_type: "user",
        entity_id: user.id,
        module: "admin",
        metadata: { email: user.email, full_name: user.full_name },
      });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('admin.delete_title')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('admin.delete_desc')} <strong>{user?.full_name || user?.email}</strong>? {t('admin.delete_warning')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} disabled={loading} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('admin.deleting')}</>) : t('admin.delete_title')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}