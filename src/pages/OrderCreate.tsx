import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Trash2, ClipboardList, Loader2, Check, ChevronsUpDown, CalendarIcon, Plane, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { z } from 'zod';
import { format } from 'date-fns';

interface Product {
  id: string;
  sku: string;
  name: string;
}

interface Customer {
  id: string;
  name: string;
  code: string | null;
  is_domestic: boolean | null;
}

interface OrderItem {
  product_id: string;
  quantity: number;
  needs_boxing: boolean;
}

interface ExtraProduct {
  id: string;
  product_id: string;
  quantity: number;
  product: Product;
}

const orderSchema = z.object({
  order_number: z.string().trim().min(1, 'Order number is required').max(50, 'Order number too long'),
  notes: z.string().trim().max(500, 'Notes must be less than 500 characters').optional(),
  priority: z.enum(['high', 'normal']),
  shipping_type: z.enum(['domestic', 'international']),
  raw_materials: z.string().optional(),
});

export default function OrderCreate() {
  const { user, hasRole } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'high' | 'normal'>('normal');
  const [shippingType, setShippingType] = useState<'domestic' | 'international'>('domestic');
  const [estimatedFulfillment, setEstimatedFulfillment] = useState<Date | undefined>();
  const [rawMaterials, setRawMaterials] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [eftOpen, setEftOpen] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([{ product_id: '', quantity: 1, needs_boxing: true }]);
  const [extraProducts, setExtraProducts] = useState<ExtraProduct[]>([]);
  const [extraSelections, setExtraSelections] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!hasRole('manufacture_lead') && !hasRole('admin')) {
      navigate('/');
      return;
    }

    fetchData();
  }, [hasRole, navigate]);

  const fetchData = async () => {
    try {
      const [productsRes, extraBatchesRes, customersRes] = await Promise.all([
        supabase.from('products').select('id, sku, name').order('sku'),
        supabase
          .from('batches')
          .select('id, batch_code, product_id, quantity, current_state, product:products(id, sku, name)')
          .eq('batch_type', 'EXTRA')
          .eq('inventory_state', 'AVAILABLE')
          .eq('is_terminated', false),
        supabase.from('customers').select('id, name, code, is_domestic').order('name'),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (extraBatchesRes.error) throw extraBatchesRes.error;
      if (customersRes.error) throw customersRes.error;

      setProducts(productsRes.data || []);
      setExtraProducts(extraBatchesRes.data?.map(b => ({
        id: b.id,
        product_id: b.product_id,
        quantity: b.quantity,
        product: b.product as any,
      })) || []);
      setCustomers(customersRes.data || []);
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

  const addItem = () => {
    setItems([...items, { product_id: '', quantity: 1, needs_boxing: true }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, field: keyof OrderItem, value: string | number | boolean) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validation = orderSchema.safeParse({ order_number: orderNumber, notes, priority, shipping_type: shippingType, raw_materials: rawMaterials });
      if (!validation.success) {
        toast({
          title: 'Validation Error',
          description: validation.error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }

      const validItems = items.filter(item => item.product_id && item.quantity > 0);
      
      // Check if we have at least order items OR extra selections
      const hasExtraSelections = Array.from(extraSelections.values()).some(qty => qty > 0);
      if (validItems.length === 0 && !hasExtraSelections) {
        toast({
          title: 'Validation Error',
          description: 'Please add at least one product with valid quantity',
          variant: 'destructive',
        });
        return;
      }

      setSubmitting(true);

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          order_number: orderNumber.trim(),
          notes: notes.trim() || null,
          priority: priority,
          shipping_type: shippingType,
          estimated_fulfillment_time: estimatedFulfillment?.toISOString() || null,
          created_by: user?.id,
          customer_id: selectedCustomerId,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Save raw materials version if provided
      if (rawMaterials.trim()) {
        await supabase.from('raw_material_versions').insert({
          order_id: order.id,
          version_number: 1,
          content: rawMaterials.trim(),
          created_by: user?.id,
        });
      }

      // Collect all products with their total quantities (merging regular items + extra)
      const productQuantities = new Map<string, { regular: number; extra: number; extraProductId?: string }>();
      
      // Add regular items
      validItems.forEach(item => {
        const existing = productQuantities.get(item.product_id) || { regular: 0, extra: 0 };
        existing.regular += item.quantity;
        productQuantities.set(item.product_id, existing);
      });
      
      // Add extra selections
      for (const [extraId, quantity] of extraSelections.entries()) {
        if (quantity > 0) {
          const extraProduct = extraProducts.find(ep => ep.id === extraId);
          if (extraProduct) {
            const existing = productQuantities.get(extraProduct.product_id) || { regular: 0, extra: 0 };
            existing.extra += quantity;
            existing.extraProductId = extraId;
            productQuantities.set(extraProduct.product_id, existing);
          }
        }
      }

      // Create order items for all products (quantity = total for order tracking)
      const orderItemsToCreate = Array.from(productQuantities.entries()).map(([productId, quantities]) => {
        const item = validItems.find(i => i.product_id === productId);
        return {
          order_id: order.id,
          product_id: productId,
          quantity: quantities.regular + quantities.extra,
          needs_boxing: item?.needs_boxing ?? true,
        };
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsToCreate);

      if (itemsError) throw itemsError;

      // Create batches instead of individual units
      const batchesToCreate = [];
      let totalBatchQuantity = 0;
      
      for (const [productId, quantities] of productQuantities.entries()) {
        // Create batch for regular items (starts at pending_rm)
        if (quantities.regular > 0) {
          const { data: batchCode } = await supabase.rpc('generate_batch_code');
          batchesToCreate.push({
            batch_code: batchCode || `B-${Date.now()}`,
            order_id: order.id,
            product_id: productId,
            current_state: 'pending_rm',
            quantity: quantities.regular,
            created_by: user?.id,
          });
          totalBatchQuantity += quantities.regular;
        }
        
        // Create batch for extra items (starts at received)
        if (quantities.extra > 0) {
          const { data: batchCode } = await supabase.rpc('generate_batch_code');
          batchesToCreate.push({
            batch_code: batchCode || `B-${Date.now()}`,
            order_id: order.id,
            product_id: productId,
            current_state: 'received',
            quantity: quantities.extra,
            created_by: user?.id,
          });
          totalBatchQuantity += quantities.extra;
          
          // Mark extra batch as consumed (or split if partial)
          if (quantities.extraProductId) {
            const extraBatch = extraProducts.find(ep => ep.id === quantities.extraProductId);
            if (extraBatch) {
              if (quantities.extra === extraBatch.quantity) {
                // Full consumption
                await supabase
                  .from('batches')
                  .update({ inventory_state: 'CONSUMED' })
                  .eq('id', quantities.extraProductId);
              } else {
                // Partial consumption - reduce quantity
                await supabase
                  .from('batches')
                  .update({ quantity: extraBatch.quantity - quantities.extra })
                  .eq('id', quantities.extraProductId);
              }
            }
          }
        }
      }

      if (batchesToCreate.length > 0) {
        const { error: batchesError } = await supabase
          .from('batches')
          .insert(batchesToCreate);

        if (batchesError) throw batchesError;
      }

      toast({
        title: 'Success',
        description: `Order ${orderNumber} created with ${totalBatchQuantity} items in ${batchesToCreate.length} batch(es)`,
      });

      navigate('/orders');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

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
        <div className="container mx-auto flex items-center gap-3 px-4 py-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/orders')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">Create New Order</h1>
            <p className="text-sm text-muted-foreground">Add products and quantities</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-3xl p-6">
        <form onSubmit={handleSubmit}>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Order Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="order_number">Order Number *</Label>
                <Input
                  id="order_number"
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="ORD-001"
                  required
                  maxLength={50}
                />
              </div>
              <div>
                <Label>Customer</Label>
                <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerOpen}
                      className="w-full justify-between"
                    >
                      {selectedCustomer
                        ? `${selectedCustomer.name}${selectedCustomer.code ? ` (${selectedCustomer.code})` : ''}`
                        : "Select customer..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search customers..." />
                      <CommandList>
                        <CommandEmpty>No customer found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value=""
                            onSelect={() => {
                              setSelectedCustomerId(null);
                              setCustomerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                !selectedCustomerId ? "opacity-100" : "opacity-0"
                              )}
                            />
                            No customer
                          </CommandItem>
                          {customers.map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={`${customer.name} ${customer.code || ''}`}
                              onSelect={() => {
                                setSelectedCustomerId(customer.id);
                                setCustomerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {customer.name}
                              {customer.code && (
                                <span className="ml-2 text-muted-foreground">({customer.code})</span>
                              )}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="priority">Priority *</Label>
                  <Select value={priority} onValueChange={(value: 'high' | 'normal') => setPriority(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Shipping Type *</Label>
                  <Select value={shippingType} onValueChange={(value: 'domestic' | 'international') => setShippingType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domestic">
                        <span className="flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          Domestic
                        </span>
                      </SelectItem>
                      <SelectItem value="international">
                        <span className="flex items-center gap-2">
                          <Plane className="h-4 w-4" />
                          International
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Estimated Fulfillment Time</Label>
                <Popover open={eftOpen} onOpenChange={setEftOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !estimatedFulfillment && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {estimatedFulfillment ? format(estimatedFulfillment, 'PPP') : 'Select date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={estimatedFulfillment}
                      onSelect={(date) => {
                        setEstimatedFulfillment(date);
                        setEftOpen(false);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="raw_materials">Raw Materials (mandatory info)</Label>
                <Textarea
                  id="raw_materials"
                  value={rawMaterials}
                  onChange={(e) => setRawMaterials(e.target.value)}
                  placeholder="Enter raw material details for this order..."
                  rows={3}
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional order notes..."
                  rows={2}
                  maxLength={500}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Order Items</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Item
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label>Product *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {item.product_id
                            ? products.find(p => p.id === item.product_id)
                              ? `${products.find(p => p.id === item.product_id)?.sku} - ${products.find(p => p.id === item.product_id)?.name}`
                              : "Select product..."
                            : "Select product..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search products by SKU or name..." />
                          <CommandList>
                            <CommandEmpty>No product found.</CommandEmpty>
                            <CommandGroup>
                              {products.map((product) => (
                                <CommandItem
                                  key={product.id}
                                  value={`${product.sku} ${product.name}`}
                                  onSelect={() => updateItem(index, 'product_id', product.id)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      item.product_id === product.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <span className="font-mono mr-2">{product.sku}</span>
                                  <span className="text-muted-foreground">{product.name}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="w-32">
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Checkbox
                      id={`needs_boxing_${index}`}
                      checked={item.needs_boxing}
                      onCheckedChange={(checked) => updateItem(index, 'needs_boxing', !!checked)}
                    />
                    <Label htmlFor={`needs_boxing_${index}`} className="text-xs cursor-pointer">Boxing</Label>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(index)}
                    disabled={items.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {extraProducts.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Extra Products Inventory (Finished Units)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {extraProducts.filter(ep => ep.quantity > 0).map((extra) => (
                  <div key={extra.id} className="flex items-center gap-4 p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{extra.product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        SKU: {extra.product.sku} • Available: {extra.quantity}
                      </p>
                    </div>
                    <div className="w-32">
                      <Label htmlFor={`extra-${extra.id}`} className="text-xs">
                        Use Qty
                      </Label>
                      <Input
                        id={`extra-${extra.id}`}
                        type="number"
                        min="0"
                        max={extra.quantity}
                        value={extraSelections.get(extra.id) || ''}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value) || 0;
                          const clamped = Math.max(0, Math.min(qty, extra.quantity));
                          setExtraSelections(prev => {
                            const newMap = new Map(prev);
                            if (clamped > 0) {
                              newMap.set(extra.id, clamped);
                            } else {
                              newMap.delete(extra.id);
                            }
                            return newMap;
                          });
                        }}
                        placeholder="0"
                        className="mt-1"
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-4">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Order...
                </>
              ) : (
                'Create Order'
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate('/orders')}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}