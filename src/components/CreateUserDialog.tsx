import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Eye, EyeOff, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import type { Database } from '@/integrations/supabase/types';
import { logAudit } from '@/lib/auditLog';

type AppRole = Database['public']['Enums']['app_role'];

const AVAILABLE_ROLES: { value: AppRole; labelKey: string }[] = [
  { value: 'manufacturing_manager', labelKey: 'role.manufacturing_manager' },
  { value: 'finishing_manager', labelKey: 'role.finishing_manager' },
  { value: 'packaging_manager', labelKey: 'role.packaging_manager' },
  { value: 'boxing_manager', labelKey: 'role.boxing_manager' },
  { value: 'admin', labelKey: 'role.admin' },
];

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function CreateUserDialog({ open, onOpenChange, onSuccess }: CreateUserDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    fullName: '',
    primaryRole: 'manufacturing_manager' as AppRole,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=create`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password,
            full_name: formData.fullName,
            primary_role: formData.primaryRole,
          }),
        }
      );

      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || 'Failed to create user');

      toast({ title: t('toast.success'), description: t('admin.user_created') });
      logAudit({
        action: "user.created",
        entity_type: "user",
        entity_id: data?.user?.id ?? formData.email,
        module: "admin",
        metadata: { email: formData.email, full_name: formData.fullName, primary_role: formData.primaryRole },
      });
      setFormData({ email: '', password: '', fullName: '', primaryRole: 'manufacturing_manager' });
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            {t('admin.create_user')}
          </DialogTitle>
          <DialogDescription>{t('admin.create_desc')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">{t('admin.full_name')}</Label>
            <Input id="fullName" type="text" placeholder="John Doe" value={formData.fullName} onChange={(e) => setFormData({ ...formData, fullName: e.target.value })} required disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('admin.email')}</Label>
            <Input id="email" type="email" placeholder="user@company.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t('admin.password')}</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required disabled={loading} minLength={6} className="pr-10" />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="primaryRole">{t('admin.primary_role')}</Label>
            <Select value={formData.primaryRole} onValueChange={(value: AppRole) => setFormData({ ...formData, primaryRole: value })} disabled={loading}>
              <SelectTrigger><SelectValue placeholder={t('common.select')} /></SelectTrigger>
              <SelectContent>
                {AVAILABLE_ROLES.map((role) => (
                  <SelectItem key={role.value} value={role.value}>{t(role.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={loading}>
              {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('admin.creating')}</>) : t('admin.create_user')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
