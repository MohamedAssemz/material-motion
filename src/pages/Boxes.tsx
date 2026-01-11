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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Box, Loader2, Package } from 'lucide-react';
import { format } from 'date-fns';

interface OrderBoxData {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  items_list: any[];
  current_batch?: {
    id: string;
    current_state: string;
    quantity: number;
    product: {
      name: string;
      sku: string;
    };
  } | null;
}

interface ExtraBoxData {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  items_list: any[];
}

export default function Boxes() {
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [orderBoxes, setOrderBoxes] = useState<OrderBoxData[]>([]);
  const [extraBoxes, setExtraBoxes] = useState<ExtraBoxData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extraDialogOpen, setExtraDialogOpen] = useState(false);
  const [newBoxCount, setNewBoxCount] = useState(1);
  const [newExtraBoxCount, setNewExtraBoxCount] = useState(1);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_boxes' }, () => {
        fetchBoxes();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canManage, navigate]);

  const fetchBoxes = async () => {
    try {
      // Fetch order boxes
      const { data: orderBoxesData, error: orderBoxesError } = await supabase
        .from('boxes')
        .select('*')
        .order('box_code');

      if (orderBoxesError) throw orderBoxesError;

      // Fetch current batch for each order box from order_batches
      const boxIds = orderBoxesData?.map(b => b.id) || [];
      const { data: batchesData } = await supabase
        .from('order_batches')
        .select(`
          id,
          current_state,
          quantity,
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

      const orderBoxesWithBatches: OrderBoxData[] = (orderBoxesData || []).map(box => ({
        id: box.id,
        box_code: box.box_code,
        is_active: box.is_active,
        created_at: box.created_at,
        content_type: box.content_type || 'EMPTY',
        items_list: Array.isArray(box.items_list) ? box.items_list : [],
        current_batch: batchByBox.get(box.id) || null,
      }));

      setOrderBoxes(orderBoxesWithBatches);

      // Fetch extra boxes
      const { data: extraBoxesData, error: extraBoxesError } = await supabase
        .from('extra_boxes')
        .select('*')
        .order('box_code');

      if (extraBoxesError) throw extraBoxesError;

      const extraBoxesMapped: ExtraBoxData[] = (extraBoxesData || []).map(box => ({
        id: box.id,
        box_code: box.box_code,
        is_active: box.is_active,
        created_at: box.created_at,
        content_type: box.content_type || 'EMPTY',
        items_list: Array.isArray(box.items_list) ? box.items_list : [],
      }));

      setExtraBoxes(extraBoxesMapped);
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

  const handleCreateOrderBoxes = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
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
        description: `Created ${newBoxCount} order box(es)`,
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

  const handleCreateExtraBoxes = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      for (let i = 0; i < newExtraBoxCount; i++) {
        const { data: boxCode } = await supabase.rpc('generate_extra_box_code');
        const { error } = await supabase.from('extra_boxes').insert({
          box_code: boxCode || `EBOX-${Date.now()}-${i}`,
          is_active: true,
        });
        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: `Created ${newExtraBoxCount} extra box(es)`,
      });

      setExtraDialogOpen(false);
      setNewExtraBoxCount(1);
      fetchBoxes();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleToggleOrderBoxActive = async (box: OrderBoxData) => {
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

  const handleToggleExtraBoxActive = async (box: ExtraBoxData) => {
    try {
      const { error } = await supabase
        .from('extra_boxes')
        .update({ is_active: !box.is_active })
        .eq('id', box.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Extra Box ${box.box_code} ${!box.is_active ? 'activated' : 'deactivated'}`,
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
      'ready_for_shipment': 'bg-teal-300',
      'in_shipment': 'bg-green-500',
    };
    return colors[state] || 'bg-gray-500';
  };

  const emptyOrderBoxes = orderBoxes.filter(b => !b.current_batch && b.is_active);
  const occupiedOrderBoxes = orderBoxes.filter(b => b.current_batch);
  const inactiveOrderBoxes = orderBoxes.filter(b => !b.is_active);

  const emptyExtraBoxes = extraBoxes.filter(b => (!b.items_list || b.items_list.length === 0) && b.is_active);
  const occupiedExtraBoxes = extraBoxes.filter(b => b.items_list && b.items_list.length > 0);
  const inactiveExtraBoxes = extraBoxes.filter(b => !b.is_active);

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
              <p className="text-sm text-muted-foreground">Manage order and extra inventory boxes</p>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto p-6 space-y-6">
        <Tabs defaultValue="order" className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="order">Order Boxes ({orderBoxes.length})</TabsTrigger>
            <TabsTrigger value="extra">Extra Boxes ({extraBoxes.length})</TabsTrigger>
          </TabsList>

          {/* Order Boxes Tab */}
          <TabsContent value="order" className="space-y-6">
            <div className="flex justify-end">
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Order Boxes
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Order Boxes</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateOrderBoxes} className="space-y-4">
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

            {/* Order Boxes Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Empty Boxes</p>
                      <p className="text-2xl font-bold text-green-600">{emptyOrderBoxes.length}</p>
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
                      <p className="text-2xl font-bold text-blue-600">{occupiedOrderBoxes.length}</p>
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
                      <p className="text-2xl font-bold text-muted-foreground">{inactiveOrderBoxes.length}</p>
                    </div>
                    <Box className="h-8 w-8 text-muted-foreground opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Order Boxes Table */}
            <Card>
              <CardHeader>
                <CardTitle>Order Boxes ({orderBoxes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {orderBoxes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Box className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No order boxes created yet</p>
                    <p className="text-sm">Create boxes to start tracking order batches</p>
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
                      {orderBoxes.map((box) => (
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
                              <span className="font-mono text-sm">Batch</span>
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
                              onCheckedChange={() => handleToggleOrderBoxActive(box)}
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
          </TabsContent>

          {/* Extra Boxes Tab */}
          <TabsContent value="extra" className="space-y-6">
            <div className="flex justify-end">
              <Dialog open={extraDialogOpen} onOpenChange={setExtraDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Extra Boxes
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Extra Boxes</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateExtraBoxes} className="space-y-4">
                    <div>
                      <Label htmlFor="extra-count">Number of boxes to create</Label>
                      <Input
                        id="extra-count"
                        type="number"
                        min="1"
                        max="100"
                        value={newExtraBoxCount}
                        onChange={(e) => setNewExtraBoxCount(parseInt(e.target.value) || 1)}
                        required
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Box codes will be auto-generated (e.g., EBOX-0001)
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button type="submit" className="flex-1">Create</Button>
                      <Button type="button" variant="outline" onClick={() => setExtraDialogOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Extra Boxes Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Empty Boxes</p>
                      <p className="text-2xl font-bold text-green-600">{emptyExtraBoxes.length}</p>
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
                      <p className="text-2xl font-bold text-amber-600">{occupiedExtraBoxes.length}</p>
                    </div>
                    <Package className="h-8 w-8 text-amber-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Inactive Boxes</p>
                      <p className="text-2xl font-bold text-muted-foreground">{inactiveExtraBoxes.length}</p>
                    </div>
                    <Box className="h-8 w-8 text-muted-foreground opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Extra Boxes Table */}
            <Card>
              <CardHeader>
                <CardTitle>Extra Boxes ({extraBoxes.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {extraBoxes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Box className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    <p>No extra boxes created yet</p>
                    <p className="text-sm">Create extra boxes to store surplus inventory</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Box Code</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Items</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extraBoxes.map((box) => {
                        const itemCount = box.items_list?.length || 0;
                        return (
                          <TableRow key={box.id} className={!box.is_active ? 'opacity-50' : ''}>
                            <TableCell className="font-mono font-bold">{box.box_code}</TableCell>
                            <TableCell>
                              {itemCount > 0 ? (
                                <Badge className="bg-amber-500">
                                  OCCUPIED
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  EMPTY
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {itemCount > 0 ? (
                                <span className="text-sm">{itemCount} batch(es)</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell>{format(new Date(box.created_at), 'PP')}</TableCell>
                            <TableCell className="text-right">
                              <Switch
                                checked={box.is_active}
                                onCheckedChange={() => handleToggleExtraBoxActive(box)}
                                disabled={itemCount > 0}
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
