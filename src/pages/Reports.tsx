import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, FileDown, ClipboardList, Factory, Warehouse, Tag } from 'lucide-react';
import { ExportsTab } from '@/components/reports/ExportsTab';
import { OrderPerformanceTab } from '@/components/reports/OrderPerformanceTab';
import { ProductionFlowTab } from '@/components/reports/ProductionFlowTab';
import { InventoryBoxesTab } from '@/components/reports/InventoryBoxesTab';
import { CatalogInsightsTab } from '@/components/reports/CatalogInsightsTab';

export default function Reports() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [orderItems, setOrderItems] = useState<any[]>([]);
  const [unitHistory, setUnitHistory] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [shipments, setShipments] = useState<any[]>([]);
  const [extraHistory, setExtraHistory] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [
        ordersRes,
        productsRes,
        orderItemsRes,
        unitHistoryRes,
        unitsRes,
        boxesRes,
        shipmentsRes,
        extraHistoryRes,
      ] = await Promise.all([
        supabase.from('orders').select('id, order_number, status, priority, created_at, updated_at, estimated_fulfillment_time, customer_id'),
        supabase.from('products').select('id, name'),
        supabase.from('order_items').select('order_id, product_id, quantity'),
        supabase.from('unit_history').select('unit_id, prev_state, new_state, created_at'),
        supabase.from('units').select('id, state, product_id'),
        supabase.from('boxes').select('id, box_code, created_at, items_list'),
        supabase.from('shipments').select('id, created_at, status'),
        supabase.from('extra_batch_history').select('event_type, quantity, created_at, from_state, product_id'),
      ]);

      setOrders(ordersRes.data || []);
      setProducts(productsRes.data || []);
      setOrderItems(orderItemsRes.data || []);
      setUnitHistory(unitHistoryRes.data || []);
      setUnits(unitsRes.data || []);
      setBoxes(boxesRes.data || []);
      setShipments(shipmentsRes.data || []);
      setExtraHistory(extraHistoryRes.data || []);

      const customersRes = await supabase.from('customers').select('id, name, code, country');
      setCustomers(customersRes.data || []);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <BarChart3 className="h-7 w-7 text-primary" />
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
        </div>
        <p className="text-muted-foreground text-sm ml-10">
          Operational insights across orders, production, and inventory
        </p>
      </div>

      <Tabs defaultValue="order-performance" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 h-11">
          <TabsTrigger value="exports" className="flex items-center gap-2 text-xs sm:text-sm">
            <FileDown className="h-4 w-4 hidden sm:block" />
            Exports
          </TabsTrigger>
          <TabsTrigger value="order-performance" className="flex items-center gap-2 text-xs sm:text-sm">
            <ClipboardList className="h-4 w-4 hidden sm:block" />
            Order Performance
          </TabsTrigger>
          <TabsTrigger value="production-flow" className="flex items-center gap-2 text-xs sm:text-sm">
            <Factory className="h-4 w-4 hidden sm:block" />
            Production Flow
          </TabsTrigger>
          <TabsTrigger value="inventory-boxes" className="flex items-center gap-2 text-xs sm:text-sm">
            <Warehouse className="h-4 w-4 hidden sm:block" />
            Inventory & Boxes
          </TabsTrigger>
          <TabsTrigger value="catalog-insights" className="flex items-center gap-2 text-xs sm:text-sm">
            <Tag className="h-4 w-4 hidden sm:block" />
            Catalog Insights
          </TabsTrigger>
        </TabsList>

        <TabsContent value="exports">
          <ExportsTab />
        </TabsContent>

        <TabsContent value="order-performance">
          <OrderPerformanceTab orders={orders} products={products} orderItems={orderItems} />
        </TabsContent>

        <TabsContent value="production-flow">
          <ProductionFlowTab unitHistory={unitHistory} units={units} products={products} />
        </TabsContent>

        <TabsContent value="inventory-boxes">
          <InventoryBoxesTab boxes={boxes} shipments={shipments} extraHistory={extraHistory} products={products} />
        </TabsContent>

        <TabsContent value="catalog-insights">
          <CatalogInsightsTab orders={orders} orderItems={orderItems} products={products} customers={customers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
