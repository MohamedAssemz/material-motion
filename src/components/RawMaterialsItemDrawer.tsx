import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { Send, ArrowLeft, Search, ChevronRight, FileText, Download } from "lucide-react";
import { RawMaterialImageUpload } from "@/components/RawMaterialImageUpload";
import { cn } from "@/lib/utils";

interface RawMaterialVersion {
  id: string;
  version_number: number;
  content: string;
  images: string[];
  created_by: string | null;
  created_at: string;
  order_item_id: string | null;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface OrderItemInfo {
  id: string;
  product_name: string;
  sku: string;
  size: string | null;
}

interface RawMaterialsItemDrawerProps {
  orderId: string;
  orderNumber: string;
  orderItems: OrderItemInfo[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RawMaterialsItemDrawer({
  orderId,
  orderNumber,
  orderItems,
  open,
  onOpenChange,
}: RawMaterialsItemDrawerProps) {
  const { user, hasRole } = useAuth();
  const [versions, setVersions] = useState<RawMaterialVersion[]>([]);
  const [newContent, setNewContent] = useState("");
  const [newImages, setNewImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const canEdit = hasRole("admin");

  useEffect(() => {
    if (open) {
      fetchVersions();
      setSelectedItemId(null);
      setSearchQuery("");
      setNewContent("");
      setNewImages([]);
    }
  }, [open, orderId]);

  const fetchVersions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("raw_material_versions")
        .select("*")
        .eq("order_id", orderId)
        .order("version_number", { ascending: false });

      if (error) throw error;

      const profileIds = [...new Set(data?.map((v) => v.created_by).filter(Boolean))];
      let profileMap = new Map();

      if (profileIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", profileIds);
        profiles?.forEach((p) => profileMap.set(p.id, p));
      }

      const mappedVersions = data?.map((v) => ({
        ...v,
        images: Array.isArray(v.images) ? (v.images as string[]) : [],
        order_item_id: (v as any).order_item_id || null,
        profile: v.created_by ? profileMap.get(v.created_by) : undefined,
      })) || [];

      setVersions(mappedVersions);
    } catch (error) {
      console.error("Error fetching raw material versions:", error);
      toast.error("Failed to load raw materials");
    } finally {
      setLoading(false);
    }
  };

  // Group versions by item
  const versionsByItem = useMemo(() => {
    const map = new Map<string, RawMaterialVersion[]>();
    versions.forEach((v) => {
      if (v.order_item_id) {
        const existing = map.get(v.order_item_id) || [];
        existing.push(v);
        map.set(v.order_item_id, existing);
      }
    });
    return map;
  }, [versions]);

  const legacyVersions = useMemo(() => versions.filter((v) => !v.order_item_id), [versions]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return orderItems;
    const q = searchQuery.toLowerCase();
    return orderItems.filter(
      (item) =>
        item.product_name.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q) ||
        (item.size && item.size.toLowerCase().includes(q))
    );
  }, [orderItems, searchQuery]);

  const selectedItemVersions = useMemo(() => {
    if (!selectedItemId) return [];
    return versions.filter((v) => v.order_item_id === selectedItemId);
  }, [versions, selectedItemId]);

  const handleSave = async () => {
    if ((!newContent.trim() && newImages.length === 0) || !user || !selectedItemId) return;

    setSubmitting(true);
    try {
      const itemVersions = versions.filter((v) => v.order_item_id === selectedItemId);
      const nextVersion = itemVersions.length > 0 ? itemVersions[0].version_number + 1 : 1;

      const { error } = await supabase.from("raw_material_versions").insert({
        order_id: orderId,
        order_item_id: selectedItemId,
        version_number: nextVersion,
        content: newContent.trim(),
        images: newImages,
        created_by: user.id,
      } as any);

      if (error) throw error;

      setNewContent("");
      setNewImages([]);
      await fetchVersions();
      toast.success("Raw materials updated");
    } catch (error) {
      console.error("Error saving raw materials:", error);
      toast.error("Failed to save raw materials");
    } finally {
      setSubmitting(false);
    }
  };

