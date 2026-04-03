import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Plus,
  Trash2,
  ClipboardList,
  Loader2,
  Check,
  ChevronsUpDown,
  CalendarIcon,
  Plane,
  Truck,
  Package,
} from "lucide-react";
import { RawMaterialImageUpload } from "@/components/RawMaterialImageUpload";
import { CountrySelect } from "@/components/catalog/CountrySelect";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { format } from "date-fns";
import { SIZE_OPTIONS } from "@/lib/catalogConstants";

interface Product {
  id: string;
  sku: string;
  name_en: string;
  sizes: string[] | null;
}

interface Customer {
  id: string;
  name: string;
  code: string | null;
  is_domestic: boolean | null;
}

interface OrderItem {
  product_id: string;
  sizeQuantities: Record<string, number>;
  needs_boxing: boolean;
  is_special: boolean;
  initial_state: string;
}

const orderSchema = z.object({
  order_number: z.string().trim().min(1, "Order number is required").max(50, "Order number too long"),
  reference_number: z.string().trim().max(50, "Reference number too long").optional(),
  notes: z.string().trim().max(500, "Notes must be less than 500 characters").optional(),
  priority: z.enum(["low", "normal", "high"]),
  shipping_type: z.enum(["domestic", "international"]),
  raw_materials: z.string().optional(),
});

