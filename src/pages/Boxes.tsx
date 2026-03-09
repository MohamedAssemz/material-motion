import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Box, Loader2, Package, Printer, QrCode, Search, CalendarIcon, X } from 'lucide-react';
import { format, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { BoxDetailsDialog } from '@/components/BoxDetailsDialog';
import { BoxLabelPrintDialog } from '@/components/BoxLabelPrintDialog';
import { BoxLookupScanDialog } from '@/components/BoxLookupScanDialog';
import { useBoxScanner } from '@/hooks/useBoxScanner';
import { TablePagination } from '@/components/TablePagination';
import { cn } from '@/lib/utils';

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

  const canManage = hasRole('admin');
  const [orderPage, setOrderPage] = useState(1);
  const [extraPage, setExtraPage] = useState(1);
  const PAGE_SIZE = 25;

  // Order tab filters
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');
  const [orderBatchFilter, setOrderBatchFilter] = useState('all');
  const [orderQtyFilter, setOrderQtyFilter] = useState('all');
  const [orderDateFrom, setOrderDateFrom] = useState<Date | undefined>();
  const [orderDateTo, setOrderDateTo] = useState<Date | undefined>();

  // Extra tab filters
  const [extraSearch, setExtraSearch] = useState('');
  const [extraStatusFilter, setExtraStatusFilter] = useState('all');
  const [extraBatchFilter, setExtraBatchFilter] = useState('all');
  const [extraQtyFilter, setExtraQtyFilter] = useState('all');
  const [extraDateFrom, setExtraDateFrom] = useState<Date | undefined>();
  const [extraDateTo, setExtraDateTo] = useState<Date | undefined>();

  // Normalize search input for box codes
  const normalizeBoxSearch = (input: string, prefix: string) => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    // If pure number, prepend prefix
    if (/^\d+$/.test(trimmed)) return `${prefix}${trimmed}`;
    return trimmed.toUpperCase();
  };

  // Generic box filter
  const filterBoxes = <T extends OrderBoxData | ExtraBoxData>(
    boxes: T[],
    search: string,
    prefix: string,
    statusFilter: string,
    batchFilter: string,
    qtyFilter: string,
    dateFrom: Date | undefined,
    dateTo: Date | undefined,
  ): T[] => {
    let result = boxes;

    if (search.trim()) {
      const normalized = normalizeBoxSearch(search, prefix);
      result = result.filter(b => b.box_code.toUpperCase().includes(normalized));
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'empty') result = result.filter(b => b.batch_count === 0 && b.is_active);
      else if (statusFilter === 'occupied') result = result.filter(b => b.batch_count > 0);
      else if (statusFilter === 'inactive') result = result.filter(b => !b.is_active);
    }

    if (batchFilter !== 'all') {
      if (batchFilter === '0') result = result.filter(b => b.batch_count === 0);
      else if (batchFilter === '1-5') result = result.filter(b => b.batch_count >= 1 && b.batch_count <= 5);
      else if (batchFilter === '6-10') result = result.filter(b => b.batch_count >= 6 && b.batch_count <= 10);
      else if (batchFilter === '10+') result = result.filter(b => b.batch_count > 10);
    }

    if (qtyFilter !== 'all') {
      if (qtyFilter === '0') result = result.filter(b => b.total_quantity === 0);
      else if (qtyFilter === '1-10') result = result.filter(b => b.total_quantity >= 1 && b.total_quantity <= 10);
      else if (qtyFilter === '11-50') result = result.filter(b => b.total_quantity >= 11 && b.total_quantity <= 50);
      else if (qtyFilter === '50+') result = result.filter(b => b.total_quantity > 50);
    }

    if (dateFrom || dateTo) {
      result = result.filter(b => {
        const created = new Date(b.created_at);
        if (dateFrom && dateTo) {
          return isWithinInterval(created, { start: startOfDay(dateFrom), end: endOfDay(dateTo) });
        }
        if (dateFrom) return created >= startOfDay(dateFrom);
        if (dateTo) return created <= endOfDay(dateTo);
        return true;
      });
    }

    return result;
  };

  const filteredOrderBoxes = useMemo(() =>
    filterBoxes(orderBoxes, orderSearch, 'BOX-', orderStatusFilter, orderBatchFilter, orderQtyFilter, orderDateFrom, orderDateTo),
    [orderBoxes, orderSearch, orderStatusFilter, orderBatchFilter, orderQtyFilter, orderDateFrom, orderDateTo]
  );

  const filteredExtraBoxes = useMemo(() =>
    filterBoxes(extraBoxes, extraSearch, 'EBOX-', extraStatusFilter, extraBatchFilter, extraQtyFilter, extraDateFrom, extraDateTo),
    [extraBoxes, extraSearch, extraStatusFilter, extraBatchFilter, extraQtyFilter, extraDateFrom, extraDateTo]
  );

  // Reset pages on filter change
  useEffect(() => { setOrderPage(1); }, [orderSearch, orderStatusFilter, orderBatchFilter, orderQtyFilter, orderDateFrom, orderDateTo]);
  useEffect(() => { setExtraPage(1); }, [extraSearch, extraStatusFilter, extraBatchFilter, extraQtyFilter, extraDateFrom, extraDateTo]);

  const openBoxDetails = useCallback((
    boxType: 'order' | 'extra',
    boxId: string,
    boxCode: string,
    createdAt: string,
    isActive: boolean,
    contentType: string,
    primaryState: string | null
  ) => {
    setSelectedBox({ boxType, boxId, boxCode, createdAt, isActive, contentType, primaryState });
    setDetailsOpen(true);
    toast({ title: 'Box Found', description: `Opened details for ${boxCode}` });
  }, [toast]);

  const handleBoxScan = useCallback(async (rawCode: string) => {
    const normalized = rawCode.trim().toUpperCase();
    const boxMatch = normalized.match(/(EBOX-\d+|BOX-\d+)/);
    const batchMatch = normalized.match(/(EB-[A-Z0-9]{8}|B-[A-Z0-9]{8})/);

    if (boxMatch) {
      const boxCode = boxMatch[1];
      const orderBox = orderBoxes.find(b => b.box_code.toUpperCase() === boxCode);
      if (orderBox) { openBoxDetails('order', orderBox.id, orderBox.box_code, orderBox.created_at, orderBox.is_active, orderBox.content_type, orderBox.primary_state); return; }
      const extraBox = extraBoxes.find(b => b.box_code.toUpperCase() === boxCode);
      if (extraBox) { openBoxDetails('extra', extraBox.id, extraBox.box_code, extraBox.created_at, extraBox.is_active, extraBox.content_type, extraBox.primary_state); return; }

      const { data: dbOrderBox } = await supabase.from('boxes').select('id, box_code, is_active, created_at, content_type').eq('box_code', boxCode).maybeSingle();
      if (dbOrderBox) { openBoxDetails('order', dbOrderBox.id, dbOrderBox.box_code, dbOrderBox.created_at, dbOrderBox.is_active, dbOrderBox.content_type || 'EMPTY', null); return; }
      const { data: dbExtraBox } = await supabase.from('extra_boxes').select('id, box_code, is_active, created_at, content_type').eq('box_code', boxCode).maybeSingle();
      if (dbExtraBox) { openBoxDetails('extra', dbExtraBox.id, dbExtraBox.box_code, dbExtraBox.created_at, dbExtraBox.is_active, dbExtraBox.content_type || 'EMPTY', null); return; }
      toast({ title: 'Box Not Found', description: `No box found with code "${boxCode}"`, variant: 'destructive' }); return;
    }

    if (batchMatch) {
      const batchCode = batchMatch[1];
      if (batchCode.startsWith('B-')) {
        const { data: orderBatch } = await supabase.from('order_batches').select('box_id, box:boxes(id, box_code, is_active, created_at, content_type)').eq('qr_code_data', batchCode).maybeSingle();
        if (orderBatch) {
          if (orderBatch.box_id && orderBatch.box) { const box = orderBatch.box as any; openBoxDetails('order', box.id, box.box_code, box.created_at, box.is_active, box.content_type || 'EMPTY', null); }
          else { toast({ title: 'Batch Not In Box', description: `Batch ${batchCode} is not currently assigned to a box`, variant: 'destructive' }); }
          return;
        }
      }
      if (batchCode.startsWith('EB-')) {
        const { data: extraBatch } = await supabase.from('extra_batches').select('box_id, box:extra_boxes(id, box_code, is_active, created_at, content_type)').eq('qr_code_data', batchCode).maybeSingle();
        if (extraBatch) {
          if (extraBatch.box_id && extraBatch.box) { const box = extraBatch.box as any; openBoxDetails('extra', box.id, box.box_code, box.created_at, box.is_active, box.content_type || 'EMPTY', null); }
          else { toast({ title: 'Batch Not In Box', description: `Batch ${batchCode} is not currently assigned to a box`, variant: 'destructive' }); }
          return;
        }
      }
      toast({ title: 'Batch Not Found', description: `No batch found with code "${batchCode}"`, variant: 'destructive' }); return;
    }

    toast({ title: 'Unrecognized Scan', description: `Could not parse box or batch code from "${normalized.slice(0, 30)}${normalized.length > 30 ? '...' : ''}"`, variant: 'destructive' });
  }, [orderBoxes, extraBoxes, toast, openBoxDetails]);

  useEffect(() => {
    fetchBoxes();
    const channel = supabase.channel('boxes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boxes' }, () => { fetchBoxes(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_boxes' }, () => { fetchBoxes(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_batches' }, () => { fetchBoxes(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'extra_batches' }, () => { fetchBoxes(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchBoxes = async () => {
    try {
      const { data: orderBoxesData, error: orderBoxesError } = await supabase.from('boxes').select('*').order('box_code');
      if (orderBoxesError) throw orderBoxesError;

      const orderBoxIds = orderBoxesData?.map(b => b.id) || [];
      const { data: orderBatchesData } = await supabase.from('order_batches').select('box_id, quantity, current_state').in('box_id', orderBoxIds).eq('is_terminated', false);

      const orderBatchStats = new Map<string, { count: number; total: number; state: string | null }>();
      orderBatchesData?.forEach(batch => {
        if (batch.box_id) {
          const existing = orderBatchStats.get(batch.box_id) || { count: 0, total: 0, state: null };
          existing.count += 1; existing.total += batch.quantity;
          if (!existing.state) existing.state = batch.current_state;
          orderBatchStats.set(batch.box_id, existing);
        }
      });

      const orderBoxesMapped: OrderBoxData[] = (orderBoxesData || []).map(box => {
        const stats = orderBatchStats.get(box.id) || { count: 0, total: 0, state: null };
        return { id: box.id, box_code: box.box_code, is_active: box.is_active, created_at: box.created_at, content_type: box.content_type || 'EMPTY', items_list: Array.isArray(box.items_list) ? box.items_list : [], batch_count: stats.count, total_quantity: stats.total, primary_state: stats.state };
      });
      setOrderBoxes(orderBoxesMapped);

      const { data: extraBoxesData, error: extraBoxesError } = await supabase.from('extra_boxes').select('*').order('box_code');
      if (extraBoxesError) throw extraBoxesError;

      const extraBoxIds = extraBoxesData?.map(b => b.id) || [];
      const { data: extraBatchesData } = await supabase.from('extra_batches').select('box_id, quantity, current_state').in('box_id', extraBoxIds);

      const extraBatchStats = new Map<string, { count: number; total: number; state: string | null }>();
      extraBatchesData?.forEach(batch => {
        if (batch.box_id) {
          const existing = extraBatchStats.get(batch.box_id) || { count: 0, total: 0, state: null };
          existing.count += 1; existing.total += batch.quantity;
          if (!existing.state) existing.state = batch.current_state;
          extraBatchStats.set(batch.box_id, existing);
        }
      });

      const extraBoxesMapped: ExtraBoxData[] = (extraBoxesData || []).map(box => {
        const stats = extraBatchStats.get(box.id) || { count: 0, total: 0, state: null };
        return { id: box.id, box_code: box.box_code, is_active: box.is_active, created_at: box.created_at, content_type: box.content_type || 'EMPTY', items_list: Array.isArray(box.items_list) ? box.items_list : [], batch_count: stats.count, total_quantity: stats.total, primary_state: stats.state };
      });
      setExtraBoxes(extraBoxesMapped);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrderBoxes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      for (let i = 0; i < newBoxCount; i++) {
        const { data: boxCode } = await supabase.rpc('generate_box_code');
        const { error } = await supabase.from('boxes').insert({ box_code: boxCode || `BOX-${Date.now()}-${i}`, is_active: true });
        if (error) throw error;
      }
      toast({ title: 'Success', description: `Created ${newBoxCount} order box(es)` });
      setDialogOpen(false); setNewBoxCount(1); fetchBoxes();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
  };

  const handleCreateExtraBoxes = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      for (let i = 0; i < newExtraBoxCount; i++) {
        const { data: boxCode } = await supabase.rpc('generate_extra_box_code');
        const { error } = await supabase.from('extra_boxes').insert({ box_code: boxCode || `EBOX-${Date.now()}-${i}`, is_active: true });
        if (error) throw error;
      }
      toast({ title: 'Success', description: `Created ${newExtraBoxCount} extra box(es)` });
      setExtraDialogOpen(false); setNewExtraBoxCount(1); fetchBoxes();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
  };

  const handleToggleOrderBoxActive = async (box: OrderBoxData, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('boxes').update({ is_active: !box.is_active }).eq('id', box.id);
      if (error) throw error;
      toast({ title: 'Success', description: `Box ${box.box_code} ${!box.is_active ? 'activated' : 'deactivated'}` });
      fetchBoxes();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
  };

  const handleToggleExtraBoxActive = async (box: ExtraBoxData, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { error } = await supabase.from('extra_boxes').update({ is_active: !box.is_active }).eq('id', box.id);
      if (error) throw error;
      toast({ title: 'Success', description: `Extra Box ${box.box_code} ${!box.is_active ? 'activated' : 'deactivated'}` });
      fetchBoxes();
    } catch (error: any) { toast({ title: 'Error', description: error.message, variant: 'destructive' }); }
  };

  const handleOrderBoxClick = (box: OrderBoxData) => {
    setSelectedBox({ boxType: 'order', boxId: box.id, boxCode: box.box_code, createdAt: box.created_at, isActive: box.is_active, contentType: box.content_type, primaryState: box.primary_state });
    setDetailsOpen(true);
  };

  const handleExtraBoxClick = (box: ExtraBoxData) => {
    setSelectedBox({ boxType: 'extra', boxId: box.id, boxCode: box.box_code, createdAt: box.created_at, isActive: box.is_active, contentType: box.content_type, primaryState: box.primary_state });
    setDetailsOpen(true);
  };

  const getOrderStateColor = (state: string) => {
    const colors: Record<string, string> = { 'in_manufacturing': 'bg-blue-500', 'ready_for_finishing': 'bg-blue-300', 'in_finishing': 'bg-purple-500', 'ready_for_packaging': 'bg-orange-500', 'in_packaging': 'bg-indigo-500', 'ready_for_boxing': 'bg-cyan-300', 'in_boxing': 'bg-cyan-500', 'ready_for_shipment': 'bg-teal-300', 'shipped': 'bg-green-500' };
    return colors[state] || 'bg-gray-500';
  };

  const getExtraStateColor = (state: string) => {
    const colors: Record<string, string> = { 'extra_manufacturing': 'bg-blue-500', 'extra_finishing': 'bg-purple-500', 'extra_packaging': 'bg-orange-500', 'extra_boxing': 'bg-cyan-500' };
    return colors[state] || 'bg-amber-500';
  };

  const formatState = (state: string) => state?.replace(/_/g, ' ').toUpperCase() || 'UNKNOWN';

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

  // Filter bar component to avoid duplication
  const renderFilterBar = (
    search: string, setSearch: (v: string) => void,
    statusFilter: string, setStatusFilter: (v: string) => void,
    batchFilter: string, setBatchFilter: (v: string) => void,
    qtyFilter: string, setQtyFilter: (v: string) => void,
    dateFrom: Date | undefined, setDateFrom: (v: Date | undefined) => void,
    dateTo: Date | undefined, setDateTo: (v: Date | undefined) => void,
    placeholder: string,
  ) => (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder={placeholder} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
              </div>
            </div>
            <div className="w-full sm:w-[150px]">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="empty">Empty</SelectItem>
                  <SelectItem value="occupied">Occupied</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[140px]">
              <Select value={batchFilter} onValueChange={setBatchFilter}>
                <SelectTrigger><SelectValue placeholder="Batches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Batches</SelectItem>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1-5">1–5</SelectItem>
                  <SelectItem value="6-10">6–10</SelectItem>
                  <SelectItem value="10+">10+</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:w-[140px]">
              <Select value={qtyFilter} onValueChange={setQtyFilter}>
                <SelectTrigger><SelectValue placeholder="Quantity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Qty</SelectItem>
                  <SelectItem value="0">0</SelectItem>
                  <SelectItem value="1-10">1–10</SelectItem>
                  <SelectItem value="11-50">11–50</SelectItem>
                  <SelectItem value="50+">50+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">From:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, 'PP') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {dateFrom && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDateFrom(undefined)}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">To:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-[140px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateTo ? format(dateTo, 'PP') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {dateTo && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDateTo(undefined)}>
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

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
              <Button variant="outline" onClick={() => { setPrintBoxType('order'); setPrintDialogOpen(true); }} disabled={orderBoxes.length === 0}>
                <Printer className="mr-2 h-4 w-4" />
                Print Labels
              </Button>
              {canManage && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />Create Order Boxes</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Create Order Boxes</DialogTitle></DialogHeader>
                    <form onSubmit={handleCreateOrderBoxes} className="space-y-4">
                      <div>
                        <Label htmlFor="count">Number of boxes to create</Label>
                        <Input id="count" type="number" min="1" max="100" value={newBoxCount} onChange={(e) => setNewBoxCount(parseInt(e.target.value) || 1)} required />
                        <p className="text-xs text-muted-foreground mt-1">Box codes will be auto-generated (e.g., BOX-0001)</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1">Create</Button>
                        <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Filters */}
            {renderFilterBar(orderSearch, setOrderSearch, orderStatusFilter, setOrderStatusFilter, orderBatchFilter, setOrderBatchFilter, orderQtyFilter, setOrderQtyFilter, orderDateFrom, setOrderDateFrom, orderDateTo, setOrderDateTo, "Search by box number (e.g. 42)...")}

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Empty Boxes</p><p className="text-2xl font-bold text-green-600">{emptyOrderBoxes.length}</p></div>
                    <Box className="h-8 w-8 text-green-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Occupied Boxes</p><p className="text-2xl font-bold text-blue-600">{occupiedOrderBoxes.length}</p></div>
                    <Package className="h-8 w-8 text-blue-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Inactive Boxes</p><p className="text-2xl font-bold text-muted-foreground">{inactiveOrderBoxes.length}</p></div>
                    <Box className="h-8 w-8 text-muted-foreground opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Order Boxes
                  {filteredOrderBoxes.length !== orderBoxes.length && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredOrderBoxes.length} of {orderBoxes.length})</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredOrderBoxes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Box className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    {orderBoxes.length === 0 ? <><p>No order boxes created yet</p><p className="text-sm">Create boxes to start tracking order batches</p></> : <p>No boxes match the current filters</p>}
                  </div>
                ) : (
                  <>
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
                      {filteredOrderBoxes.slice((orderPage - 1) * PAGE_SIZE, orderPage * PAGE_SIZE).map((box) => (
                        <TableRow key={box.id} className={`cursor-pointer hover:bg-muted/50 ${!box.is_active ? 'opacity-50' : ''}`} onClick={() => handleOrderBoxClick(box)}>
                          <TableCell className="font-mono font-bold">{box.box_code}</TableCell>
                          <TableCell>
                            {box.batch_count > 0 && box.primary_state ? (
                              <Badge className={getOrderStateColor(box.primary_state)}>{formatState(box.primary_state)}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-600">EMPTY</Badge>
                            )}
                          </TableCell>
                          <TableCell>{box.batch_count > 0 ? <span className="text-sm">{box.batch_count}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                          <TableCell>{box.total_quantity > 0 ? <span className="text-sm">{box.total_quantity}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                          <TableCell>{format(new Date(box.created_at), 'PP')}</TableCell>
                          <TableCell className="text-right">
                            <Switch checked={box.is_active} onCheckedChange={() => {}} onClick={(e) => handleToggleOrderBoxActive(box, e)} disabled={box.batch_count > 0 || !canManage} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination currentPage={orderPage} totalItems={filteredOrderBoxes.length} pageSize={PAGE_SIZE} onPageChange={setOrderPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Extra Boxes Tab */}
          <TabsContent value="extra" className="space-y-6">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => { setPrintBoxType('extra'); setPrintDialogOpen(true); }} disabled={extraBoxes.length === 0}>
                <Printer className="mr-2 h-4 w-4" />
                Print Labels
              </Button>
              {canManage && (
                <Dialog open={extraDialogOpen} onOpenChange={setExtraDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="mr-2 h-4 w-4" />Create Extra Boxes</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Create Extra Boxes</DialogTitle></DialogHeader>
                    <form onSubmit={handleCreateExtraBoxes} className="space-y-4">
                      <div>
                        <Label htmlFor="extra-count">Number of boxes to create</Label>
                        <Input id="extra-count" type="number" min="1" max="100" value={newExtraBoxCount} onChange={(e) => setNewExtraBoxCount(parseInt(e.target.value) || 1)} required />
                        <p className="text-xs text-muted-foreground mt-1">Box codes will be auto-generated (e.g., EBOX-0001)</p>
                      </div>
                      <div className="flex gap-2">
                        <Button type="submit" className="flex-1">Create</Button>
                        <Button type="button" variant="outline" onClick={() => setExtraDialogOpen(false)}>Cancel</Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>
              )}
            </div>

            {/* Filters */}
            {renderFilterBar(extraSearch, setExtraSearch, extraStatusFilter, setExtraStatusFilter, extraBatchFilter, setExtraBatchFilter, extraQtyFilter, setExtraQtyFilter, extraDateFrom, setExtraDateFrom, extraDateTo, setExtraDateTo, "Search by box number (e.g. 42)...")}

            {/* Stats */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Empty Boxes</p><p className="text-2xl font-bold text-green-600">{emptyExtraBoxes.length}</p></div>
                    <Box className="h-8 w-8 text-green-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Occupied Boxes</p><p className="text-2xl font-bold text-amber-600">{occupiedExtraBoxes.length}</p></div>
                    <Package className="h-8 w-8 text-amber-600 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div><p className="text-sm text-muted-foreground">Inactive Boxes</p><p className="text-2xl font-bold text-muted-foreground">{inactiveExtraBoxes.length}</p></div>
                    <Box className="h-8 w-8 text-muted-foreground opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card>
              <CardHeader>
                <CardTitle>
                  Extra Boxes
                  {filteredExtraBoxes.length !== extraBoxes.length && (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({filteredExtraBoxes.length} of {extraBoxes.length})</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {filteredExtraBoxes.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Box className="mx-auto h-12 w-12 mb-4 opacity-50" />
                    {extraBoxes.length === 0 ? <><p>No extra boxes created yet</p><p className="text-sm">Create extra boxes to store surplus inventory</p></> : <p>No boxes match the current filters</p>}
                  </div>
                ) : (
                  <>
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
                      {filteredExtraBoxes.slice((extraPage - 1) * PAGE_SIZE, extraPage * PAGE_SIZE).map((box) => (
                        <TableRow key={box.id} className={`cursor-pointer hover:bg-muted/50 ${!box.is_active ? 'opacity-50' : ''}`} onClick={() => handleExtraBoxClick(box)}>
                          <TableCell className="font-mono font-bold">{box.box_code}</TableCell>
                          <TableCell>
                            {box.batch_count > 0 && box.primary_state ? (
                              <Badge className={getExtraStateColor(box.primary_state)}>{formatState(box.primary_state)}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-green-600 border-green-600">EMPTY</Badge>
                            )}
                          </TableCell>
                          <TableCell>{box.batch_count > 0 ? <span className="text-sm">{box.batch_count}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                          <TableCell>{box.total_quantity > 0 ? <span className="text-sm">{box.total_quantity}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                          <TableCell>{format(new Date(box.created_at), 'PP')}</TableCell>
                          <TableCell className="text-right">
                            <Switch checked={box.is_active} onCheckedChange={() => {}} onClick={(e) => handleToggleExtraBoxActive(box, e)} disabled={box.batch_count > 0 || !canManage} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePagination currentPage={extraPage} totalItems={filteredExtraBoxes.length} pageSize={PAGE_SIZE} onPageChange={setExtraPage} />
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {selectedBox && (
        <BoxDetailsDialog open={detailsOpen} onOpenChange={setDetailsOpen} boxType={selectedBox.boxType} boxId={selectedBox.boxId} boxCode={selectedBox.boxCode} createdAt={selectedBox.createdAt} isActive={selectedBox.isActive} contentType={selectedBox.contentType} primaryState={selectedBox.primaryState} />
      )}

      <BoxLabelPrintDialog
        open={printDialogOpen}
        onOpenChange={setPrintDialogOpen}
        boxes={printBoxType === 'order' ? orderBoxes.map(b => ({ id: b.id, box_code: b.box_code, box_type: 'order' as const })) : extraBoxes.map(b => ({ id: b.id, box_code: b.box_code, box_type: 'extra' as const }))}
        title={printBoxType === 'order' ? 'Print Order Box Labels' : 'Print Extra Box Labels'}
      />

      <BoxLookupScanDialog open={scanDialogOpen} onOpenChange={setScanDialogOpen} />
    </div>
  );
}