  const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
    if (name) return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    if (email) return email[0].toUpperCase();
    return "?";
  };

  const formatTimestamp = (dateString: string) => {
    return format(new Date(dateString), "MMM d, yyyy 'at' h:mm a");
  };

  const handleExportExcel = async () => {
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet("Raw Materials");

      sheet.columns = [
        { header: "Product Name", key: "product", width: 30 },
        { header: "SKU", key: "sku", width: 18 },
        { header: "Size", key: "size", width: 10 },
        { header: "Version #", key: "version", width: 10 },
        { header: "Content", key: "content", width: 50 },
        { header: "Images (URLs)", key: "images", width: 40 },
        { header: "Updated By", key: "updatedBy", width: 20 },
        { header: "Date", key: "date", width: 22 },
      ];

      const headerRow = sheet.getRow(1);
      headerRow.font = { bold: true };
      headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

      for (const item of orderItems) {
        const itemVersions = versionsByItem.get(item.id);
        if (!itemVersions || itemVersions.length === 0) {
          sheet.addRow({
            product: getItemLabel(item),
            sku: item.sku,
            size: item.size || "",
            version: "",
            content: "No raw materials",
            images: "",
            updatedBy: "",
            date: "",
          });
        } else {
          for (const v of itemVersions) {
            sheet.addRow({
              product: getItemLabel(item),
              sku: item.sku,
              size: item.size || "",
              version: v.version_number,
              content: v.content || "",
              images: v.images.join(", "),
              updatedBy: v.profile?.full_name || v.profile?.email || "Unknown",
              date: formatTimestamp(v.created_at),
            });
          }
        }
      }

      // Legacy order-level notes
      for (const v of legacyVersions) {
        sheet.addRow({
          product: "(Order-level note)",
          sku: "",
          size: "",
          version: v.version_number,
          content: v.content || "",
          images: v.images.join(", "),
          updatedBy: v.profile?.full_name || v.profile?.email || "Unknown",
          date: formatTimestamp(v.created_at),
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Raw Materials - ${orderNumber}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Excel exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export Excel");
    }
  };

  const getItemLabel = (item: OrderItemInfo) => {
    return item.size ? `${item.product_name} - ${item.size}` : item.product_name;
  };

  const selectItem = (itemId: string) => {
    setSelectedItemId(itemId);
    setNewContent("");
    setNewImages([]);
  };

  // ── List View ──
  const renderListView = () => (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search */}
      <div className="relative py-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search items by name or SKU..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <ScrollArea className="flex-1 -mx-6 px-6">
        <div className="space-y-2 pb-4">
          {filteredItems.map((item) => {
            const itemVersions = versionsByItem.get(item.id);
            const count = itemVersions?.length || 0;
            const latest = itemVersions?.[0];
            const snippet = latest?.content
              ? latest.content.length > 60
                ? latest.content.slice(0, 60) + "…"
                : latest.content
              : null;

            return (
              <button
                key={item.id}
                onClick={() => selectItem(item.id)}
                className="w-full text-left rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors group"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">
                        {getItemLabel(item)}
                      </span>
                      {count > 0 && (
                        <Badge variant="secondary" className="shrink-0 text-[10px] h-5">
                          {count} {count === 1 ? "update" : "updates"}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.sku}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
                </div>
                {snippet ? (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-1">
                    Latest: "{snippet}"
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/60 mt-1.5 italic">
                    No raw materials yet
                  </p>
                )}
              </button>
            );
          })}

          {filteredItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-6">No items match your search</p>
          )}

          {/* Legacy order-level notes */}
          {legacyVersions.length > 0 && !searchQuery.trim() && (
            <div className="pt-4 border-t mt-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Order-level notes
                </span>
              </div>
              {legacyVersions.map((version) => (
                <div key={version.id} className="rounded-lg border bg-muted/50 p-3 mb-2">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-medium">
                      {version.profile?.full_name || version.profile?.email || "Unknown"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatTimestamp(version.created_at)}
                    </span>
                  </div>
                  {version.content && (
                    <p className="text-xs mt-1 line-clamp-2">{version.content}</p>
                  )}
                  {version.images.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {version.images.length} image(s)
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );

  // ── Detail View ──
  const renderDetailView = () => {
    const selectedItem = orderItems.find((i) => i.id === selectedItemId);
    if (!selectedItem) return null;

    return (
      <div className="flex flex-col flex-1 min-h-0">
        {/* Navigation bar */}
        <div className="flex items-center gap-2 py-2 border-b -mx-6 px-6">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 h-8 px-2"
            onClick={() => setSelectedItemId(null)}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <Select
            value={selectedItemId || ""}
            onValueChange={(val) => selectItem(val)}
          >
            <SelectTrigger className="h-8 text-xs flex-1 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {orderItems.map((item) => (
                <SelectItem key={item.id} value={item.id} className="text-xs">
                  {getItemLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Post form */}
        {canEdit && (
          <div className="space-y-3 py-3 border-b">
            <Textarea
              placeholder="Enter raw material details for this item..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="min-h-[60px] resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSave();
                }
              }}
            />
            <RawMaterialImageUpload images={newImages} onChange={setNewImages} compact />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">Press ⌘+Enter to submit</span>
              <Button
                onClick={handleSave}
                disabled={(!newContent.trim() && newImages.length === 0) || submitting}
                size="sm"
              >
                <Send className="h-4 w-4 mr-1" />
                {submitting ? "Posting..." : "Post"}
              </Button>
            </div>
          </div>
        )}

        {/* Timeline */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {selectedItemVersions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No raw material records yet</p>
              <p className="text-sm">Add the first version for this item</p>
            </div>
          ) : (
            <div className="relative py-4">
              <div className="absolute left-4 top-8 bottom-4 w-px bg-border" />
              <div className="space-y-6">
                {selectedItemVersions.map((version, index) => (
                  <div key={version.id} className="relative flex gap-3">
                    <div className="relative z-10">
                      <Avatar className="h-8 w-8 border-2 border-background">
                        <AvatarFallback
                          className={index === 0 ? "bg-primary text-primary-foreground" : "bg-muted"}
                        >
                          {getInitials(version.profile?.full_name, version.profile?.email)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {version.profile?.full_name || version.profile?.email || "Unknown User"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(version.created_at)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "mt-1 p-3 rounded-lg text-sm",
                          index === 0 ? "bg-primary/10 border border-primary/20" : "bg-muted"
                        )}
                      >
                        {version.content && (
                          <p className="whitespace-pre-wrap break-words">{version.content}</p>
                        )}
                        {version.images.length > 0 && (
                          <div className={`grid grid-cols-2 gap-2 ${version.content ? "mt-2" : ""}`}>
                            {version.images.map((url, imgIdx) => (
                              <a
                                key={imgIdx}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block rounded overflow-hidden border hover:opacity-80 transition-opacity"
                              >
                                <img
                                  src={url}
                                  alt={`RM image ${imgIdx + 1}`}
                                  className="w-full h-20 object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="flex flex-row items-center justify-between">
          <SheetTitle>Raw Materials - {orderNumber}</SheetTitle>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={handleExportExcel}
            disabled={loading}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </SheetHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : selectedItemId ? (
          renderDetailView()
        ) : (
          renderListView()
        )}
      </SheetContent>
    </Sheet>
  );
}
