import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NumericInput } from "@/components/ui/numeric-input";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2, Lock, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderItem {
  id: string;
  product_id: string;
  quantity: number;
  needs_boxing: boolean;
  is_special?: boolean;
  initial_state?: string | null;
  size?: string | null;
  product: {
    id: string;
    name_en: string;
    name_ar: string | null;
    sku: string;
    needs_packing: boolean;
    color_en: string | null;
    color_ar: string | null;
  };
}

interface EditableItem {
  id: string | null; // null for new items
  product_id: string;
  quantity: number;
  originalQuantity: number;
  needs_boxing: boolean;
  is_special: boolean;
  initial_state: string | null;
  size: string | null;
  productName: string;
  productSku: string;
  colorEn: string | null;
  isDeleted: boolean;
  isNew: boolean;
}

interface Product {
  id: string;
  name_en: string;
  name_ar: string | null;
  sku: string;
  needs_packing: boolean;
  color_en: string | null;
  color_ar: string | null;
  sizes: string[] | null;
}

interface EditOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderStatus: string;
  orderItems: OrderItem[];
  currentEft: string | null;
  onSaved: () => void;
}

export function EditOrderDialog({
  open,
  onOpenChange,
  orderId,
  orderStatus,
  orderItems,
  currentEft,
  onSaved,
}: EditOrderDialogProps) {
  const { t, language } = useLanguage();
  const { user } = useAuth();

  const [eft, setEft] = useState<Date | undefined>(
    currentEft ? new Date(currentEft) : undefined
  );
  const [items, setItems] = useState<EditableItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [boxWarningOpen, setBoxWarningOpen] = useState(false);
  const [boxWarningMessage, setBoxWarningMessage] = useState("");

  // Removable quantities per item (only for in_progress orders)
  const [removableMap, setRemovableMap] = useState<Record<string, number>>({});
  // Already-moved-to-extra quantities per item (paperwork-only reductions allowed)
  const [deductedMap, setDeductedMap] = useState<Record<string, number>>({});

  // New item form state
  const [addingItem, setAddingItem] = useState(false);
  const [newProductId, setNewProductId] = useState<string | null>(null);
  const [newSize, setNewSize] = useState<string | null>(null);
  const [newQty, setNewQty] = useState<number | undefined>(1);
  const [newNeedsBoxing, setNewNeedsBoxing] = useState(true);

  useEffect(() => {
    if (open) {
      setEft(currentEft ? new Date(currentEft) : undefined);
      setItems(
        orderItems.map((oi) => ({
          id: oi.id,
          product_id: oi.product_id,
          quantity: oi.quantity,
          originalQuantity: oi.quantity,
          needs_boxing: oi.needs_boxing,
          is_special: oi.is_special || false,
          initial_state: oi.initial_state || null,
          size: oi.size || null,
          productName: oi.product?.name_en || "Unknown",
          productSku: oi.product?.sku || "",
          colorEn: oi.product?.color_en || null,
          isDeleted: false,
          isNew: false,
        }))
      );
      setAddingItem(false);
      setNewProductId(null);
      setNewSize(null);
      setNewQty(1);
      setRemovableMap({});
      setDeductedMap({});
      fetchProducts();
      if (orderStatus === "in_progress") {
        fetchRemovableQuantities();
      }
    }
  }, [open, orderItems, currentEft]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name_en, name_ar, sku, needs_packing, color_en, color_ar, sizes")
      .order("name_en");
    if (data) setProducts(data);
  };

  const fetchRemovableQuantities = async () => {
    const map: Record<string, number> = {};
    const dMap: Record<string, number> = {};

    // Get manufacturing batch quantities per order item, only WAITING batches (eta IS NULL)
    const { data: batchData } = await supabase
      .from("order_batches")
      .select("order_item_id, quantity, eta")
      .eq("order_id", orderId)
      .eq("current_state", "in_manufacturing");

    // Get deducted_to_extra per order item
    const { data: itemRows } = await supabase
      .from("order_items")
      .select("id, deducted_to_extra")
      .eq("order_id", orderId);

    // Sum waiting (eta=null) quantities per order_item_id
    for (const oi of orderItems) {
      const waitingQty = (batchData || [])
        .filter(b => b.order_item_id === oi.id && !b.eta)
        .reduce((sum, b) => sum + b.quantity, 0);
      map[oi.id] = waitingQty;
      const row = (itemRows || []).find((r: any) => r.id === oi.id);
      dMap[oi.id] = Math.max(0, (row as any)?.deducted_to_extra || 0);
    }

    setRemovableMap(map);
    setDeductedMap(dMap);
  };

  const getProductSizes = (productId: string): string[] => {
    const product = products.find((p) => p.id === productId);
    return product?.sizes || [];
  };

  const getMinQuantity = (item: EditableItem): number => {
    if (item.isNew || !item.id) return 1;
    if (orderStatus !== "in_progress") return 1;
    const removable = removableMap[item.id] ?? 0;
    const deducted = deductedMap[item.id] ?? 0;
    return Math.max(1, item.originalQuantity - removable - deducted);
  };

  const canDeleteItem = (item: EditableItem): boolean => {
    if (item.isNew) return true;
    if (!item.id) return true;
    if (orderStatus !== "in_progress") return true;
    // Can only delete if ALL quantity is removable from waiting manufacturing batches.
    // Deducted-to-extra units stay in Extra and can't be reclaimed by deletion.
    const removable = removableMap[item.id] ?? 0;
    return removable >= item.originalQuantity;
  };

  const handleDeleteItem = (index: number) => {
    const newItems = [...items];
    if (newItems[index].isNew) {
      newItems.splice(index, 1);
    } else {
      newItems[index] = { ...newItems[index], isDeleted: true };
    }
    setItems(newItems);
  };

  const handleRestoreItem = (index: number) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], isDeleted: false, quantity: newItems[index].originalQuantity };
    setItems(newItems);
  };

  const handleQtyChange = (index: number, qty: number | undefined) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], quantity: qty || 0 };
    setItems(newItems);
  };

  const handleAddNewItem = () => {
    if (!newProductId || !newQty || newQty <= 0) return;
    const product = products.find((p) => p.id === newProductId);
    if (!product) return;

    const sizes = getProductSizes(newProductId);
    if (sizes.length > 0 && !newSize) {
      toast.error(t("orders.select_size"));
      return;
    }

    const duplicate = items.find(
      (i) => !i.isDeleted && i.product_id === newProductId && i.size === (newSize || null)
    );
    if (duplicate) {
      toast.error(t("orders.duplicate_item"));
      return;
    }

    setItems([
      ...items,
      {
        id: null,
        product_id: newProductId,
        quantity: newQty,
        originalQuantity: 0,
        needs_boxing: newNeedsBoxing,
        is_special: false,
        initial_state: null,
        size: newSize || null,
        productName: product.name_en,
        productSku: product.sku,
        colorEn: product.color_en,
        isDeleted: false,
        isNew: true,
      },
    ]);

    setAddingItem(false);
    setNewProductId(null);
    setNewSize(null);
    setNewQty(1);
    setNewNeedsBoxing(true);
  };

  // Re-validate removable quantities server-side before save
  const revalidateConstraints = async (): Promise<boolean> => {
    if (orderStatus !== "in_progress") return true;

    const { data: batchData } = await supabase
      .from("order_batches")
      .select("order_item_id, quantity, eta")
      .eq("order_id", orderId)
      .eq("current_state", "in_manufacturing");

    for (const item of items) {
      if (item.isNew || !item.id) continue;

      // Only waiting batches (eta=null) are removable
      const removable = (batchData || [])
        .filter(b => b.order_item_id === item.id && !b.eta)
        .reduce((sum, b) => sum + b.quantity, 0);

      if (item.isDeleted) {
        if (removable < item.originalQuantity) {
          toast.error(`${item.productName}: ${language === "ar" ? "لا يمكن حذف هذا المنتج - تم بدء العمل عليه" : "Cannot delete - work has started on this item"}`);
          return false;
        }
      } else if (item.quantity < item.originalQuantity) {
        const decreaseAmount = item.originalQuantity - item.quantity;
        if (decreaseAmount > removable) {
          toast.error(`${item.productName}: ${language === "ar" ? "لا يمكن تقليل الكمية بهذا المقدار - تم بدء العمل" : "Cannot decrease by this amount - work has progressed"}`);
          return false;
        }
      }
    }

    return true;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Re-validate constraints before proceeding
      const valid = await revalidateConstraints();
      if (!valid) {
        setSaving(false);
        return;
      }

      // 1. Update EFT
      const eftChanged =
        (eft ? eft.toISOString() : null) !== currentEft;
      if (eftChanged) {
        const { error } = await supabase
          .from("orders")
          .update({ estimated_fulfillment_time: eft ? eft.toISOString() : null })
          .eq("id", orderId);
        if (error) throw error;
      }

      const isInProgress = orderStatus === "in_progress";

      // 2. Process deletions
      for (const item of items.filter((i) => i.isDeleted && !i.isNew && i.id)) {
        // Box occupancy check
        const { data: boxedBatches } = await supabase
          .from("order_batches")
          .select("id")
          .eq("order_item_id", item.id!)
          .not("box_id", "is", null)
          .limit(1);

        if (boxedBatches && boxedBatches.length > 0) {
          setBoxWarningMessage(
            `${item.productName}${item.size ? ` (${item.size})` : ""}: ${t("orders.boxes_must_be_emptied")}`
          );
          setBoxWarningOpen(true);
          setSaving(false);
          return;
        }

        // Delete all batches for this item
        await supabase.from("order_batches").delete().eq("order_item_id", item.id!);

        // Release reserved extra batches
        await supabase
          .from("extra_batches")
          .update({ inventory_state: "AVAILABLE", order_id: null, order_item_id: null })
          .eq("order_id", orderId)
          .eq("order_item_id", item.id!)
          .eq("inventory_state", "RESERVED");

        // Delete the order item
        await supabase.from("order_items").delete().eq("id", item.id!);
      }

      // 3. Process quantity changes on existing items
      for (const item of items.filter((i) => !i.isDeleted && !i.isNew && i.id)) {
        const delta = item.quantity - item.originalQuantity;
        if (delta === 0) continue;

        if (delta > 0) {
          // Increase: update order_items qty, create batches if in_progress
          await supabase
            .from("order_items")
            .update({ quantity: item.quantity })
            .eq("id", item.id!);

          if (isInProgress) {
            // Try to merge into existing waiting batch (eta IS NULL)
            const { data: existingBatch } = await supabase
              .from("order_batches")
              .select("id, quantity")
              .eq("order_item_id", item.id!)
              .eq("current_state", "in_manufacturing")
              .is("eta", null)
              .limit(1)
              .maybeSingle();

            if (existingBatch) {
              await supabase
                .from("order_batches")
                .update({ quantity: existingBatch.quantity + delta })
                .eq("id", existingBatch.id);
            } else {
              const { data: codeData } = await supabase.rpc("generate_batch_code");
              const { error } = await supabase.from("order_batches").insert({
                order_id: orderId,
                product_id: item.product_id,
                order_item_id: item.id!,
                current_state: "in_manufacturing",
                quantity: delta,
                created_by: user?.id,
                qr_code_data: codeData || `B-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
                is_special: item.is_special,
              });
              if (error) throw error;
            }
          }
        } else {
          // Decrease: check box occupancy first
          const decreaseAmount = Math.abs(delta);

          const { data: boxedBatches } = await supabase
            .from("order_batches")
            .select("id")
            .eq("order_item_id", item.id!)
            .not("box_id", "is", null)
            .limit(1);

          if (boxedBatches && boxedBatches.length > 0) {
            setBoxWarningMessage(
              `${item.productName}${item.size ? ` (${item.size})` : ""}: ${t("orders.boxes_must_be_emptied")}`
            );
            setBoxWarningOpen(true);
            setSaving(false);
            return;
          }

          // Delete batches only from in_manufacturing state
          if (isInProgress) {
            await deleteManufacturingBatches(item.id!, decreaseAmount);
          }

          await supabase
            .from("order_items")
            .update({ quantity: item.quantity })
            .eq("id", item.id!);
        }
      }

      // 4. Process new items
      for (const item of items.filter((i) => i.isNew && !i.isDeleted)) {
        const { data: newItem, error: itemError } = await supabase
          .from("order_items")
          .insert({
            order_id: orderId,
            product_id: item.product_id,
            quantity: item.quantity,
            needs_boxing: item.needs_boxing,
            size: item.size,
          })
          .select("id")
          .single();

        if (itemError) throw itemError;

        if (isInProgress && newItem) {
          const { data: codeData } = await supabase.rpc("generate_batch_code");
          const { error } = await supabase.from("order_batches").insert({
            order_id: orderId,
            product_id: item.product_id,
            order_item_id: newItem.id,
            current_state: "in_manufacturing",
            quantity: item.quantity,
            created_by: user?.id,
            qr_code_data: codeData || `B-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
          });
          if (error) throw error;
        }
      }

      // Log activity with per-item details
      const logEftChanged = (eft ? eft.toISOString() : null) !== currentEft;
      const changes: Array<Record<string, any>> = [];

      for (const item of items) {
        if (item.isNew && !item.isDeleted) {
          changes.push({ type: "added", product: item.productName, sku: item.productSku, size: item.size, quantity: item.quantity });
        } else if (item.isDeleted && !item.isNew) {
          changes.push({ type: "deleted", product: item.productName, sku: item.productSku, size: item.size, quantity: item.originalQuantity });
        } else if (!item.isNew && !item.isDeleted && item.id && item.quantity !== item.originalQuantity) {
          changes.push({ type: "qty_changed", product: item.productName, sku: item.productSku, size: item.size, from: item.originalQuantity, to: item.quantity, delta: item.quantity - item.originalQuantity });
        }
      }

      if (user && (logEftChanged || changes.length > 0)) {
        await supabase.from("order_activity_logs").insert({
          order_id: orderId,
          action: "edited",
          performed_by: user.id,
          details: {
            eft_changed: logEftChanged,
            changes,
          },
        });
        logAudit({
          action: "order.edited",
          entity_type: "order",
          entity_id: orderId,
          module: "orders",
          order_id: orderId,
          metadata: {
            eft_changed: logEftChanged,
            changes,
          },
        });
      }

      toast.success(t("toast.success"));
      onSaved();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving order edits:", error);
      toast.error(t("toast.action_failed"));
    } finally {
      setSaving(false);
    }
  };

  // Only delete batches in in_manufacturing state that are WAITING (eta IS NULL)
  const deleteManufacturingBatches = async (orderItemId: string, amount: number) => {
    let remaining = amount;

    const { data: batches } = await supabase
      .from("order_batches")
      .select("id, quantity")
      .eq("order_item_id", orderItemId)
      .eq("current_state", "in_manufacturing")
      .is("eta", null)
      .order("quantity", { ascending: true });

    if (!batches) return;

    for (const batch of batches) {
      if (remaining <= 0) break;

      if (batch.quantity <= remaining) {
        await supabase.from("order_batches").delete().eq("id", batch.id);
        remaining -= batch.quantity;
      } else {
        await supabase
          .from("order_batches")
          .update({ quantity: batch.quantity - remaining })
          .eq("id", batch.id);
        remaining = 0;
      }
    }
  };

  const activeItems = items.filter((i) => !i.isDeleted);
  const deletedItems = items.filter((i) => i.isDeleted);
  const hasChanges =
    items.some((i) => i.isNew || i.isDeleted || i.quantity !== i.originalQuantity) ||
    (eft ? eft.toISOString() : null) !== currentEft;

  const selectedProduct = newProductId ? products.find((p) => p.id === newProductId) : null;
  const selectedProductSizes = newProductId ? getProductSizes(newProductId) : [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("orders.edit_order")}</DialogTitle>
            <DialogDescription>{t("orders.edit_order_desc")}</DialogDescription>
          </DialogHeader>

          {/* EFT Section */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("orders.estimated_time")}</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-start font-normal",
                    !eft && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="me-2 h-4 w-4" />
                  {eft ? format(eft, "PPP") : t("orders.not_set")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={eft} onSelect={setEft} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {/* Order Items Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t("orders.order_items")}</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingItem(true)}
                disabled={addingItem}
              >
                <Plus className="h-4 w-4 me-1" />
                {t("orders.add_item")}
              </Button>
            </div>

            {/* Existing items */}
            <div className="space-y-2">
              {activeItems.map((item) => {
                const idx = items.indexOf(item);
                const minQty = getMinQuantity(item);
                const deletable = canDeleteItem(item);
                return (
                  <div
                    key={item.id || `new-${idx}`}
                    className="flex items-center gap-3 p-3 border rounded-lg"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-mono">
                          {item.productSku}
                        </span>
                        {item.size && (
                          <Badge variant="outline" className="text-xs">
                            {item.size}
                          </Badge>
                        )}
                        {item.colorEn && (
                          <span className="text-xs text-muted-foreground">{item.colorEn}</span>
                        )}
                        {item.isNew && (
                          <Badge variant="secondary" className="text-xs">
                            {t("common.new")}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <NumericInput
                      value={item.quantity}
                      onValueChange={(val) => handleQtyChange(idx, val)}
                      min={minQty}
                      className="w-20"
                    />
                    {deletable ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteItem(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-muted-foreground cursor-not-allowed"
                              disabled
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">
                              {language === "ar"
                                ? "لا يمكن حذف هذا المنتج - بعض الوحدات تجاوزت مرحلة التصنيع أو تم بدء العمل عليها"
                                : "Cannot delete - some units have progressed beyond manufacturing or work has started"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Deleted items (can restore) */}
            {deletedItems.length > 0 && (
              <div className="space-y-2 opacity-50">
                <p className="text-xs text-muted-foreground">{t("orders.deleted_items")}</p>
                {deletedItems.map((item) => {
                  const idx = items.indexOf(item);
                  return (
                    <div
                      key={item.id || `del-${idx}`}
                      className="flex items-center gap-3 p-3 border rounded-lg border-dashed line-through"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">
                            {item.productSku}
                          </span>
                          {item.size && (
                            <Badge variant="outline" className="text-xs">
                              {item.size}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => handleRestoreItem(idx)}>
                        {t("orders.restore")}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add new item form */}
            {addingItem && (
              <div className="p-3 border rounded-lg border-dashed space-y-3 bg-muted/30">
                <SearchableSelect
                  options={products.map((p) => ({
                    value: p.id,
                    label: `${p.name_en} (${p.sku})`,
                    description: p.color_en || undefined,
                  }))}
                  value={newProductId}
                  onValueChange={(val) => {
                    setNewProductId(val);
                    setNewSize(null);
                  }}
                  placeholder={t("orders.select_product")}
                />
                {selectedProductSizes.length > 0 && (
                  <SearchableSelect
                    options={selectedProductSizes.map((s) => ({ value: s, label: s }))}
                    value={newSize}
                    onValueChange={setNewSize}
                    placeholder={t("orders.select_size")}
                  />
                )}
                <div className="flex items-center gap-2">
                  <NumericInput
                    value={newQty}
                    onValueChange={setNewQty}
                    min={1}
                    placeholder="Qty"
                    className="w-24"
                  />
                  <Button size="sm" onClick={handleAddNewItem}>
                    {t("common.add")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setAddingItem(false);
                      setNewProductId(null);
                      setNewSize(null);
                    }}
                  >
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saving || !hasChanges}>
              {saving ? t("common.loading") : t("orders.save_changes")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Box warning dialog */}
      <AlertDialog open={boxWarningOpen} onOpenChange={setBoxWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("orders.boxes_must_be_emptied_title")}</AlertDialogTitle>
            <AlertDialogDescription>{boxWarningMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setBoxWarningOpen(false)}>
              {t("common.ok")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
