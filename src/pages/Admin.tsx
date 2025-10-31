import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserCog, Shield } from 'lucide-react';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface UserWithRoles {
  id: string;
  email: string;
  full_name: string;
  roles: string[];
}

const AVAILABLE_ROLES = [
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
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRole, setSelectedRole] = useState<{ [userId: string]: string }>({});

  useEffect(() => {
    if (!hasRole('admin')) {
      return;
    }
    fetchUsers();
  }, [hasRole]);

  const fetchUsers = async () => {
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name');

      if (profilesError) throw profilesError;

      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const usersWithRoles = profiles?.map(profile => ({
        ...profile,
        roles: userRoles?.filter(ur => ur.user_id === profile.id).map(ur => ur.role) || []
      })) || [];

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const addRole = async (userId: string, role: string) => {
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: role as AppRole });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Role assigned successfully',
      });

      fetchUsers();
      setSelectedRole(prev => ({ ...prev, [userId]: '' }));
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
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

      toast({
        title: 'Success',
        description: 'Role removed successfully',
      });

      fetchUsers();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

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
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <UserCog className="h-8 w-8 text-primary" />
          <h1 className="text-4xl font-bold">User Role Management</h1>
        </div>
        <p className="text-muted-foreground">Assign and manage user roles</p>
      </div>

      <div className="grid gap-4">
        {users.map(user => (
          <Card key={user.id} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg">{user.full_name || 'Unknown'}</h3>
                <p className="text-sm text-muted-foreground mb-3">{user.email}</p>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {user.roles.length > 0 ? (
                    user.roles.map(role => (
                      <Badge key={role} variant="secondary" className="gap-2">
                        {AVAILABLE_ROLES.find(r => r.value === role)?.label || role}
                        <button
                          onClick={() => removeRole(user.id, role)}
                          className="ml-1 hover:text-destructive"
                        >
                          ×
                        </button>
                      </Badge>
                    ))
                  ) : (
                    <span className="text-sm text-muted-foreground">No roles assigned</span>
                  )}
                </div>

                <div className="flex gap-2">
                  <Select
                    value={selectedRole[user.id] || ''}
                    onValueChange={(value) => setSelectedRole(prev => ({ ...prev, [user.id]: value }))}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select role" />
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
                    onClick={() => selectedRole[user.id] && addRole(user.id, selectedRole[user.id])}
                    disabled={!selectedRole[user.id]}
                  >
                    Add Role
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
