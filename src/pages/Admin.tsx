import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, UserCog, Shield, ArrowLeft, Plus, MoreVertical, Pencil, Trash2, UserCheck } from 'lucide-react';
import { CreateUserDialog } from '@/components/CreateUserDialog';
import { EditUserDialog } from '@/components/EditUserDialog';
import { DeleteUserDialog } from '@/components/DeleteUserDialog';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string;
  primary_role: AppRole;
  roles: string[];
}

const AVAILABLE_ROLES: { value: AppRole; label: string }[] = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'manufacture_lead', label: 'Manufacturing Lead' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'packaging_manager', label: 'Packaging Lead' },
  { value: 'packer', label: 'Packer' },
  { value: 'boxing_manager', label: 'Boxing Lead' },
  { value: 'boxer', label: 'Boxer' },
  { value: 'qc', label: 'QC Engineer' },
  { value: 'admin', label: 'Admin' },
];

export default function Admin() {
  const navigate = useNavigate();
  const { hasRole, user: currentUser } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<{ [userId: string]: string }>({});
  
  // Dialog states
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
        primary_role: (profile.primary_role || 'viewer') as AppRole,
        roles: userRoles?.filter(ur => ur.user_id === profile.id).map(ur => ur.role) || []
      })) || [];

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const updatePrimaryRole = async (userId: string, newRole: AppRole) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ primary_role: newRole })
        .eq('id', userId);

      if (error) throw error;

      // Ensure the primary role is also in user_roles
      const user = users.find(u => u.id === userId);
      if (user && !user.roles.includes(newRole)) {
        await supabase.from('user_roles').insert({ user_id: userId, role: newRole });
      }

      toast({ title: 'Success', description: 'Primary role updated' });
      fetchUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const addRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: role as AppRole });

      if (error) throw error;

      toast({ title: 'Success', description: 'Role assigned successfully' });
      fetchUsers();
      setSelectedRole(prev => ({ ...prev, [userId]: '' }));
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const removeRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role', role as AppRole);

      if (error) throw error;

      toast({ title: 'Success', description: 'Role removed successfully' });
      fetchUsers();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const getRoleLabel = (role: string) => AVAILABLE_ROLES.find(r => r.value === role)?.label || role;

  if (!hasRole('admin')) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="p-8 text-center">
          <Shield className="mx-auto h-12 w-12 text-destructive mb-4" />
          <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
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
        <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <UserCog className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">User Management</h1>
              <p className="text-sm text-muted-foreground">Create and manage user accounts</p>
            </div>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create User
          </Button>
        </div>
      </header>

      <div className="container mx-auto p-6">
        <div className="grid gap-4">
          {users.map(user => {
            const isCurrentUser = user.id === currentUser?.id;
            const additionalRoles = user.roles.filter(r => r !== user.primary_role);

            return (
              <Card key={user.id} className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">{user.full_name || 'Unknown'}</h3>
                      {isCurrentUser && (
                        <Badge variant="outline" className="text-xs">You</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">{user.email}</p>
                    
                    {/* Primary Role */}
                    <div className="mb-3">
                      <div className="flex items-center gap-2 mb-1">
                        <UserCheck className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium">Primary Role</span>
                      </div>
                      <Select
                        value={user.primary_role}
                        onValueChange={(value: AppRole) => updatePrimaryRole(user.id, value)}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_ROLES.map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Additional Roles */}
                    <div className="mb-4">
                      <span className="text-sm font-medium text-muted-foreground">Additional Roles</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {additionalRoles.length > 0 ? (
                          additionalRoles.map(role => (
                            <Badge key={role} variant="secondary" className="gap-2">
                              {getRoleLabel(role)}
                              <button
                                onClick={() => removeRole(user.id, role)}
                                className="ml-1 hover:text-destructive"
                              >
                                ×
                              </button>
                            </Badge>
                          ))
                        ) : (
                          <span className="text-sm text-muted-foreground italic">None</span>
                        )}
                      </div>
                    </div>

                    {/* Add Role */}
                    <div className="flex gap-2">
                      <Select
                        value={selectedRole[user.id] || ''}
                        onValueChange={(value) => setSelectedRole(prev => ({ ...prev, [user.id]: value }))}
                      >
                        <SelectTrigger className="w-[200px]">
                          <SelectValue placeholder="Add role..." />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_ROLES.filter(r => !user.roles.includes(r.value)).map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        onClick={() => selectedRole[user.id] && addRole(user.id, selectedRole[user.id])}
                        disabled={!selectedRole[user.id]}
                      >
                        Add
                      </Button>
                    </div>
                  </div>

                  {/* Actions Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setSelectedUser(user); setEditDialogOpen(true); }}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Credentials
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => { setSelectedUser(user); setDeleteDialogOpen(true); }}
                        className="text-destructive focus:text-destructive"
                        disabled={isCurrentUser}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
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
