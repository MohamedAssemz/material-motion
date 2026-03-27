import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Search, Package, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { getStateLabel } from '@/lib/stateMachine';

interface BatchInfo {
  id: string;
  qr_code_data: string;
  current_state: string;
  eta: string | null;
  lead_time_days: number | null;
  created_at: string;
  order: {
    id: string;
    order_number: string;
    priority: string;
  };
  product: {
    name: string;
    sku: string;
  };
  units: Array<{
    id: string;
    serial_no: string | null;
    state: string;
    is_damaged: boolean;
  }>;
}

export default function BatchLookup() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState(code || '');
  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [loading, setLoading] = useState(!!code);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (code) {
      searchBatch(code);
    }
  }, [code]);

  const searchBatch = async (batchCode: string) => {
    setLoading(true);
    setNotFound(false);
    
    try {
      const { data, error } = await supabase
        .from('order_batches')
        .select(`
          *,
          order:orders(id, order_number, priority),
          product:products(name_en, sku),
          units(id, serial_no, state, is_damaged)
        `)
        .eq('qr_code_data', batchCode.toUpperCase())
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        setNotFound(true);
        setBatch(null);
      } else {
        setBatch(data as any);
      }
    } catch (error) {
      console.error('Error fetching batch:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchCode.trim()) {
      navigate(`/batch/${searchCode.trim().toUpperCase()}`);
    }
  };

  const getStatusColor = (state: string) => {
    const colors: Record<string, string> = {
      'waiting_for_rm': 'bg-yellow-500',
      'in_manufacturing': 'bg-blue-500',
      'manufactured': 'bg-blue-300',
      'waiting_for_pm': 'bg-orange-500',
      'in_packaging': 'bg-indigo-500',
      'packaged': 'bg-indigo-300',
      'waiting_for_bm': 'bg-orange-500',
      'in_boxing': 'bg-cyan-500',
      'boxed': 'bg-cyan-300',
      'qced': 'bg-teal-500',
      'finished': 'bg-green-500',
    };
    return colors[state] || 'bg-gray-500';
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Package className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Batch Lookup</h1>
            <p className="text-sm text-muted-foreground">Search by batch code or scan QR</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-2xl p-6 space-y-6">
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-2">
              <Input
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="Enter batch code (e.g., EB-1A2B3C4D)"
                className="font-mono"
              />
              <Button type="submit">
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </form>
          </CardContent>
        </Card>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        )}

        {notFound && !loading && (
          <Card className="border-destructive">
            <CardContent className="flex items-center gap-3 py-6">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              <div>
                <p className="font-medium">Batch not found</p>
                <p className="text-sm text-muted-foreground">
                  No batch exists with code "{searchCode.toUpperCase()}"
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {batch && !loading && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="font-mono text-2xl">{batch.qr_code_data}</CardTitle>
                <Badge className={getStatusColor(batch.current_state)}>
                  {getStateLabel(batch.current_state as any)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Order</p>
                  <p className="font-medium">{batch.order.order_number}</p>
                  {batch.order.priority === 'high' && (
                    <Badge variant="destructive" className="mt-1">High Priority</Badge>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Product</p>
                  <p className="font-medium">{batch.product.name}</p>
                  <p className="text-sm text-muted-foreground">SKU: {batch.product.sku}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Units</p>
                  <p className="font-medium">{batch.units.length} units</p>
                  {batch.units.filter(u => u.is_damaged).length > 0 && (
                    <p className="text-sm text-destructive">
                      {batch.units.filter(u => u.is_damaged).length} damaged
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">{format(new Date(batch.created_at), 'PPP')}</p>
                </div>
              </div>

              {batch.eta && (
                <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Expected completion</p>
                    <p className="font-medium">{format(new Date(batch.eta), 'PPP')}</p>
                    {batch.lead_time_days && (
                      <p className="text-sm text-muted-foreground">
                        Lead time: {batch.lead_time_days} days
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Button 
                className="w-full" 
                variant="outline"
                onClick={() => navigate(`/orders/${batch.order.id}`)}
              >
                View Full Order
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}