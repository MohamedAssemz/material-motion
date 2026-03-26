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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { format } from "date-fns";

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
  is_special: boolean;
  initial_state: string;
}

const orderSchema = z.object({
  order_number: z.string().trim().min(1, "Order number is required").max(50, "Order number too long"),
  notes: z.string().trim().max(500, "Notes must be less than 500 characters").optional(),
  priority: z.enum(["high", "normal"]),
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
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<"high" | "normal">("normal");
  const [shippingType, setShippingType] = useState<"domestic" | "international">("domestic");
  const [country, setCountry] = useState("");
  const [estimatedFulfillment, setEstimatedFulfillment] = useState<Date | undefined>();
  const [rawMaterials, setRawMaterials] = useState("");
  const [rawMaterialImages, setRawMaterialImages] = useState<string[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [eftOpen, setEftOpen] = useState(false);
  const [items, setItems] = useState<OrderItem[]>([{ product_id: "", quantity: 1, needs_boxing: true, is_special: false, initial_state: "in_manufacturing" }]);
  const [customerProductMapping, setCustomerProductMapping] = useState<Map<string, Set<string>>>(new Map());
  const [showPackagingRef, setShowPackagingRef] = useState(false);
  const [packagingRows, setPackagingRows] = useState<Array<{ item_index: number; quantity: number; length_cm: string; width_cm: string; height_cm: string; weight_kg: string }>>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, customersRes, productCustomersRes] = await Promise.all([
        supabase.from("products").select("id, sku, name").order("sku"),
        supabase.from("customers").select("id, name, code, is_domestic").order("name"),
        supabase.from("product_customers").select("product_id, customer_id"),
      ]);

      if (productsRes.error) throw productsRes.error;
      if (customersRes.error) throw customersRes.error;
      if (productCustomersRes.error) throw productCustomersRes.error;

      // Build customer->product mapping (directly by product_id)
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

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 1, needs_boxing: true, is_special: false, initial_state: "in_manufacturing" }]);
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
      const validation = orderSchema.safeParse({
        order_number: orderNumber,
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

      const validItems = items.filter((item) => item.product_id && item.quantity > 0);

      if (validItems.length === 0) {
        toast({
          title: "Validation Error",
          description: "Please add at least one product with valid quantity",
          variant: "destructive",
        });
        return;
      }

      setSubmitting(true);

      // Create order
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
          return `Shipment ${i + 1}: [${product?.sku || "?"}] ${product?.name || "Unknown"}${boxingLabel} x ${row.quantity}${dimsSuffix}`;
        }).join("\n");
        const block = `\n---PACKAGING_REFERENCE---\n${packagingBlock}\n---END_PACKAGING_REFERENCE---`;
        finalNotes = finalNotes ? finalNotes + block : block.trim();
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          order_number: orderNumber.trim(),
          notes: finalNotes || null,
          priority: priority,
          shipping_type: shippingType,
          estimated_fulfillment_time: estimatedFulfillment?.toISOString() || null,
          created_by: user?.id,
          customer_id: selectedCustomerId,
          country: country || null,
        })
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

      // Create order items for each item row separately (preserving identity)
      // Items with same product but different needs_boxing stay separate
      const createdOrderItems: Array<{
        id: string;
        product_id: string;
        quantity: number;
        needs_boxing: boolean;
        is_special: boolean;
        initial_state: string;
        isExtra?: boolean;
        extraProductId?: string;
      }> = [];

      // Create order items for regular items
      for (const item of validItems) {
        const { data: orderItem, error: itemError } = await supabase
          .from("order_items")
          .insert({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            needs_boxing: item.needs_boxing,
            is_special: item.is_special,
            initial_state: item.is_special ? item.initial_state : null,
          })
          .select()
          .single();

        if (itemError) throw itemError;
        createdOrderItems.push({
          id: orderItem.id,
          product_id: item.product_id,
          quantity: item.quantity,
          needs_boxing: item.needs_boxing,
          is_special: item.is_special,
          initial_state: item.initial_state,
        });
      }

      // Create batches linked to each order item
      let totalBatchQuantity = 0;

      for (const orderItem of createdOrderItems) {
        const { data: batchCode } = await supabase.rpc("generate_batch_code");

        const { error: batchError } = await supabase.from("order_batches").insert({
          qr_code_data: batchCode || `EB-${Date.now()}`,
          order_id: order.id,
          order_item_id: orderItem.id,
          product_id: orderItem.product_id,
          current_state: orderItem.is_special ? orderItem.initial_state : "in_manufacturing",
          quantity: orderItem.quantity,
          created_by: user?.id,
          is_special: orderItem.is_special,
        });

        if (batchError) throw batchError;
        totalBatchQuantity += orderItem.quantity;
      }

      toast({
        title: "Success",
        description: `Order ${orderNumber} created with ${totalBatchQuantity} items in ${createdOrderItems.length} batch(es)`,
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
                  value={orderNumber}
                  onChange={(e) => setOrderNumber(e.target.value)}
                  placeholder="ORD-001"
                  required
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
                  <Select value={priority} onValueChange={(value: "high" | "normal") => setPriority(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
              {/* Notes moved below items card */}
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
            <CardContent className="space-y-4">
              {items.map((item, index) => (
                <div key={index} className="flex gap-4 items-end">
                  <div className="flex-1">
                    <Label>{t('order.product')} *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" role="combobox" className="w-full justify-between">
                          {item.product_id
                            ? products.find((p) => p.id === item.product_id)
                              ? `${products.find((p) => p.id === item.product_id)?.sku} - ${products.find((p) => p.id === item.product_id)?.name}`
                              : t('order.select_product')
                            : t('order.select_product')}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder={t('order.search_products')} />
                          <CommandList>
                            <CommandEmpty>{t('order.no_product_found')}</CommandEmpty>
                            {/* Suggested products for selected customer */}
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
                                          value={`suggested-${product.sku} ${product.name}`}
                                          onSelect={() => updateItem(index, "product_id", product.id)}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-4 w-4",
                                              item.product_id === product.id ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          <span className="font-mono mr-2">{product.sku}</span>
                                          <span className="text-muted-foreground">{product.name}</span>
                                          <Badge variant="secondary" className="ms-2 text-xs">
                                            {t('order.suggested')}
                                          </Badge>
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
                                  value={`${product.sku} ${product.name}`}
                                  onSelect={() => updateItem(index, "product_id", product.id)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      item.product_id === product.id ? "opacity-100" : "opacity-0",
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
                    <Label>{t('order.quantity')} *</Label>
                    <NumericInput
                      min={1}
                      value={item.quantity}
                      onValueChange={(val) => updateItem(index, "quantity", val ?? 1)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pb-1">
                    <Checkbox
                      id={`needs_boxing_${index}`}
                      checked={item.needs_boxing}
                      onCheckedChange={(checked) => updateItem(index, "needs_boxing", !!checked)}
                    />
                    <Label htmlFor={`needs_boxing_${index}`} className="text-xs cursor-pointer">
                      {t('order.boxing')}
                    </Label>
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
                      const validItems = items.filter(it => it.product_id);
                      const orderItem = row.item_index >= 0 ? items[row.item_index] : undefined;
                      const totalAllocated = packagingRows
                        .filter((r, i) => i !== index && r.item_index === row.item_index && r.item_index >= 0)
                        .reduce((sum, r) => sum + r.quantity, 0);
                      const maxQty = orderItem ? orderItem.quantity - totalAllocated : 1;

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
                                  const remaining = it.quantity - totalAllocatedForItem;
                                  if (remaining <= 0 && row.item_index !== originalIndex) return null;
                                  return (
                                    <SelectItem key={originalIndex} value={String(originalIndex)}>
                                      {product?.sku} - {product?.name} ({it.needs_boxing ? t('order.boxing') : t('order.no_boxing')}) x{it.quantity}
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
