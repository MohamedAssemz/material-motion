import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { BarChart3, FileDown, ClipboardList, Factory, Warehouse, Tag, ArrowLeft, Wrench } from 'lucide-react';
import { ExportsTab } from '@/components/reports/ExportsTab';
import { OrderPerformanceTab } from '@/components/reports/OrderPerformanceTab';
import { ProductionFlowTab } from '@/components/reports/ProductionFlowTab';
import { InventoryBoxesTab } from '@/components/reports/InventoryBoxesTab';
import { CatalogInsightsTab } from '@/components/reports/CatalogInsightsTab';
import { MachineProductionTab } from '@/components/reports/MachineProductionTab';

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
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'order-performance');
  const [showExports, setShowExports] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);
  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    try {
      const [
        ordersRes,
        productsRes,
        orderItemsRes,
        boxesRes,
        shipmentsRes,
        extraHistoryRes,
      ] = await Promise.all([
        supabase.from('orders').select('id, order_number, status, priority, created_at, updated_at, estimated_fulfillment_time, customer_id'),
        supabase.from('products').select('id, name'),
        supabase.from('order_items').select('order_id, product_id, quantity'),
        supabase.from('boxes').select('id, box_code, created_at, items_list'),
        supabase.from('shipments').select('id, created_at, status'),
        supabase.from('extra_batch_history').select('event_type, quantity, created_at, from_state, product_id'),
      ]);

      setOrders(ordersRes.data || []);
      setProducts(productsRes.data || []);
      setOrderItems(orderItemsRes.data || []);
      setUnitHistory([]);
      setUnits([]);
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

  if (showExports) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 mb-1">
            <button onClick={() => setShowExports(false)} className="p-1 rounded-md hover:bg-muted transition-colors">
              <ArrowLeft className="h-6 w-6 text-muted-foreground" />
            </button>
            <FileDown className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Exports</h1>
          </div>
          <Button variant="outline" onClick={() => setShowExports(false)}>
            ← Back to Reports
          </Button>
        </div>
        <ExportsTab />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BarChart3 className="h-7 w-7 text-primary" />
            <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          </div>
          <p className="text-muted-foreground text-sm ml-10">
            Operational insights across orders, production, and inventory
          </p>
        </div>
        <Button onClick={() => setShowExports(true)} className="bg-blue-600 hover:bg-blue-700 text-white">
          <FileDown className="mr-2 h-4 w-4" />
          Exports
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 h-11">
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

        <TabsContent value="order-performance">
          <OrderPerformanceTab orders={orders} products={products} orderItems={orderItems} customers={customers} />
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
