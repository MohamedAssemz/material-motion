import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { ArrowLeft, Plus, Settings, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Machine {
  id: string;
  name: string;
  type: 'manufacturing' | 'packaging';
  is_active: boolean;
  created_at: string;
}

export default function Machines() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMachine, setNewMachine] = useState<{ name: string; type: 'manufacturing' | 'packaging' }>({ name: '', type: 'manufacturing' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasRole('admin')) {
      navigate('/');
      return;
    }
    fetchMachines();
  }, [hasRole, navigate]);

  const fetchMachines = async () => {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .order('type', { ascending: true })
        .order('name', { ascending: true });

      if (error) throw error;
      setMachines(data as Machine[] || []);
    } catch (error) {
      console.error('Error fetching machines:', error);
      toast.error('Failed to load machines');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMachine = async () => {
    if (!newMachine.name.trim()) {
      toast.error('Machine name is required');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('machines')
        .insert({
          name: newMachine.name.trim(),
          type: newMachine.type,
        });

      if (error) throw error;

      toast.success('Machine added successfully');
      setDialogOpen(false);
      setNewMachine({ name: '', type: 'manufacturing' });
      fetchMachines();
    } catch (error) {
      console.error('Error adding machine:', error);
      toast.error('Failed to add machine');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMachineStatus = async (machine: Machine) => {
    try {
      const { error } = await supabase
        .from('machines')
        .update({ is_active: !machine.is_active })
        .eq('id', machine.id);

      if (error) throw error;

      setMachines(prev =>
        prev.map(m => m.id === machine.id ? { ...m, is_active: !m.is_active } : m)
      );
      toast.success(`Machine ${machine.is_active ? 'deactivated' : 'activated'}`);
    } catch (error) {
      console.error('Error updating machine:', error);
      toast.error('Failed to update machine');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const manufacturingMachines = machines.filter(m => m.type === 'manufacturing');
  const packagingMachines = machines.filter(m => m.type === 'packaging');

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Settings className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Machines</h1>
              <p className="text-sm text-muted-foreground">Manage production equipment</p>
            </div>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Machine
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Machine</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Machine Name</Label>
                  <Input
                    id="name"
                    value={newMachine.name}
                    onChange={(e) => setNewMachine(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Machine A"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select
                    value={newMachine.type}
                    onValueChange={(value) => setNewMachine(prev => ({ ...prev, type: value as 'manufacturing' | 'packaging' }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="packaging">Packaging</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddMachine} disabled={submitting}>
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add Machine'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Manufacturing Machines</CardTitle>
            </CardHeader>
            <CardContent>
              {manufacturingMachines.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No manufacturing machines</p>
              ) : (
                <div className="space-y-3">
                  {manufacturingMachines.map(machine => (
                    <div key={machine.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{machine.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {machine.is_active ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                      <Switch
                        checked={machine.is_active}
                        onCheckedChange={() => toggleMachineStatus(machine)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Packaging Machines</CardTitle>
            </CardHeader>
            <CardContent>
              {packagingMachines.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No packaging machines</p>
              ) : (
                <div className="space-y-3">
                  {packagingMachines.map(machine => (
                    <div key={machine.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div>
                        <p className="font-medium">{machine.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {machine.is_active ? 'Active' : 'Inactive'}
                        </p>
                      </div>
                      <Switch
                        checked={machine.is_active}
                        onCheckedChange={() => toggleMachineStatus(machine)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}