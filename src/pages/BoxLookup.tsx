import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Search, Box, Package, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

interface BoxInfo {
  id: string;
  box_code: string;
  is_active: boolean;
  created_at: string;
  content_type: string;
  box_type: 'order' | 'extra' | 'shipment';
  items: Array<{
    product_id: string;
    product_name: string;
    product_sku: string;
    quantity: number;
    state?: string;
    inventory_state?: string;
  }>;
  // Shipment specific fields
  shipment_status?: string;
  order_number?: string;
}

export default function BoxLookup() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [searchCode, setSearchCode] = useState(code || '');
  const [box, setBox] = useState<BoxInfo | null>(null);
  const [loading, setLoading] = useState(!!code);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (code) {
      searchBox(code);
    }
  }, [code]);

  const searchBox = async (boxCode: string) => {
    setLoading(true);
    setNotFound(false);
    
    const upperCode = boxCode.toUpperCase().trim();
    
    try {
      // Try order boxes first
      if (upperCode.startsWith('BOX-')) {
        const { data: orderBox, error } = await supabase
          .from('boxes')
          .select('*')
          .eq('box_code', upperCode)
          .maybeSingle();

        if (!error && orderBox) {
          // Fetch batches in this box
          const { data: batches } = await supabase
            .from('order_batches')
            .select(`
              id,
              product_id,
              quantity,
              current_state,
              product:products(name, sku)
            `)
            .eq('box_id', orderBox.id);

          const items = batches?.map(b => ({
            product_id: b.product_id,
            product_name: (b.product as any)?.name || 'Unknown',
            product_sku: (b.product as any)?.sku || 'N/A',
            quantity: b.quantity,
            state: b.current_state,
          })) || [];

          setBox({
            id: orderBox.id,
            box_code: orderBox.box_code,
            is_active: orderBox.is_active,
            created_at: orderBox.created_at,
            content_type: orderBox.content_type || 'EMPTY',
            box_type: 'order',
            items,
          });
          return;
        }
      }

      // Try extra boxes
      if (upperCode.startsWith('EBOX-')) {
        const { data: extraBox, error } = await supabase
          .from('extra_boxes')
          .select('*')
          .eq('box_code', upperCode)
          .maybeSingle();

        if (!error && extraBox) {
          // Fetch batches in this box
          const { data: batches } = await supabase
            .from('extra_batches')
            .select(`
              id,
              product_id,
              quantity,
              current_state,
              inventory_state,
              product:products(name, sku)
            `)
            .eq('box_id', extraBox.id);

          const items = batches?.map(b => ({
            product_id: b.product_id,
            product_name: (b.product as any)?.name || 'Unknown',
            product_sku: (b.product as any)?.sku || 'N/A',
            quantity: b.quantity,
            state: b.current_state,
            inventory_state: b.inventory_state,
          })) || [];

          setBox({
            id: extraBox.id,
            box_code: extraBox.box_code,
            is_active: extraBox.is_active,
            created_at: extraBox.created_at,
            content_type: extraBox.content_type || 'EMPTY',
            box_type: 'extra',
            items,
          });
          return;
        }
      }

      // Try shipments
      if (upperCode.startsWith('SHP-')) {
        const { data: shipment, error } = await supabase
          .from('shipments')
          .select(`
            *,
            order:orders(order_number)
          `)
          .eq('shipment_code', upperCode)
          .maybeSingle();

        if (!error && shipment) {
          // Fetch batches in this shipment
          const { data: batches } = await supabase
            .from('order_batches')
            .select(`
              id,
              product_id,
              quantity,
              current_state,
              product:products(name, sku)
            `)
            .eq('shipment_id', shipment.id);

          const items = batches?.map(b => ({
            product_id: b.product_id,
            product_name: (b.product as any)?.name || 'Unknown',
            product_sku: (b.product as any)?.sku || 'N/A',
            quantity: b.quantity,
            state: b.current_state,
          })) || [];

          setBox({
            id: shipment.id,
            box_code: shipment.shipment_code,
            is_active: shipment.status !== 'shipped',
            created_at: shipment.created_at,
            content_type: 'SHIPMENT',
            box_type: 'shipment',
            items,
            shipment_status: shipment.status,
            order_number: (shipment.order as any)?.order_number,
          });
          return;
        }
      }

      // If we get here, nothing was found
      setNotFound(true);
      setBox(null);
    } catch (error) {
      console.error('Error fetching box:', error);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchCode.trim()) {
      navigate(`/box/${searchCode.trim().toUpperCase()}`);
    }
  };

  const getStateColor = (state: string) => {
    const colors: Record<string, string> = {
      'in_manufacturing': 'bg-blue-500',
      'ready_for_finishing': 'bg-blue-300',
      'in_finishing': 'bg-purple-500',
      'ready_for_packaging': 'bg-orange-500',
      'in_packaging': 'bg-indigo-500',
      'ready_for_boxing': 'bg-cyan-300',
      'in_boxing': 'bg-cyan-500',
      'ready_for_shipment': 'bg-teal-300',
      'shipped': 'bg-green-500',
      'extra_manufacturing': 'bg-blue-500',
      'extra_finishing': 'bg-purple-500',
      'extra_packaging': 'bg-orange-500',
      'extra_boxing': 'bg-cyan-500',
    };
    return colors[state] || 'bg-gray-500';
  };

  const formatState = (state: string) => {
    return state?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  };

  const getBoxTypeLabel = (type: 'order' | 'extra' | 'shipment') => {
    switch (type) {
      case 'order': return 'Order Box';
      case 'extra': return 'Extra Box';
      case 'shipment': return 'Shipment';
    }
  };

  const totalQuantity = box?.items.reduce((sum, item) => sum + item.quantity, 0) || 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Box className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Box Lookup</h1>
            <p className="text-sm text-muted-foreground">Search by box code or scan QR</p>
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
                placeholder="Enter box code (e.g., BOX-0001, EBOX-0001, SHP-0001)"
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
                <p className="font-medium">Box not found</p>
                <p className="text-sm text-muted-foreground">
                  No box exists with code "{searchCode.toUpperCase()}"
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {box && !loading && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CardTitle className="font-mono text-2xl">{box.box_code}</CardTitle>
                  <Badge variant="outline">{getBoxTypeLabel(box.box_type)}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  {box.is_active ? (
                    <Badge className="bg-green-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Inactive</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Box Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Created</p>
                  <p className="font-medium">{format(new Date(box.created_at), 'PPP')}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="font-medium">{totalQuantity} units in {box.items.length} batch(es)</p>
                </div>
                {box.order_number && (
                  <div>
                    <p className="text-sm text-muted-foreground">Order</p>
                    <p className="font-medium">{box.order_number}</p>
                  </div>
                )}
                {box.shipment_status && (
                  <div>
                    <p className="text-sm text-muted-foreground">Shipment Status</p>
                    <Badge className={box.shipment_status === 'shipped' ? 'bg-green-500' : 'bg-amber-500'}>
                      {box.shipment_status.toUpperCase()}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Contents */}
              {box.items.length === 0 ? (
                <div className="text-center py-8 border rounded-lg">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground opacity-50 mb-2" />
                  <p className="text-muted-foreground">This box is empty</p>
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {box.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{item.product_sku}</TableCell>
                          <TableCell>{item.product_name}</TableCell>
                          <TableCell className="text-right font-medium">{item.quantity}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {item.state && (
                                <Badge className={getStateColor(item.state)}>
                                  {formatState(item.state)}
                                </Badge>
                              )}
                              {item.inventory_state && (
                                <Badge 
                                  variant={item.inventory_state === 'RESERVED' ? 'default' : 'outline'}
                                  className={item.inventory_state === 'RESERVED' ? 'bg-amber-500' : ''}
                                >
                                  {item.inventory_state}
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