export default function OrderCreate() {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [referenceNumber, setReferenceNumber] = useState("");
  const [orderNumberLoading, setOrderNumberLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [shippingType, setShippingType] = useState<"domestic" | "international">("domestic");
  const [country, setCountry] = useState("");
  const [estimatedFulfillment, setEstimatedFulfillment] = useState<Date | undefined>();
  const [rawMaterials, setRawMaterials] = useState("");
  const [rawMaterialImages, setRawMaterialImages] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [eftOpen, setEftOpen] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([{ product_id: "", sizeQuantities: {}, needs_boxing: true, is_special: false, initial_state: "in_manufacturing" }]);
  const [customerProductMapping, setCustomerProductMapping] = useState<Map<string, Set<string>>>(new Map());
  const [showPackagingRef, setShowPackagingRef] = useState(false);
  const [productPopoverOpen, setProductPopoverOpen] = useState<Record<number, boolean>>({});
  const [packagingRows, setPackagingRows] = useState<Array<{ item_index: number; quantity: number; length_cm: string; width_cm: string; height_cm: string; weight_kg: string }>>([]);

  useEffect(() => {
    fetchData();
    generateOrderNumber();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, customersRes, productCustomersRes] = await Promise.all([
        supabase.from("products").select("id, sku, name_en, sizes").order("sku"),
        supabase.from("customers").select("id, name, code, is_domestic").order("name"),
        supabase.from("product_customers").select("product_id, customer_id"),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;
      if (productCustomersRes.error) throw productCustomersRes.error;

      const customerProductMap = new Map<string, Set<string>>();
      (productCustomersRes.data || []).forEach((pc: any) => {
        if (!customerProductMap.has(pc.customer_id)) {
          customerProductMap.set(pc.customer_id, new Set());
        }
        customerProductMap.get(pc.customer_id)!.add(pc.product_id);
      });

      setProducts(productsRes.data || []);
      setCustomers(customersRes.data || []);
      setCustomerProductMapping(customerProductMap);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateOrderNumber = async () => {
    try {
      setOrderNumberLoading(true);
      const { data, error } = await supabase.rpc('generate_order_number');
      if (error) throw error;
      setOrderNumber(data || `ORD-${Date.now()}`);
    } catch (error: any) {
      console.error('Failed to generate order number:', error);
      setOrderNumber(`ORD-${Date.now()}`);
    } finally {
      setOrderNumberLoading(false);
    }
  };

  const addItem = () => {
    setItems([...items, { product_id: "", sizeQuantities: {}, needs_boxing: true, is_special: false, initial_state: "in_manufacturing" }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const updateItem = (index: number, updates: Partial<OrderItem>) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], ...updates };
    // If product changed, reset sizeQuantities
    if (updates.product_id !== undefined && updates.product_id !== items[index].product_id) {
      newItems[index].sizeQuantities = {};
    }
    setItems(newItems);
  };

  const updateSizeQty = (itemIndex: number, size: string, qty: number | undefined) => {
    const newItems = [...items];
    const newSizeQties = { ...newItems[itemIndex].sizeQuantities };
    if (qty === undefined || qty <= 0) {
      delete newSizeQties[size];
    } else {
      newSizeQties[size] = qty;
    }
    newItems[itemIndex] = { ...newItems[itemIndex], sizeQuantities: newSizeQties };
    setItems(newItems);
  };

  const getItemTotalQty = (item: OrderItem): number => {
    return Object.values(item.sizeQuantities).reduce((sum, q) => sum + q, 0);
  };

  const getProductSizes = (productId: string): string[] => {
    const product = products.find(p => p.id === productId);
    const sizes = product?.sizes || [];
    // Sort by SIZE_OPTIONS order
    return [...sizes].sort((a, b) => {
      const ai = SIZE_OPTIONS.indexOf(a as any);
      const bi = SIZE_OPTIONS.indexOf(b as any);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validation = orderSchema.safeParse({
        order_number: orderNumber,
        reference_number: referenceNumber,
        notes,
        priority,
        shipping_type: shippingType,
        raw_materials: rawMaterials,
      });
      if (!validation.success) {
        toast({
          title: "Validation Error",
          description: validation.error.errors[0].message,
          variant: "destructive",
        });
        return;
      }

      // Validate: at least one item with quantity
      const hasValidItems = items.some(item => item.product_id && getItemTotalQty(item) > 0);
      if (!hasValidItems) {
        toast({
          title: "Validation Error",
          description: "Please add at least one product with valid quantity",
          variant: "destructive",
        });
        return;
      }

      setSubmitting(true);

      // Build final notes with packaging reference
      let finalNotes = notes.trim();
      const validPackagingRows = packagingRows.filter(r => r.item_index >= 0 && r.quantity > 0);
      if (validPackagingRows.length > 0) {
        const packagingBlock = validPackagingRows.map((row, i) => {
          const item = items[row.item_index];
          const product = item ? products.find(p => p.id === item.product_id) : null;
          const boxingLabel = item ? (item.needs_boxing ? '' : ' [No Boxing]') : '';
          const dims = [
            row.length_cm ? `L:${row.length_cm}` : '',
            row.width_cm ? `W:${row.width_cm}` : '',
            row.height_cm ? `H:${row.height_cm}` : '',
            row.weight_kg ? `Wt:${row.weight_kg}` : '',
          ].filter(Boolean).join(' ');
          const dimsSuffix = dims ? ` {${dims}}` : '';
          return `Shipment ${i + 1}: [${product?.sku || "?"}] ${product?.name_en || "Unknown"}${boxingLabel} x ${row.quantity}${dimsSuffix}`;
        }).join("\n");
        const block = `\n---PACKAGING_REFERENCE---\n${packagingBlock}\n---END_PACKAGING_REFERENCE---`;
        finalNotes = finalNotes ? finalNotes + block : block.trim();
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber.trim(),
          reference_number: referenceNumber.trim() || null,
          notes: finalNotes || null,
          priority: priority,
          shipping_type: shippingType,
          estimated_fulfillment_time: estimatedFulfillment?.toISOString() || null,
          created_by: user?.id,
          customer_id: selectedCustomerId,
          country: country || null,
        } as any)
        .select()
        .single();

      if (orderError) throw orderError;

      // Save raw materials version if provided
      if (rawMaterials.trim() || rawMaterialImages.length > 0) {
        await supabase.from("raw_material_versions").insert({
          order_id: order.id,
          version_number: 1,
          content: rawMaterials.trim(),
          images: rawMaterialImages,
          created_by: user?.id,
        });
      }

      // Create order items: one per product+size combination
      let totalBatchQuantity = 0;

      for (const item of items) {
        if (!item.product_id) continue;
        const sizes = getProductSizes(item.product_id);
        const hasSizes = sizes.length > 0;

        if (hasSizes) {
          // Create one order_item per size that has quantity
          for (const size of sizes) {
            const qty = item.sizeQuantities[size];
            if (!qty || qty <= 0) continue;

            const { data: orderItem, error: itemError } = await supabase
              .from("order_items")
              .insert({
                order_id: order.id,
                product_id: item.product_id,
                quantity: qty,
                needs_boxing: item.needs_boxing,
                is_special: item.is_special,
                initial_state: item.is_special ? item.initial_state : null,
                size: size,
              } as any)
              .select()
              .single();

            if (itemError) throw itemError;

            const { data: batchCode } = await supabase.rpc("generate_batch_code");
            const { error: batchError } = await supabase.from("order_batches").insert({
              qr_code_data: batchCode || `B-${Date.now()}`,
              order_id: order.id,
              order_item_id: orderItem.id,
              product_id: item.product_id,
              current_state: item.is_special ? item.initial_state : "in_manufacturing",
              quantity: qty,
              created_by: user?.id,
              is_special: item.is_special,
            });
            if (batchError) throw batchError;
            totalBatchQuantity += qty;
          }
        } else {
          // Product with no sizes - use total as single item (backward compat)
          const totalQty = getItemTotalQty(item);
          if (totalQty <= 0) continue;

          const { data: orderItem, error: itemError } = await supabase
            .from("order_items")
            .insert({
              order_id: order.id,
              product_id: item.product_id,
              quantity: totalQty,
              needs_boxing: item.needs_boxing,
              is_special: item.is_special,
              initial_state: item.is_special ? item.initial_state : null,
            })
            .select()
            .single();

          if (itemError) throw itemError;

          const { data: batchCode } = await supabase.rpc("generate_batch_code");
          const { error: batchError } = await supabase.from("order_batches").insert({
            qr_code_data: batchCode || `B-${Date.now()}`,
            order_id: order.id,
            order_item_id: orderItem.id,
            product_id: item.product_id,
            current_state: item.is_special ? item.initial_state : "in_manufacturing",
            quantity: totalQty,
            created_by: user?.id,
            is_special: item.is_special,
          });
          if (batchError) throw batchError;
          totalBatchQuantity += totalQty;
        }
      }

      // Log activity
      await supabase.from("order_activity_logs").insert({
        order_id: order.id,
        action: "created",
        performed_by: user?.id,
        details: { total_items: items.filter(i => i.product_id).length, total_units: totalBatchQuantity },
      });

      toast({
        title: "Success",
        description: `Order ${orderNumber} created with ${totalBatchQuantity} total units`,
      });

      navigate("/orders");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

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
          <Button variant="ghost" size="icon" onClick={() => navigate("/orders")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <ClipboardList className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-bold">{t('order.create_new')}</h1>
            <p className="text-sm text-muted-foreground">{t('order.add_products_quantities')}</p>
          </div>
        </div>
      </header>

      <div className="container mx-auto max-w-3xl p-6">
        <form onSubmit={handleSubmit}>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t('order.order_details')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="order_number">{t('order.order_number')} *</Label>
                <Input
                  id="order_number"
                  value={orderNumberLoading ? '...' : orderNumber}
                  readOnly
                  disabled
                  className="bg-muted font-mono"
                />
                <p className="text-xs text-muted-foreground mt-1">{t('order.auto_generated')}</p>
              </div>
              <div>
                <Label htmlFor="reference_number">{t('order.reference_number')}</Label>
                <Input
                  id="reference_number"
                  value={referenceNumber}
                  onChange={(e) => setReferenceNumber(e.target.value)}
                  placeholder={t('order.reference_number_placeholder')}
                  maxLength={50}
                />
              </div>
              <div>
                <Label>{t('order.customer')}</Label>
                <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerOpen}
                      className="w-full justify-between"
                    >
                      {selectedCustomer
                        ? `${selectedCustomer.name}${selectedCustomer.code ? ` (${selectedCustomer.code})` : ""}`
                        : t('order.select_customer')}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder={t('order.search_customers')} />
                      <CommandList>
                        <CommandEmpty>{t('order.no_customer_found')}</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value=""
                            onSelect={() => {
                              setSelectedCustomerId(null);
                              setCustomerOpen(false);
                            }}
                          >
                            <Check className={cn("me-2 h-4 w-4", !selectedCustomerId ? "opacity-100" : "opacity-0")} />
                            {t('order.no_customer')}
                          </CommandItem>
                          {customers.map((customer) => (
                            <CommandItem
                              key={customer.id}
                              value={`${customer.name} ${customer.code || ""}`}
                              onSelect={() => {
                                setSelectedCustomerId(customer.id);
                                setCustomerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedCustomerId === customer.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              {customer.name}
                              {customer.code && <span className="ml-2 text-muted-foreground">({customer.code})</span>}
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
                  <Label htmlFor="priority">{t('order.priority')} *</Label>
                  <Select value={priority} onValueChange={(value: "low" | "normal" | "high") => setPriority(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">{t('order.priority_low')}</SelectItem>
                      <SelectItem value="normal">{t('order.priority_normal')}</SelectItem>
                      <SelectItem value="high">{t('order.priority_high')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('order.shipping_type')} *</Label>
                  <Select
                    value={shippingType}
                    onValueChange={(value: "domestic" | "international") => setShippingType(value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domestic">
                        <span className="flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          {t('order.domestic')}
                        </span>
                      </SelectItem>
                      <SelectItem value="international">
                        <span className="flex items-center gap-2">
                          <Plane className="h-4 w-4" />
                          {t('order.international')}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{t('order.estimated_fulfillment')}</Label>
                <Popover open={eftOpen} onOpenChange={setEftOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !estimatedFulfillment && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {estimatedFulfillment ? format(estimatedFulfillment, "PPP") : t('order.select_date')}
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
                <Label>{t('order.country')}</Label>
                <CountrySelect
                  value={country}
                  onValueChange={setCountry}
                  placeholder={t('order.select_country')}
                />
              </div>
              <div>
                <Label htmlFor="raw_materials">{t('order.raw_materials')}</Label>
                <Textarea
                  id="raw_materials"
                  value={rawMaterials}
                  onChange={(e) => setRawMaterials(e.target.value)}
                  placeholder={t('order.raw_materials_placeholder')}
                  rows={3}
                />
                <div className="mt-2">
                  <RawMaterialImageUpload
                    images={rawMaterialImages}
                    onChange={setRawMaterialImages}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t('order.order_items')}</CardTitle>
                <Button type="button" variant="outline" size="sm" onClick={addItem}>
                  <Plus className="me-2 h-4 w-4" />
                  {t('order.add_item')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {items.map((item, index) => {
                const selectedProduct = products.find((p) => p.id === item.product_id);
                const productSizes = item.product_id ? getProductSizes(item.product_id) : [];
                const totalQty = getItemTotalQty(item);

                return (
                  <div
                    key={index}
                    className={cn(
                      "rounded-lg border bg-muted/30 p-4 space-y-3 transition-colors",
                      item.is_special && "border-primary/40 bg-primary/5"
                    )}
                  >
                    {/* Row 1: Product selector + Delete */}
                    <div className="flex gap-3 items-start">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground mb-1 block">{t('order.product')} *</Label>
                      <Popover open={productPopoverOpen[index] || false} onOpenChange={(open) => setProductPopoverOpen(prev => ({ ...prev, [index]: open }))}>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="w-full justify-between h-9 text-sm">
                              {selectedProduct
                                ? <span className="truncate"><span className="font-mono">{selectedProduct.sku}</span> — {selectedProduct.name_en}</span>
                                : <span className="text-muted-foreground">{t('order.select_product')}</span>}
                              <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[400px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder={t('order.search_products')} />
                              <CommandList>
                                <CommandEmpty>{t('order.no_product_found')}</CommandEmpty>
                                {selectedCustomerId &&
                                  (() => {
                                    const suggestedIds = customerProductMapping.get(selectedCustomerId);
                                    const suggestedProducts = suggestedIds
                                      ? products.filter((p) => suggestedIds.has(p.id))
                                      : [];
                                    if (suggestedProducts.length > 0) {
                                      return (
                                        <CommandGroup heading={t('order.suggested_for_customer')}>
                                          {suggestedProducts.map((product) => (
                                            <CommandItem
                                              key={`suggested-${product.id}`}
                                              value={`suggested-${product.sku} ${product.name_en}`}
                                              onSelect={() => { updateItem(index, { product_id: product.id }); setProductPopoverOpen(prev => ({ ...prev, [index]: false })); }}
                                            >
                                              <Check className={cn("mr-2 h-4 w-4", item.product_id === product.id ? "opacity-100" : "opacity-0")} />
                                              <span className="font-mono mr-2">{product.sku}</span>
                                              <span className="text-muted-foreground">{product.name_en}</span>
                                              <Badge variant="secondary" className="ms-2 text-xs">{t('order.suggested')}</Badge>
                                            </CommandItem>
                                          ))}
                                        </CommandGroup>
                                      );
                                    }
                                    return null;
                                  })()}
                                <CommandGroup heading={selectedCustomerId ? t('order.all_products') : undefined}>
                                  {products.map((product) => (
                                    <CommandItem
                                      key={product.id}
                                      value={`${product.sku} ${product.name_en}`}
                                      onSelect={() => { updateItem(index, { product_id: product.id }); setProductPopoverOpen(prev => ({ ...prev, [index]: false })); }}
                                    >
                                      <Check className={cn("mr-2 h-4 w-4", item.product_id === product.id ? "opacity-100" : "opacity-0")} />
                                      <span className="font-mono mr-2">{product.sku}</span>
                                      <span className="text-muted-foreground">{product.name_en}</span>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-5 h-9 w-9 text-muted-foreground hover:text-destructive"
                        onClick={() => removeItem(index)}
                        disabled={items.length === 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Row 2: Size quantity inputs */}
                    {item.product_id && productSizes.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs text-muted-foreground">{t('catalog.sizes')}</Label>
                          {totalQty > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {t('order.total')}: {totalQty}
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {productSizes.map((size) => (
                            <div key={size} className="space-y-1">
                              <Label className="text-xs font-medium text-center block">{size}</Label>
                              <NumericInput
                                min={0}
                                value={item.sizeQuantities[size] || undefined}
                                onValueChange={(val) => updateSizeQty(index, size, val)}
                                placeholder="0"
                                className="h-8 text-center text-sm"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Fallback: single quantity for products without sizes */}
                    {item.product_id && productSizes.length === 0 && (
                      <div className="w-32">
                        <Label className="text-xs text-muted-foreground mb-1 block">{t('order.quantity')} *</Label>
                        <NumericInput
                          min={1}
                          value={item.sizeQuantities["_default"] || undefined}
                          onValueChange={(val) => updateSizeQty(index, "_default", val)}
                          className="h-9"
                        />
                      </div>
                    )}

                    {/* Row 3: Toggles and options */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={item.needs_boxing}
                          onCheckedChange={(checked) => updateItem(index, { needs_boxing: !!checked })}
                        />
                        <span className="text-sm">{t('order.boxing')}</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={item.is_special}
                          onCheckedChange={(checked) => {
                            updateItem(index, {
                              is_special: !!checked,
                              ...(!checked ? { initial_state: "in_manufacturing" } : {}),
                            });
                          }}
                        />
                        <span className="text-sm">{t('order.special')}</span>
                      </label>

                      {item.is_special && (
                        <div className="flex items-center gap-2 ml-auto">
                          <span className="text-xs text-muted-foreground">{t('order.initial_state')}:</span>
                          <Select
                            value={item.initial_state}
                            onValueChange={(val) => updateItem(index, { initial_state: val })}
                          >
                            <SelectTrigger className="h-8 w-36 text-xs">
                              <SelectValue placeholder={t('order.select_initial_state')} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="in_manufacturing">{t('state.manufacturing')}</SelectItem>
                              <SelectItem value="in_finishing">{t('state.finishing')}</SelectItem>
                              <SelectItem value="in_packaging">{t('state.packaging')}</SelectItem>
                              <SelectItem value="in_boxing">{t('state.boxing')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {/* Notes & Packaging Reference */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>{t('order.notes_packaging')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="notes">{t('order.notes')}</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t('order.notes_placeholder')}
                  rows={2}
                  maxLength={500}
                />
              </div>

              {!showPackagingRef ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowPackagingRef(true);
                    if (packagingRows.length === 0) {
                      setPackagingRows([{ item_index: -1, quantity: 1, length_cm: '', width_cm: '', height_cm: '', weight_kg: '' }]);
                    }
                  }}
                >
                  <Package className="me-2 h-4 w-4" />
                  {t('order.add_packaging_ref')}
                </Button>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">{t('order.packaging_reference')}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowPackagingRef(false);
                        setPackagingRows([]);
                      }}
                    >
                      {t('order.remove')}
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {packagingRows.map((row, index) => {
                      const validItems = items.filter(it => it.product_id && getItemTotalQty(it) > 0);
                      const orderItem = row.item_index >= 0 ? items[row.item_index] : undefined;
                      const totalAllocated = packagingRows
                        .filter((r, i) => i !== index && r.item_index === row.item_index && r.item_index >= 0)
                        .reduce((sum, r) => sum + r.quantity, 0);
                      const maxQty = orderItem ? getItemTotalQty(orderItem) - totalAllocated : 1;

                      return (
                        <div key={index} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="shrink-0">#{index + 1}</Badge>
                            <Select
                              value={row.item_index >= 0 ? String(row.item_index) : ""}
                              onValueChange={(val) => {
                                const newRows = [...packagingRows];
                                newRows[index] = { ...newRows[index], item_index: parseInt(val), quantity: 1 };
                                setPackagingRows(newRows);
                              }}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder={t('order.select_item')} />
                              </SelectTrigger>
                              <SelectContent>
                                {validItems.map((it) => {
                                  const originalIndex = items.indexOf(it);
                                  const product = products.find(p => p.id === it.product_id);
                                  const totalAllocatedForItem = packagingRows
                                    .filter((r, ri) => ri !== index && r.item_index === originalIndex)
                                    .reduce((sum, r) => sum + r.quantity, 0);
                                  const remaining = getItemTotalQty(it) - totalAllocatedForItem;
                                  if (remaining <= 0 && row.item_index !== originalIndex) return null;
                                  return (
                                    <SelectItem key={originalIndex} value={String(originalIndex)}>
                                      {product?.sku} - {product?.name_en} ({it.needs_boxing ? t('order.boxing') : t('order.no_boxing')}) x{getItemTotalQty(it)}
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                            <NumericInput
                              min={1}
                              max={maxQty > 0 ? maxQty : 1}
                              value={row.quantity}
                              onValueChange={(val) => {
                                const newRows = [...packagingRows];
                                newRows[index] = { ...newRows[index], quantity: val ?? 1 };
                                setPackagingRows(newRows);
                              }}
                              className="w-20"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setPackagingRows(packagingRows.filter((_, i) => i !== index));
                                if (packagingRows.length === 1) setShowPackagingRef(false);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-4 gap-2 pl-10">
                            <div>
                              <Label className="text-xs text-muted-foreground">{t('order.length_cm')}</Label>
                              <Input type="number" min={0} step="0.1" value={row.length_cm} onChange={(e) => { const newRows = [...packagingRows]; newRows[index] = { ...newRows[index], length_cm: e.target.value }; setPackagingRows(newRows); }} placeholder="—" />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">{t('order.width_cm')}</Label>
                              <Input type="number" min={0} step="0.1" value={row.width_cm} onChange={(e) => { const newRows = [...packagingRows]; newRows[index] = { ...newRows[index], width_cm: e.target.value }; setPackagingRows(newRows); }} placeholder="—" />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">{t('order.height_cm')}</Label>
                              <Input type="number" min={0} step="0.1" value={row.height_cm} onChange={(e) => { const newRows = [...packagingRows]; newRows[index] = { ...newRows[index], height_cm: e.target.value }; setPackagingRows(newRows); }} placeholder="—" />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">{t('order.weight_kg')}</Label>
                              <Input type="number" min={0} step="0.1" value={row.weight_kg} onChange={(e) => { const newRows = [...packagingRows]; newRows[index] = { ...newRows[index], weight_kg: e.target.value }; setPackagingRows(newRows); }} placeholder="—" />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPackagingRows([...packagingRows, { item_index: -1, quantity: 1, length_cm: '', width_cm: '', height_cm: '', weight_kg: '' }])}
                  >
                    <Plus className="me-2 h-4 w-4" />
                    {t('order.add_shipment')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex gap-4">
            <Button type="submit" disabled={submitting} className="flex-1">
              {submitting ? (
                <>
                  <Loader2 className="me-2 h-4 w-4 animate-spin" />
                  {t('order.creating_order')}
                </>
              ) : (
                t('order.create_order')
              )}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate("/orders")}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
