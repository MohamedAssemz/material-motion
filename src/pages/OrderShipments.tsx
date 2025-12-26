import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Truck, Package, Printer, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';

interface ShipmentItem {
  id: string;
  quantity: number;
  batch: {
    id: string;
    batch_code: string;
    product: {
      id: string;
      name: string;
      sku: string;
    };
  };
  order_item?: {
    needs_boxing: boolean;
  } | null;
}

interface Shipment {
  id: string;
  shipment_code: string;
  status: string;
  notes: string | null;
  created_at: string;
  sealed_at: string | null;
  items: ShipmentItem[];
}

interface Order {
  id: string;
  order_number: string;
  customer?: { name: string } | null;
}

export default function OrderShipments() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      // Fetch order
      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .select('id, order_number, customer:customers(name)')
        .eq('id', id)
        .single();

      if (orderError) throw orderError;
      setOrder(orderData as Order);

      // Fetch shipments with items
      const { data: shipmentsData, error: shipmentsError } = await supabase
        .from('shipments')
        .select(`
          id,
          shipment_code,
          status,
          notes,
          created_at,
          sealed_at
        `)
        .eq('order_id', id)
        .order('created_at', { ascending: false });

      if (shipmentsError) throw shipmentsError;

      // Fetch items for each shipment
      const shipmentsWithItems: Shipment[] = [];
      for (const shipment of shipmentsData || []) {
        const { data: itemsData } = await supabase
          .from('shipment_items')
          .select(`
            id,
            quantity,
            batch:batches(
              id,
              batch_code,
              order_item_id,
              product:products(id, name, sku)
            )
          `)
          .eq('shipment_id', shipment.id);

        // Fetch order_item info for each item
        const itemsWithOrderItem: ShipmentItem[] = [];
        for (const item of itemsData || []) {
          let orderItem = null;
          if ((item.batch as any)?.order_item_id) {
            const { data: oiData } = await supabase
              .from('order_items')
              .select('needs_boxing')
              .eq('id', (item.batch as any).order_item_id)
              .single();
            orderItem = oiData;
          }
          itemsWithOrderItem.push({
            id: item.id,
            quantity: item.quantity,
            batch: item.batch as any,
            order_item: orderItem,
          });
        }

        shipmentsWithItems.push({
          ...shipment,
          items: itemsWithOrderItem,
        });
      }

      setShipments(shipmentsWithItems);
    } catch (error: any) {
      console.error('Error fetching shipments:', error);
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const printKartona = (shipment: Shipment) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const totalItems = shipment.items.reduce((sum, item) => sum + item.quantity, 0);

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Kartona ${shipment.shipment_code}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
            .header { text-align: center; border-bottom: 3px solid #333; padding-bottom: 15px; margin-bottom: 20px; }
            .code { font-size: 36px; font-weight: bold; font-family: monospace; }
            .order { font-size: 18px; margin-top: 10px; }
            .customer { color: #666; font-size: 16px; }
            .qr-container { text-align: center; margin: 20px 0; }
            .section { margin: 20px 0; }
            .section-title { font-weight: bold; font-size: 14px; color: #666; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; }
            th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f5f5f5; font-size: 12px; color: #666; }
            .total { font-weight: bold; background: #f9f9f9; }
            .boxing-badge { font-size: 10px; color: #888; display: inline-block; padding: 2px 6px; background: #f0f0f0; border-radius: 4px; margin-left: 8px; }
            .notes { background: #fff9e6; padding: 10px; border-radius: 4px; border: 1px solid #ffe0b2; }
            .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; border-top: 1px solid #ddd; padding-top: 15px; }
            .date { font-size: 12px; color: #888; margin-top: 5px; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="code">${shipment.shipment_code}</div>
            <div class="order">Order: ${order?.order_number || 'N/A'}</div>
            <div class="customer">${order?.customer?.name || 'No Customer'}</div>
            <div class="date">Created: ${format(new Date(shipment.created_at), 'PPP p')}</div>
          </div>

          <div class="qr-container">
            <svg id="qr-placeholder" style="width: 120px; height: 120px;"></svg>
          </div>

          <div class="section">
            <div class="section-title">KARTONA CONTENTS</div>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Boxing</th>
                  <th style="text-align: right;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${shipment.items.map(item => `
                  <tr>
                    <td>${item.batch?.product?.name || 'Unknown'}</td>
                    <td>${item.batch?.product?.sku || 'N/A'}</td>
                    <td>${item.order_item?.needs_boxing ? 'Boxed' : 'Not Boxed'}</td>
                    <td style="text-align: right;">${item.quantity}</td>
                  </tr>
                `).join('')}
                <tr class="total">
                  <td colspan="3">Total Items</td>
                  <td style="text-align: right;">${totalItems}</td>
                </tr>
              </tbody>
            </table>
          </div>

          ${shipment.notes ? `
            <div class="section">
              <div class="section-title">NOTES</div>
              <div class="notes">${shipment.notes}</div>
            </div>
          ` : ''}

          <div class="footer">
            Miracle Medical Products Factory<br/>
            Kartona ID: ${shipment.id.slice(0, 8)}
          </div>

          <script>window.print(); window.close();</script>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate('/shipments')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Shipments
        </Button>
        <p className="text-center text-muted-foreground mt-8">Order not found</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/shipments')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
              <Truck className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Shipments</h1>
              <p className="text-muted-foreground">
                {order.order_number} {order.customer?.name && `· ${order.customer.name}`}
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" onClick={() => navigate(`/orders/${id}`)}>
          View Order Details
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Kartonas</p>
            <p className="text-2xl font-bold">{shipments.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Total Items Shipped</p>
            <p className="text-2xl font-bold text-green-600">
              {shipments.reduce((sum, s) => sum + s.items.reduce((iSum, item) => iSum + item.quantity, 0), 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">Latest Kartona</p>
            <p className="text-lg font-mono font-bold">
              {shipments[0]?.shipment_code || 'N/A'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Shipments List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">All Kartonas</h2>
        
        {shipments.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No kartonas created for this order yet
            </CardContent>
          </Card>
        ) : (
          shipments.map((shipment) => {
            const totalItems = shipment.items.reduce((sum, item) => sum + item.quantity, 0);
            
            return (
              <Card key={shipment.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-green-600" />
                      <div>
                        <CardTitle className="text-lg font-mono">{shipment.shipment_code}</CardTitle>
                        <p className="text-sm text-muted-foreground">
                          Created {format(new Date(shipment.created_at), 'PPP p')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        {totalItems} items
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => printKartona(shipment)}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Contents:</p>
                    <div className="grid gap-2">
                      {shipment.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                          <div>
                            <p className="font-medium">{item.batch?.product?.name || 'Unknown'}</p>
                            <p className="text-sm text-muted-foreground">
                              {item.batch?.product?.sku || 'N/A'}
                              <Badge variant="outline" className="ml-2 text-xs">
                                {item.order_item?.needs_boxing ? 'Boxed' : 'Not Boxed'}
                              </Badge>
                            </p>
                          </div>
                          <span className="font-semibold">× {item.quantity}</span>
                        </div>
                      ))}
                    </div>
                    {shipment.notes && (
                      <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <p className="text-sm"><strong>Notes:</strong> {shipment.notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
