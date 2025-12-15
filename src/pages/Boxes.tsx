import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Box, Edit2, Loader2, Package } from 'lucide-react';
import { format } from 'date-fns';

interface BoxData {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  current_batch?: {
    id: string;
    batch_code: string;
    current_state: string;
    quantity: number;
    batch_type: string;
    product: {
      name: string;
      sku: string;
    };
  } | null;
}

export default function Boxes() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [boxes, setBoxes] = useState<BoxData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBox, setEditingBox] = useState<BoxData | null>(null);
  const [newBoxCount, setNewBoxCount] = useState(1);
  const [customCode, setCustomCode] = useState('');

  const canManage = hasRole('manufacture_lead') || hasRole('admin');

  useEffect(() => {
    if (!canManage) {
      navigate('/');
      return;
    }
    fetchBoxes();

    const channel = supabase
      .channel('boxes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boxes' }, () => {
        fetchBoxes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canManage, navigate]);

  const fetchBoxes = async () => {
    try {
      const { data: boxesData, error: boxesError } = await supabase
        .from('boxes')
        .select('*')
        .order('box_code');

      if (boxesError) throw boxesError;

      // Fetch current batch for each box
      const boxIds = boxesData?.map(b => b.id) || [];
      const { data: batchesData } = await supabase
        .from('batches')
        .select(`
          id,
          batch_code,
          current_state,
          quantity,
          batch_type,
          box_id,
          product:products(name, sku)
        `)
        .in('box_id', boxIds)
        .eq('is_terminated', false);

      const batchByBox = new Map();
      batchesData?.forEach(batch => {
        if (batch.box_id) {
          batchByBox.set(batch.box_id, batch);
        }
      });

      const boxesWithBatches = boxesData?.map(box => ({
        ...box,
        current_batch: batchByBox.get(box.id) || null,
      })) || [];

      setBoxes(boxesWithBatches);
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

  const handleCreateBoxes = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Create boxes one at a time to use advisory lock properly
      for (let i = 0; i < newBoxCount; i++) {
        const { data: boxCode } = await supabase.rpc('generate_box_code');
        const { error } = await supabase.from('boxes').insert({
          box_code: boxCode || `BOX-${Date.now()}-${i}`,
          is_active: true,
        });
        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: `Created ${newBoxCount} box(es)`,
      });

      setDialogOpen(false);
      setNewBoxCount(1);
      fetchBoxes();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (box: BoxData) => {
    try {
      const { error } = await supabase
        .from('boxes')
        .update({ is_active: !box.is_active })
        .eq('id', box.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Box ${box.box_code} ${!box.is_active ? 'activated' : 'deactivated'}`,
      });
      fetchBoxes();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const getStateColor = (state: string) => {
    const colors: Record<string, string> = {
      'pending_rm': 'bg-yellow-500',
      'in_manufacturing': 'bg-blue-500',
      'ready_for_finishing': 'bg-blue-300',
      'in_finishing': 'bg-purple-500',
      'ready_for_packaging': 'bg-orange-500',
      'in_packaging': 'bg-indigo-500',
      'ready_for_boxing': 'bg-cyan-300',
      'in_boxing': 'bg-cyan-500',
      'ready_for_receiving': 'bg-teal-300',
      'received': 'bg-green-500',
    };
    return colors[state] || 'bg-gray-500';
  };

  const emptyBoxes = boxes.filter(b => !b.current_batch && b.is_active);
  const occupiedBoxes = boxes.filter(b => b.current_batch);
  const inactiveBoxes = boxes.filter(b => !b.is_active);

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
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <Box className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Box Management</h1>
              <p className="text-sm text-muted-foreground">Manage permanent physical boxes</p>
            </div>
          </div>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Boxes
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Boxes</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateBoxes} className="space-y-4">
                <div>
                  <Label htmlFor="count">Number of boxes to create</Label>
                  <Input
                    id="count"
                    type="number"
                    min="1"
                    max="100"
                    value={newBoxCount}
                    onChange={(e) => setNewBoxCount(parseInt(e.target.value) || 1)}
                    required
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Box codes will be auto-generated (e.g., BOX-0001)
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1">Create</Button>
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Empty Boxes</p>
                  <p className="text-2xl font-bold text-green-600">{emptyBoxes.length}</p>
                </div>
                <Box className="h-8 w-8 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Occupied Boxes</p>
                  <p className="text-2xl font-bold text-blue-600">{occupiedBoxes.length}</p>
                </div>
                <Package className="h-8 w-8 text-blue-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Inactive Boxes</p>
                  <p className="text-2xl font-bold text-muted-foreground">{inactiveBoxes.length}</p>
                </div>
                <Box className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Boxes Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Boxes ({boxes.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {boxes.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Box className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No boxes created yet</p>
                <p className="text-sm">Create boxes to start tracking physical containers</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Box Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Current Batch</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {boxes.map((box) => (
                    <TableRow key={box.id} className={!box.is_active ? 'opacity-50' : ''}>
                      <TableCell className="font-mono font-bold">{box.box_code}</TableCell>
                      <TableCell>
                        {box.current_batch ? (
                          <Badge className={getStateColor(box.current_batch.current_state)}>
                            {box.current_batch.current_state.replace(/_/g, ' ').toUpperCase()}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            EMPTY
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {box.current_batch ? (
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{box.current_batch.batch_code}</span>
                            {box.current_batch.batch_type === 'EXTRA' && (
                              <Badge variant="secondary" className="text-xs">EXTRA</Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {box.current_batch?.product ? (
                          <div>
                            <p className="text-sm">{box.current_batch.product.name}</p>
                            <p className="text-xs text-muted-foreground">{box.current_batch.product.sku}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {box.current_batch ? box.current_batch.quantity : '-'}
                      </TableCell>
                      <TableCell>{format(new Date(box.created_at), 'PP')}</TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={box.is_active}
                          onCheckedChange={() => handleToggleActive(box)}
                          disabled={!!box.current_batch}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
