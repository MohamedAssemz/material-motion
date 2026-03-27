import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarIcon, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// State priority for batch deletion (earliest phase first)
const STATE_DELETION_PRIORITY = [
  "in_manufacturing",
  "ready_for_finishing",
  "in_finishing",
  "ready_for_packaging",
  "in_packaging",
  "ready_for_boxing",
  "in_boxing",
  "ready_for_shipment",
  "shipped",
];

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
      fetchProducts();
    }
  }, [open, orderItems, currentEft]);

  const fetchProducts = async () => {
    const { data } = await supabase
      .from("products")
      .select("id, name_en, name_ar, sku, needs_packing, color_en, color_ar, sizes")
      .order("name_en");
    if (data) setProducts(data);
  };

  const getProductSizes = (productId: string): string[] => {
    const product = products.find((p) => p.id === productId);
    return product?.sizes || [];
  };

  const handleDeleteItem = (index: number) => {
    const newItems = [...items];
    if (newItems[index].isNew) {
      // Just remove new items entirely
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

    // Check for duplicate
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

  const handleSave = async () => {
    setSaving(true);
    try {
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
            // Create new batches for the delta
            const batchInserts = [];
            for (let i = 0; i < delta; i++) {
              const { data: codeData } = await supabase.rpc("generate_batch_code");
              batchInserts.push({
                order_id: orderId,
                product_id: item.product_id,
                order_item_id: item.id!,
                current_state: "in_manufacturing",
                quantity: 1,
                created_by: user?.id,
                qr_code_data: codeData || `B-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
                is_special: item.is_special,
              });
            }
            if (batchInserts.length > 0) {
              const { error } = await supabase.from("order_batches").insert(batchInserts);
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

          // Delete batches in state priority order
          if (isInProgress) {
            await deleteBatchesByPriority(item.id!, decreaseAmount);
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
          const batchInserts = [];
          for (let i = 0; i < item.quantity; i++) {
            const { data: codeData } = await supabase.rpc("generate_batch_code");
            batchInserts.push({
              order_id: orderId,
              product_id: item.product_id,
              order_item_id: newItem.id,
              current_state: "in_manufacturing",
              quantity: 1,
              created_by: user?.id,
              qr_code_data: codeData || `B-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            });
          }
          if (batchInserts.length > 0) {
            const { error } = await supabase.from("order_batches").insert(batchInserts);
            if (error) throw error;
          }
        }
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

  const deleteBatchesByPriority = async (orderItemId: string, amount: number) => {
    let remaining = amount;

    for (const state of STATE_DELETION_PRIORITY) {
      if (remaining <= 0) break;

      const { data: batches } = await supabase
        .from("order_batches")
        .select("id, quantity")
        .eq("order_item_id", orderItemId)
        .eq("current_state", state)
        .order("quantity", { ascending: true });

      if (!batches) continue;

      for (const batch of batches) {
        if (remaining <= 0) break;

        if (batch.quantity <= remaining) {
          // Delete entire batch
          await supabase.from("order_batches").delete().eq("id", batch.id);
          remaining -= batch.quantity;
        } else {
          // Partially reduce batch
          await supabase
            .from("order_batches")
            .update({ quantity: batch.quantity - remaining })
            .eq("id", batch.id);
          remaining = 0;
        }
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
                      min={1}
                      className="w-20"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteItem(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
