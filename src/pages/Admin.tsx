import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, UserCog, Shield, ArrowLeft, Plus, Pencil, Trash2, X } from 'lucide-react';
import { CreateUserDialog } from '@/components/CreateUserDialog';
import { EditUserDialog } from '@/components/EditUserDialog';
import { DeleteUserDialog } from '@/components/DeleteUserDialog';
import type { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string;
  primary_role: AppRole;
  roles: string[];
}

const ROLE_KEYS: Record<string, string> = {
  manufacturing_manager: 'role.manufacturing_manager',
  finishing_manager: 'role.finishing_manager',
  packaging_manager: 'role.packaging_manager',
  boxing_manager: 'role.boxing_manager',
  admin: 'role.admin',
};

const AVAILABLE_ROLES: { value: AppRole; labelKey: string }[] = [
  { value: 'manufacturing_manager', labelKey: 'role.manufacturing_manager' },
  { value: 'finishing_manager', labelKey: 'role.finishing_manager' },
  { value: 'packaging_manager', labelKey: 'role.packaging_manager' },
  { value: 'boxing_manager', labelKey: 'role.boxing_manager' },
  { value: 'admin', labelKey: 'role.admin' },
];

export default function Admin() {
  const navigate = useNavigate();
  const { hasRole, user: currentUser } = useAuth();
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);

  useEffect(() => {
    if (!hasRole('admin')) return;
    fetchUsers();
  }, [hasRole]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, primary_role');

      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        primary_role: (profile.primary_role || 'manufacturing_manager') as AppRole,
        roles: userRoles?.filter(ur => ur.user_id === profile.id).map(ur => ur.role) || []
      })) || [];

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updatePrimaryRole = async (userId: string, newRole: AppRole) => {
    setUpdatingRole(userId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users?action=update-primary-role`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ user_id: userId, primary_role: newRole }),
        }
      );

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || 'Failed to update primary role');
      }

      toast({ title: t('toast.success'), description: t('admin.role_updated') });
      fetchUsers();
    } catch (error: any) {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    } finally {
      setUpdatingRole(null);
    }
  };

  const addRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: role as AppRole });

      if (error) throw error;

      toast({ title: t('toast.success'), description: t('admin.role_added') });
      fetchUsers();
    } catch (error: any) {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    }
  };

  const removeRole = async (userId: string, role: string, isPrimary: boolean) => {
    if (isPrimary) {
      toast({ title: t('admin.cannot_remove'), description: t('admin.cannot_remove_primary'), variant: 'destructive' });
      return;
    }
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role as AppRole);

      if (error) throw error;

      toast({ title: t('toast.success'), description: t('admin.role_removed') });
      fetchUsers();
    } catch (error: any) {
      toast({ title: t('toast.error'), description: error.message, variant: 'destructive' });
    }
  };

  const getRoleLabel = (role: string) => t(ROLE_KEYS[role] || role);

  if (!hasRole('admin')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="p-8 text-center">
          <Shield className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">{t('admin.access_denied')}</h2>
          <p className="text-muted-foreground">{t('admin.no_permission')}</p>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-3">
          <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className={cn("h-5 w-5", isRTL && "rotate-180")} />
            </Button>
            <UserCog className="h-5 w-5 text-primary" />
            <div className={isRTL ? "text-right" : ""}>
              <h1 className="text-lg font-semibold">{t('admin.user_management')}</h1>
              <p className="text-xs text-muted-foreground">{users.length} {t('admin.users_count')}</p>
            </div>
          </div>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            {t('admin.create_user')}
          </Button>
        </div>
      </header>

      <div className="container mx-auto p-4">
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[250px]">{t('admin.user_col')}</TableHead>
                <TableHead className="w-[150px]">{t('admin.primary_role')}</TableHead>
                <TableHead>{t('admin.additional_roles')}</TableHead>
                <TableHead className="w-[80px] text-end">{t('admin.actions_col')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => {
                const isCurrentUser = user.id === currentUser?.id;
                const additionalRoles = user.roles.filter(r => r !== user.primary_role);
                const availableToAdd = AVAILABLE_ROLES.filter(r => !user.roles.includes(r.value));
                const adminCount = users.filter(u => u.primary_role === 'admin').length;
                const isLastAdmin = user.primary_role === 'admin' && adminCount === 1;

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="font-medium text-sm flex items-center gap-1.5">
                            {user.full_name || 'Unknown'}
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">{t('admin.you')}</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Select
                          value={user.primary_role}
                          onValueChange={(value: AppRole) => updatePrimaryRole(user.id, value)}
                          disabled={updatingRole === user.id || isLastAdmin}
                        >
                          <SelectTrigger className="h-8 w-[130px] text-xs">
                            {updatingRole === user.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <SelectValue />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {AVAILABLE_ROLES.map(role => (
                              <SelectItem key={role.value} value={role.value} className="text-xs">
                                {t(role.labelKey)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {isLastAdmin && (
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap">{t('admin.last_admin')}</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {additionalRoles.map(role => (
                          <Badge key={role} variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                            {getRoleLabel(role)}
                            <button
                              onClick={() => removeRole(user.id, role, false)}
                              className="hover:text-destructive ml-0.5"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                        {availableToAdd.length > 0 && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-5 w-5 p-0 rounded-full">
                                <Plus className="h-3 w-3" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-40 p-1" align="start">
                              <div className="flex flex-col">
                                {availableToAdd.map(role => (
                                  <Button
                                    key={role.value}
                                    variant="ghost"
                                    size="sm"
                                    className="justify-start text-xs h-7"
                                    onClick={() => addRole(user.id, role.value)}
                                  >
                                    {t(role.labelKey)}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        {additionalRoles.length === 0 && availableToAdd.length === 0 && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-end">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => { setSelectedUser(user); setEditDialogOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => { setSelectedUser(user); setDeleteDialogOpen(true); }}
                          disabled={isCurrentUser || isLastAdmin}
                          title={isLastAdmin ? t('admin.cannot_delete_last') : undefined}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      <CreateUserDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={fetchUsers}
      />

      <EditUserDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={fetchUsers}
        user={selectedUser}
      />

      <DeleteUserDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={fetchUsers}
        user={selectedUser}
      />
    </div>
  );
}
