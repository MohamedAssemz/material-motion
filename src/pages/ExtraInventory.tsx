import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Package, Loader2, Box, Search, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { TablePagination } from "@/components/TablePagination";
import { ExtraBoxSelectionDialog } from "@/components/ExtraBoxSelectionDialog";

interface Product {
  id: string;
  sku: string;
  name_en: string;
}

interface ExtraBatch {
  id: string;
  product_id: string;
  quantity: number;
  current_state: string;
  inventory_state: string;
  created_at: string;
  box_id: string | null;
  qr_code_data: string | null;
  product: Product;
  box?: {
    id: string;
    box_code: string;
    storehouse?: number;
  } | null;
  storehouse?: number;
}

const EXTRA_STATE_COLORS: Record<string, string> = {
  extra_manufacturing: "bg-blue-500 text-white",
  extra_finishing: "bg-purple-500 text-white",
  extra_packaging: "bg-orange-500 text-white",
  extra_boxing: "bg-cyan-500 text-white",
};

export default function ExtraInventory() {
  const { user, hasRole } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [batches, setBatches] = useState<ExtraBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [boxDialogOpen, setBoxDialogOpen] = useState(false);
  const [createBoxDialogOpen, setCreateBoxDialogOpen] = useState(false);
  const [selectedBatchForBox, setSelectedBatchForBox] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    product_id: "",
    quantity: 1,
    current_state: "extra_manufacturing",
    box_id: "",
  });
  const [selectedBoxCode, setSelectedBoxCode] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [batchToDelete, setBatchToDelete] = useState<ExtraBatch | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const [searchQuery, setSearchQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [storehouseFilter, setStorehouseFilter] = useState("all");

  const canManage = hasRole("admin");

  const EXTRA_STATE_LABELS: Record<string, string> = useMemo(
    () => ({
      extra_manufacturing: t("extra.state.extra_manufacturing"),
      extra_finishing: t("extra.state.extra_finishing"),
      extra_packaging: t("extra.state.extra_packaging"),
      extra_boxing: t("extra.state.extra_boxing"),
    }),
    [t],
  );

  const filteredBatches = useMemo(() => {
    let result = batches;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (b) => b.product.name_en.toLowerCase().includes(q) || b.product.sku.toLowerCase().includes(q),
      );
    }
    if (stateFilter !== "all") result = result.filter((b) => b.current_state === stateFilter);
    if (statusFilter !== "all") result = result.filter((b) => b.inventory_state === statusFilter);
    if (storehouseFilter !== "all") result = result.filter((b) => String(b.storehouse) === storehouseFilter);
    return result;
  }, [batches, searchQuery, stateFilter, statusFilter, storehouseFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, stateFilter, statusFilter, storehouseFilter]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("extra-batches")
      .on("postgres_changes", { event: "*", schema: "public", table: "extra_batches" }, () => {
        fetchData();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    try {
      const [productsRes, batchesRes] = await Promise.all([
        supabase.from("products").select("id, sku, name_en").order("sku"),
        supabase
          .from("extra_batches")
          .select(
            `id, product_id, quantity, current_state, inventory_state, created_at, box_id, qr_code_data, product:products(id, sku, name_en)`,
          )
          .order("created_at", { ascending: false }),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (batchesRes.error) throw batchesRes.error;

      const boxIds = batchesRes.data?.filter((b) => b.box_id).map((b) => b.box_id) || [];
      let boxMap = new Map();
      if (boxIds.length > 0) {
        const { data: boxesData } = await supabase.from("extra_boxes").select("id, box_code").in("id", boxIds);
        boxesData?.forEach((box) => boxMap.set(box.id, box));
      }

      const batchesWithBoxes =
        batchesRes.data?.map((batch) => ({
          ...batch,
          product: batch.product as unknown as Product,
          box: batch.box_id ? boxMap.get(batch.box_id) : null,
        })) || [];

      setProducts(productsRes.data || []);
      setBatches(batchesWithBoxes);
    } catch (error: any) {
      toast({ title: t("toast.error"), description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateExtraBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.product_id || formData.quantity < 1) {
      toast({
        title: t("extra.validation_error"),
        description: t("extra.select_product_valid"),
        variant: "destructive",
      });
      return;
    }
    if (!formData.box_id) {
      toast({ title: t("extra.validation_error"), description: t("extra.select_ebox_valid"), variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const { data: boxBatches } = await supabase
        .from("extra_batches")
        .select("current_state")
        .eq("box_id", formData.box_id)
        .limit(1);
      if (boxBatches && boxBatches.length > 0 && boxBatches[0].current_state !== formData.current_state) {
        toast({
          title: t("extra.state_mismatch"),
          description: `${EXTRA_STATE_LABELS[boxBatches[0].current_state]}`,
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      const { data: existingBatch } = await supabase
        .from("extra_batches")
        .select("id, quantity")
        .eq("product_id", formData.product_id)
        .eq("box_id", formData.box_id)
        .eq("current_state", formData.current_state)
        .eq("inventory_state", "AVAILABLE")
        .maybeSingle();

      if (existingBatch) {
        const { error } = await supabase
          .from("extra_batches")
          .update({ quantity: existingBatch.quantity + formData.quantity, updated_at: new Date().toISOString() })
          .eq("id", existingBatch.id);
        if (error) throw error;
        toast({
          title: t("toast.success"),
          description: `${formData.quantity} → ${existingBatch.quantity + formData.quantity}`,
        });
      } else {
        const { data: qrCode } = await supabase.rpc("generate_extra_batch_code");
        const { error } = await supabase.from("extra_batches").insert({
          product_id: formData.product_id,
          quantity: formData.quantity,
          current_state: formData.current_state,
          inventory_state: "AVAILABLE",
          qr_code_data: qrCode || `EB-${Date.now()}`,
          box_id: formData.box_id,
          created_by: user?.id,
        });
        if (error) throw error;
        toast({ title: t("toast.success"), description: t("toast.created_successfully") });
      }

      setDialogOpen(false);
      setFormData({ product_id: "", quantity: 1, current_state: "extra_manufacturing", box_id: "" });
      setSelectedBoxCode("");
      fetchData();
    } catch (error: any) {
      toast({ title: t("toast.error"), description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignBox = async (boxId: string, _boxCode?: string) => {
    if (!selectedBatchForBox) return;
    const batch = batches.find((b) => b.id === selectedBatchForBox);
    if (!batch) return;

    try {
      const { data: boxBatches } = await supabase
        .from("extra_batches")
        .select("current_state")
        .eq("box_id", boxId)
        .neq("id", batch.id)
        .limit(1);
      if (boxBatches && boxBatches.length > 0 && boxBatches[0].current_state !== batch.current_state) {
        toast({
          title: t("extra.state_mismatch"),
          description: `${EXTRA_STATE_LABELS[boxBatches[0].current_state]}`,
          variant: "destructive",
        });
        return;
      }

      const { data: existingBatch } = await supabase
        .from("extra_batches")
        .select("id, quantity")
        .eq("product_id", batch.product_id)
        .eq("box_id", boxId)
        .eq("current_state", batch.current_state)
        .eq("inventory_state", batch.inventory_state)
        .neq("id", batch.id)
        .maybeSingle();

      if (existingBatch) {
        await supabase
          .from("extra_batches")
          .update({ quantity: existingBatch.quantity + batch.quantity, updated_at: new Date().toISOString() })
          .eq("id", existingBatch.id);
        await supabase.from("extra_batches").delete().eq("id", selectedBatchForBox);
        toast({ title: t("toast.success"), description: `${batch.quantity} units merged` });
      } else {
        const { error: batchError } = await supabase
          .from("extra_batches")
          .update({ box_id: boxId })
          .eq("id", selectedBatchForBox);
        if (batchError) throw batchError;
        toast({ title: t("toast.success"), description: t("toast.updated_successfully") });
      }

      setSelectedBatchForBox(null);
      setBoxDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: t("toast.error"), description: error.message, variant: "destructive" });
    }
  };

  const handleDeleteBatch = async (batch: ExtraBatch) => {
    if (!canManage) return;
    setDeletingBatchId(batch.id);
    try {
      if (batch.inventory_state === "RESERVED") {
        const { data: batchData } = await supabase
          .from("extra_batches")
          .select("order_item_id, quantity")
          .eq("id", batch.id)
          .single();
        if (batchData?.order_item_id) {
          const { data: orderItem } = await supabase
            .from("order_items")
            .select("deducted_to_extra")
            .eq("id", batchData.order_item_id)
            .single();
          if (orderItem) {
            await supabase
              .from("order_items")
              .update({ deducted_to_extra: Math.max(0, orderItem.deducted_to_extra - batchData.quantity) })
              .eq("id", batchData.order_item_id);
          }
          await supabase
            .from("extra_batches")
            .update({ inventory_state: "AVAILABLE", order_id: null, order_item_id: null })
            .eq("id", batch.id);
        }
      }

      const { error } = await supabase.from("extra_batches").delete().eq("id", batch.id);
      if (error) throw error;

      toast({ title: t("toast.deleted_successfully") });
      fetchData();
    } catch (error: any) {
      toast({ title: t("toast.error"), description: error.message, variant: "destructive" });
    } finally {
      setDeletingBatchId(null);
    }
  };

  const getInventoryStateColor = (state: string) => {
    switch (state) {
      case "AVAILABLE":
        return "text-green-600 border-green-600";
      case "RESERVED":
        return "text-amber-600 border-amber-600";
      default:
        return "";
    }
  };

  const availableBatches = batches.filter((b) => b.inventory_state === "AVAILABLE");
  const reservedBatches = batches.filter((b) => b.inventory_state === "RESERVED");
  const totalAvailable = availableBatches.reduce((sum, b) => sum + b.quantity, 0);

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
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Package className="h-6 w-6 text-amber-500" />
            <div>
              <h1 className="text-xl font-bold">{t("extra.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("extra.batch_tracking")}</p>
            </div>
          </div>

          {canManage && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("extra.add_batch")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("extra.create_batch")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreateExtraBatch} className="space-y-4">
                  <div>
                    <Label>{t("common.product")} *</Label>
                    <Select
                      value={formData.product_id}
                      onValueChange={(value) => setFormData({ ...formData, product_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={t("extra.select_product")} />
                      </SelectTrigger>
                      <SelectContent>
                        {products.map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.sku} - {product.name_en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{t("common.quantity")} *</Label>
                    <NumericInput
                      min={1}
                      value={formData.quantity}
                      onValueChange={(val) => setFormData({ ...formData, quantity: val ?? 1 })}
                      required
                    />
                  </div>
                  <div>
                    <Label>{t("extra.current_state")}</Label>
                    <Select
                      value={formData.current_state}
                      onValueChange={(value) => setFormData({ ...formData, current_state: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="extra_manufacturing">{t("extra.state.extra_manufacturing")}</SelectItem>
                        <SelectItem value="extra_finishing">{t("extra.state.extra_finishing")}</SelectItem>
                        <SelectItem value="extra_packaging">{t("extra.state.extra_packaging")}</SelectItem>
                        <SelectItem value="extra_boxing">{t("extra.state.extra_boxing")}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground mt-1">{t("extra.state_desc")}</p>
                  </div>

                  <div>
                    <Label>{t("warehouse.extra_boxes")} *</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="flex-1 justify-start"
                        onClick={() => setCreateBoxDialogOpen(true)}
                      >
                        {formData.box_id && selectedBoxCode ? (
                          <span className="flex items-center gap-2">
                            <Box className="h-4 w-4 text-primary" />
                            <span className="font-mono">{selectedBoxCode}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground flex items-center gap-2">
                            <Box className="h-4 w-4" />
                            {t("extra.select_ebox")}
                          </span>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{t("extra.only_matching_state")}</p>
                  </div>

                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1" disabled={submitting || !formData.box_id}>
                      {submitting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          {t("extra.creating")}
                        </>
                      ) : (
                        t("extra.create_batch_btn")
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setDialogOpen(false);
                        setFormData({ product_id: "", quantity: 1, current_state: "extra_manufacturing", box_id: "" });
                        setSelectedBoxCode("");
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <ExtraBoxSelectionDialog
        open={createBoxDialogOpen}
        onOpenChange={setCreateBoxDialogOpen}
        onConfirm={(boxId, boxCode) => {
          setFormData({ ...formData, box_id: boxId });
          setSelectedBoxCode(boxCode || "");
          setCreateBoxDialogOpen(false);
        }}
        title={t("extra.select_box_title")}
        filterByState={formData.current_state}
      />

      <div className="container mx-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("extra.available_units")}</p>
                  <p className="text-2xl font-bold text-green-600">{totalAvailable}</p>
                </div>
                <Package className="h-8 w-8 text-green-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("extra.available_batches")}</p>
                  <p className="text-2xl font-bold">{availableBatches.length}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t("extra.reserved_count")}</p>
                  <p className="text-2xl font-bold text-amber-600">{reservedBatches.length}</p>
                </div>
                <Package className="h-8 w-8 text-amber-600 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("extra.search_product_sku")}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="w-full sm:w-[180px]">
                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("extra.all_states")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("extra.all_states")}</SelectItem>
                    <SelectItem value="extra_manufacturing">{t("extra.state.extra_manufacturing")}</SelectItem>
                    <SelectItem value="extra_finishing">{t("extra.state.extra_finishing")}</SelectItem>
                    <SelectItem value="extra_packaging">{t("extra.state.extra_packaging")}</SelectItem>
                    <SelectItem value="extra_boxing">{t("extra.state.extra_boxing")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-full sm:w-[150px]">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("extra.all_statuses")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("extra.all_statuses")}</SelectItem>
                    <SelectItem value="AVAILABLE">{t("extra.available")}</SelectItem>
                    <SelectItem value="RESERVED">{t("extra.reserved")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Batches Table */}
        <Card>
          <CardHeader>
            <CardTitle>
              {t("extra.extra_batches")}
              {filteredBatches.length !== batches.length && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({filteredBatches.length} / {batches.length})
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredBatches.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Package className="mx-auto h-12 w-12 mb-4 opacity-50" />
                {batches.length === 0 ? (
                  <>
                    <p>{t("extra.no_batches")}</p>
                    <p className="text-sm">{t("extra.create_when_overproduction")}</p>
                  </>
                ) : (
                  <p>{t("extra.no_filter_match")}</p>
                )}
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("common.product")}</TableHead>
                      <TableHead>{t("common.quantity")}</TableHead>
                      <TableHead>{t("extra.current_state")}</TableHead>
                      <TableHead>{t("common.status")}</TableHead>
                      <TableHead>{t("table.box")}</TableHead>
                      <TableHead>{t("table.created")}</TableHead>
                      {canManage && <TableHead className="w-[60px]"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredBatches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{batch.product.name_en}</p>
                            <p className="text-xs text-muted-foreground">{batch.product.sku}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-bold">{batch.quantity}</TableCell>
                        <TableCell>
                          <Badge className={EXTRA_STATE_COLORS[batch.current_state] || "bg-gray-500"}>
                            {EXTRA_STATE_LABELS[batch.current_state] || batch.current_state}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getInventoryStateColor(batch.inventory_state)}>
                            {batch.inventory_state === "AVAILABLE"
                              ? t("extra.available")
                              : batch.inventory_state === "RESERVED"
                                ? t("extra.reserved")
                                : batch.inventory_state}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {batch.box ? (
                            <div className="flex items-center gap-1">
                              <Box className="h-4 w-4 text-muted-foreground" />
                              <span className="font-mono text-sm">{batch.box.box_code}</span>
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedBatchForBox(batch.id);
                                setBoxDialogOpen(true);
                              }}
                              disabled={batch.inventory_state === "RESERVED"}
                            >
                              <Box className="h-4 w-4 mr-1" />
                              {t("extra.assign")}
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>{format(new Date(batch.created_at), "PP")}</TableCell>
                        {canManage && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setBatchToDelete(batch)}
                              disabled={deletingBatchId === batch.id}
                            >
                              {deletingBatchId === batch.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <TablePagination
                  currentPage={currentPage}
                  totalItems={filteredBatches.length}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ExtraBoxSelectionDialog
        open={boxDialogOpen}
        onOpenChange={setBoxDialogOpen}
        onConfirm={handleAssignBox}
        title={t("extra.assign_box")}
      />

      <AlertDialog
        open={!!batchToDelete}
        onOpenChange={(open) => {
          if (!open) setBatchToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("extra.delete_batch")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("extra.delete_confirm")} ({batchToDelete?.product?.name_en} × {batchToDelete?.quantity})?
              {batchToDelete?.inventory_state === "RESERVED" && ` ${t("extra.reserved_release")}`}{" "}
              {t("extra.cannot_undo")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (batchToDelete) {
                  handleDeleteBatch(batchToDelete);
                  setBatchToDelete(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
