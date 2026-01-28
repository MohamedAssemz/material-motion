import { useState, useEffect, useCallback } from 'react';
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
import { ArrowLeft, Plus, Box, Loader2, Package, Printer, QrCode } from 'lucide-react';
import { format } from 'date-fns';
import { BoxDetailsDialog } from '@/components/BoxDetailsDialog';
import { BoxLabelPrintDialog } from '@/components/BoxLabelPrintDialog';
import { BoxLookupScanDialog } from '@/components/BoxLookupScanDialog';
import { useBoxScanner } from '@/hooks/useBoxScanner';

interface OrderBoxData {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  items_list: any[];
  batch_count: number;
  total_quantity: number;
  primary_state: string | null;
}

interface ExtraBoxData {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  items_list: any[];
  batch_count: number;
  total_quantity: number;
  primary_state: string | null;
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

  // Details dialog state
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedBox, setSelectedBox] = useState<{
    boxType: 'order' | 'extra';
    boxId: string;
    boxCode: string;
    createdAt: string;
    isActive: boolean;
    contentType: string;
    primaryState: string | null;
  } | null>(null);

  // Print dialog state
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printBoxType, setPrintBoxType] = useState<'order' | 'extra'>('order');

  // Scan lookup dialog state
  const [scanDialogOpen, setScanDialogOpen] = useState(false);

  const canManage = hasRole('manufacture_lead') || hasRole('admin');

  // Helper to open box details
  const openBoxDetails = useCallback((
    boxType: 'order' | 'extra',
    boxId: string,
    boxCode: string,
    createdAt: string,
    isActive: boolean,
    contentType: string,
    primaryState: string | null
  ) => {
    setSelectedBox({
      boxType,
      boxId,
      boxCode,
      createdAt,
      isActive,
      contentType,
      primaryState,
    });
    setDetailsOpen(true);
    toast({
      title: 'Box Found',
      description: `Opened details for ${boxCode}`,
    });
  }, [toast]);

  // Scanner handler - opens box details when scanned on this page
  // Supports: raw box codes, URLs containing box codes, and batch codes
  const handleBoxScan = useCallback(async (rawCode: string) => {
    const normalized = rawCode.trim().toUpperCase();
    
    // Extract box code from URL or raw input: BOX-#### or EBOX-####
    const boxMatch = normalized.match(/(EBOX-\d+|BOX-\d+)/);
    // Extract batch code from URL or raw input: B-XXXXXXXX or EB-XXXXXXXX
    const batchMatch = normalized.match(/(EB-[A-Z0-9]{8}|B-[A-Z0-9]{8})/);
    
    // Priority: box code first, then batch code
    if (boxMatch) {
      const boxCode = boxMatch[1];
      
      // Try to find in local order boxes first (fast path)
      const orderBox = orderBoxes.find(b => b.box_code.toUpperCase() === boxCode);
      if (orderBox) {
        openBoxDetails('order', orderBox.id, orderBox.box_code, orderBox.created_at, orderBox.is_active, orderBox.content_type, orderBox.primary_state);
        return;
      }
      
      // Try to find in local extra boxes
      const extraBox = extraBoxes.find(b => b.box_code.toUpperCase() === boxCode);
      if (extraBox) {
        openBoxDetails('extra', extraBox.id, extraBox.box_code, extraBox.created_at, extraBox.is_active, extraBox.content_type, extraBox.primary_state);
        return;
      }
      
      // Not in local lists - query database (handles stale data / pagination)
      // Try order boxes table
      const { data: dbOrderBox } = await supabase
        .from('boxes')
        .select('id, box_code, is_active, created_at, content_type')
        .eq('box_code', boxCode)
        .maybeSingle();
      
      if (dbOrderBox) {
        openBoxDetails('order', dbOrderBox.id, dbOrderBox.box_code, dbOrderBox.created_at, dbOrderBox.is_active, dbOrderBox.content_type || 'EMPTY', null);
        return;
      }
      
      // Try extra boxes table
      const { data: dbExtraBox } = await supabase
        .from('extra_boxes')
        .select('id, box_code, is_active, created_at, content_type')
        .eq('box_code', boxCode)
        .maybeSingle();
      
      if (dbExtraBox) {
        openBoxDetails('extra', dbExtraBox.id, dbExtraBox.box_code, dbExtraBox.created_at, dbExtraBox.is_active, dbExtraBox.content_type || 'EMPTY', null);
        return;
      }
      
      // Box not found
      toast({
        title: 'Box Not Found',
        description: `No box found with code "${boxCode}"`,
        variant: 'destructive',
      });
      return;
    }
    
    // Handle batch code scan - find which box contains this batch
    if (batchMatch) {
      const batchCode = batchMatch[1];
      
      // Check if it's an order batch (B-XXXXXXXX)
      if (batchCode.startsWith('B-')) {
        const { data: orderBatch } = await supabase
          .from('order_batches')
          .select('box_id, box:boxes(id, box_code, is_active, created_at, content_type)')
          .eq('qr_code_data', batchCode)
          .eq('is_terminated', false)
          .maybeSingle();
        
        if (orderBatch) {
          if (orderBatch.box_id && orderBatch.box) {
            const box = orderBatch.box as any;
            openBoxDetails('order', box.id, box.box_code, box.created_at, box.is_active, box.content_type || 'EMPTY', null);
          } else {
            toast({
              title: 'Batch Not In Box',
              description: `Batch ${batchCode} is not currently assigned to a box`,
              variant: 'destructive',
            });
          }
          return;
        }
      }
      
      // Check if it's an extra batch (EB-XXXXXXXX)
      if (batchCode.startsWith('EB-')) {
        const { data: extraBatch } = await supabase
          .from('extra_batches')
          .select('box_id, box:extra_boxes(id, box_code, is_active, created_at, content_type)')
          .eq('qr_code_data', batchCode)
          .maybeSingle();
        
        if (extraBatch) {
          if (extraBatch.box_id && extraBatch.box) {
            const box = extraBatch.box as any;
            openBoxDetails('extra', box.id, box.box_code, box.created_at, box.is_active, box.content_type || 'EMPTY', null);
          } else {
            toast({
              title: 'Batch Not In Box',
              description: `Batch ${batchCode} is not currently assigned to a box`,
              variant: 'destructive',
            });
          }
          return;
        }
      }
      
      // Batch not found
      toast({
        title: 'Batch Not Found',
        description: `No batch found with code "${batchCode}"`,
        variant: 'destructive',
      });
      return;
    }
    
    // Unrecognized scan format
    toast({
      title: 'Unrecognized Scan',
      description: `Could not parse box or batch code from "${normalized.slice(0, 30)}${normalized.length > 30 ? '...' : ''}"`,
      variant: 'destructive',
    });
  }, [orderBoxes, extraBoxes, toast, openBoxDetails]);

  // Page-level scanner disabled - scanning only works inside the BoxLookupScanDialog
  // useBoxScanner({
  //   onScan: handleBoxScan,
  //   enabled: !detailsOpen && !dialogOpen && !extraDialogOpen && !printDialogOpen && !scanDialogOpen,
  // });

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => {
        fetchBoxes();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_batches' }, () => {
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

      // Fetch order batches to get counts and states per box
      const orderBoxIds = orderBoxesData?.map(b => b.id) || [];
      const { data: orderBatchesData } = await supabase
        .from('order_batches')
        .select('box_id, quantity, current_state')
        .in('box_id', orderBoxIds)
        .eq('is_terminated', false);

      // Aggregate batch data per box
      const orderBatchStats = new Map<string, { count: number; total: number; state: string | null }>();
      orderBatchesData?.forEach(batch => {
        if (batch.box_id) {
          const existing = orderBatchStats.get(batch.box_id) || { count: 0, total: 0, state: null };
          existing.count += 1;
          existing.total += batch.quantity;
          if (!existing.state) existing.state = batch.current_state;
          orderBatchStats.set(batch.box_id, existing);
        }
      });

      const orderBoxesMapped: OrderBoxData[] = (orderBoxesData || []).map(box => {
        const stats = orderBatchStats.get(box.id) || { count: 0, total: 0, state: null };
        return {
          id: box.id,
          box_code: box.box_code,
          is_active: box.is_active,
          created_at: box.created_at,
          content_type: box.content_type || 'EMPTY',
          items_list: Array.isArray(box.items_list) ? box.items_list : [],
          batch_count: stats.count,
          total_quantity: stats.total,
          primary_state: stats.state,
        };
      });

      setOrderBoxes(orderBoxesMapped);

      // Fetch extra boxes
      const { data: extraBoxesData, error: extraBoxesError } = await supabase
        .from('extra_boxes')
        .select('*')
        .order('box_code');

      if (extraBoxesError) throw extraBoxesError;

      // Fetch extra batches to get counts and states per box
      const extraBoxIds = extraBoxesData?.map(b => b.id) || [];
      const { data: extraBatchesData } = await supabase
        .from('extra_batches')
        .select('box_id, quantity, current_state')
        .in('box_id', extraBoxIds);

      // Aggregate batch data per box
      const extraBatchStats = new Map<string, { count: number; total: number; state: string | null }>();
      extraBatchesData?.forEach(batch => {
        if (batch.box_id) {
          const existing = extraBatchStats.get(batch.box_id) || { count: 0, total: 0, state: null };
          existing.count += 1;
          existing.total += batch.quantity;
          if (!existing.state) existing.state = batch.current_state;
          extraBatchStats.set(batch.box_id, existing);
        }
      });

      const extraBoxesMapped: ExtraBoxData[] = (extraBoxesData || []).map(box => {
        const stats = extraBatchStats.get(box.id) || { count: 0, total: 0, state: null };
        return {
          id: box.id,
          box_code: box.box_code,
          is_active: box.is_active,
          created_at: box.created_at,
          content_type: box.content_type || 'EMPTY',
          items_list: Array.isArray(box.items_list) ? box.items_list : [],
          batch_count: stats.count,
          total_quantity: stats.total,
          primary_state: stats.state,
        };
      });

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

  const handleToggleOrderBoxActive = async (box: OrderBoxData, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
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

  const handleToggleExtraBoxActive = async (box: ExtraBoxData, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click
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

  const handleOrderBoxClick = (box: OrderBoxData) => {
    setSelectedBox({
      boxType: 'order',
      boxId: box.id,
      boxCode: box.box_code,
      createdAt: box.created_at,
      isActive: box.is_active,
      contentType: box.content_type,
      primaryState: box.primary_state,
    });
    setDetailsOpen(true);
  };

  const handleExtraBoxClick = (box: ExtraBoxData) => {
    setSelectedBox({
      boxType: 'extra',
      boxId: box.id,
      boxCode: box.box_code,
      createdAt: box.created_at,
      isActive: box.is_active,
      contentType: box.content_type,
      primaryState: box.primary_state,
    });
    setDetailsOpen(true);
  };

  const getOrderStateColor = (state: string) => {
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
      'shipped': 'bg-green-500',
    };
    return colors[state] || 'bg-gray-500';
  };

  const getExtraStateColor = (state: string) => {
    const colors: Record<string, string> = {
      'extra_manufacturing': 'bg-blue-500',
      'extra_finishing': 'bg-purple-500',
      'extra_packaging': 'bg-orange-500',
      'extra_boxing': 'bg-cyan-500',
    };
    return colors[state] || 'bg-amber-500';
  };

  const formatState = (state: string) => {
    return state?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN';
  };

  const emptyOrderBoxes = orderBoxes.filter(b => b.batch_count === 0 && b.is_active);
  const occupiedOrderBoxes = orderBoxes.filter(b => b.batch_count > 0);
  const inactiveOrderBoxes = orderBoxes.filter(b => !b.is_active);

  const emptyExtraBoxes = extraBoxes.filter(b => b.batch_count === 0 && b.is_active);
  const occupiedExtraBoxes = extraBoxes.filter(b => b.batch_count > 0);
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
          <Button onClick={() => setScanDialogOpen(true)}>
            <QrCode className="mr-2 h-4 w-4" />
            Scan
          </Button>
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
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setPrintBoxType('order');
                  setPrintDialogOpen(true);
                }}
                disabled={orderBoxes.length === 0}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print Labels
              </Button>
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
                        <TableHead>Batches</TableHead>
                        <TableHead>Total Qty</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderBoxes.map((box) => (
                        <TableRow
                          key={box.id}
                          className={`cursor-pointer hover:bg-muted/50 ${!box.is_active ? 'opacity-50' : ''}`}
                          onClick={() => handleOrderBoxClick(box)}
                        >
                          <TableCell className="font-mono font-bold">{box.box_code}</TableCell>
                          <TableCell>
                            {box.batch_count > 0 && box.primary_state ? (
                              <Badge className={getOrderStateColor(box.primary_state)}>
                                {formatState(box.primary_state)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                EMPTY
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {box.batch_count > 0 ? (
                              <span className="text-sm">{box.batch_count}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {box.total_quantity > 0 ? (
                              <span className="text-sm">{box.total_quantity}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>{format(new Date(box.created_at), 'PP')}</TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={box.is_active}
                              onCheckedChange={() => {}}
                              onClick={(e) => handleToggleOrderBoxActive(box, e)}
                              disabled={box.batch_count > 0}
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
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setPrintBoxType('extra');
                  setPrintDialogOpen(true);
                }}
                disabled={extraBoxes.length === 0}
              >
                <Printer className="mr-2 h-4 w-4" />
                Print Labels
              </Button>
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
                        <TableHead>Batches</TableHead>
                        <TableHead>Total Qty</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="text-right">Active</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {extraBoxes.map((box) => (
                        <TableRow
                          key={box.id}
                          className={`cursor-pointer hover:bg-muted/50 ${!box.is_active ? 'opacity-50' : ''}`}
                          onClick={() => handleExtraBoxClick(box)}
                        >
                          <TableCell className="font-mono font-bold">{box.box_code}</TableCell>
                          <TableCell>
                            {box.batch_count > 0 && box.primary_state ? (
                              <Badge className={getExtraStateColor(box.primary_state)}>
                                {formatState(box.primary_state)}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-600">
                                EMPTY
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {box.batch_count > 0 ? (
                              <span className="text-sm">{box.batch_count}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {box.total_quantity > 0 ? (
                              <span className="text-sm">{box.total_quantity}</span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell>{format(new Date(box.created_at), 'PP')}</TableCell>
                          <TableCell className="text-right">
                            <Switch
                              checked={box.is_active}
                              onCheckedChange={() => {}}
                              onClick={(e) => handleToggleExtraBoxActive(box, e)}
                              disabled={box.batch_count > 0}
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
        </Tabs>
      </div>

      {/* Box Details Dialog */}
      {selectedBox && (
        <BoxDetailsDialog
          open={detailsOpen}
          onOpenChange={setDetailsOpen}
          boxType={selectedBox.boxType}
          boxId={selectedBox.boxId}
          boxCode={selectedBox.boxCode}
          createdAt={selectedBox.createdAt}
          isActive={selectedBox.isActive}
          contentType={selectedBox.contentType}
          primaryState={selectedBox.primaryState}
        />
      )}

      {/* Print Labels Dialog */}
      <BoxLabelPrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        boxes={printBoxType === 'order' 
          ? orderBoxes.map(b => ({ id: b.id, box_code: b.box_code, box_type: 'order' as const }))
          : extraBoxes.map(b => ({ id: b.id, box_code: b.box_code, box_type: 'extra' as const }))
        }
        title={printBoxType === 'order' ? 'Print Order Box Labels' : 'Print Extra Box Labels'}
      />

      {/* Box Lookup Scan Dialog */}
      <BoxLookupScanDialog
        open={scanDialogOpen}
        onOpenChange={setScanDialogOpen}
      />
    </div>
  );
}
