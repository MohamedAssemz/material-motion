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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { Send } from "lucide-react";
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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null); // null = "All Items"

  const canEdit = hasRole("admin");

  useEffect(() => {
    if (open) {
      fetchVersions();
      setSelectedItemId(null);
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

  const filteredVersions = useMemo(() => {
    if (selectedItemId === null) {
      // "All Items" - show everything
      return versions;
    }
    return versions.filter((v) => v.order_item_id === selectedItemId);
  }, [versions, selectedItemId]);

  // Count versions per item for badge indicators
  const itemVersionCounts = useMemo(() => {
    const counts = new Map<string, number>();
    versions.forEach((v) => {
      if (v.order_item_id) {
        counts.set(v.order_item_id, (counts.get(v.order_item_id) || 0) + 1);
      }
    });
    return counts;
  }, [versions]);

  const legacyVersions = useMemo(() => {
    return versions.filter((v) => !v.order_item_id);
  }, [versions]);

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

  const getItemLabel = (item: OrderItemInfo) => {
    return item.size ? `${item.product_name} - ${item.size}` : item.product_name;
  };

  const getItemForVersion = (orderItemId: string | null) => {
    if (!orderItemId) return null;
    return orderItems.find((i) => i.id === orderItemId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>Raw Materials - {orderNumber}</SheetTitle>
        </SheetHeader>

        {/* Tab bar */}
        <div className="border-b -mx-6 px-6">
          <ScrollArea className="w-full">
            <div className="flex gap-1 pb-2 pt-1 overflow-x-auto">
              <Button
                variant={selectedItemId === null ? "default" : "ghost"}
                size="sm"
                className="shrink-0 text-xs h-8"
                onClick={() => {
                  setSelectedItemId(null);
                  setNewContent("");
                  setNewImages([]);
                }}
              >
                All Items
                {legacyVersions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                    {legacyVersions.length}
                  </Badge>
                )}
              </Button>
              {orderItems.map((item) => (
                <Button
                  key={item.id}
                  variant={selectedItemId === item.id ? "default" : "ghost"}
                  size="sm"
                  className="shrink-0 text-xs h-8"
                  onClick={() => {
                    setSelectedItemId(item.id);
                    setNewContent("");
                    setNewImages([]);
                  }}
                >
                  {getItemLabel(item)}
                  {itemVersionCounts.has(item.id) && (
                    <span className="ml-1 w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                  )}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Post form - only on individual item tabs */}
        {canEdit && selectedItemId && (
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
            <RawMaterialImageUpload
              images={newImages}
              onChange={setNewImages}
              compact
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                Press ⌘+Enter to submit
              </span>
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
          ) : filteredVersions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No raw material records yet</p>
              {selectedItemId && <p className="text-sm">Add the first version for this item</p>}
            </div>
          ) : (
            <div className="relative py-4">
              <div className="absolute left-4 top-8 bottom-4 w-px bg-border" />
              <div className="space-y-6">
                {filteredVersions.map((version, index) => {
                  const itemInfo = getItemForVersion(version.order_item_id);
                  return (
                    <div key={version.id} className="relative flex gap-3">
                      <div className="relative z-10">
                        <Avatar className="h-8 w-8 border-2 border-background">
                          <AvatarFallback
                            className={
                              index === 0 ? "bg-primary text-primary-foreground" : "bg-muted"
                            }
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
                        {/* Show item label when in "All Items" view */}
                        {selectedItemId === null && itemInfo && (
                          <Badge variant="outline" className="mt-0.5 text-[10px] h-5">
                            {getItemLabel(itemInfo)}
                          </Badge>
                        )}
                        {selectedItemId === null && !version.order_item_id && (
                          <Badge variant="secondary" className="mt-0.5 text-[10px] h-5">
                            Order-level note
                          </Badge>
                        )}
                        <div
                          className={cn(
                            "mt-1 p-3 rounded-lg text-sm",
                            index === 0
                              ? "bg-primary/10 border border-primary/20"
                              : "bg-muted"
                          )}
                        >
                          {version.content && (
                            <p className="whitespace-pre-wrap break-words">{version.content}</p>
                          )}
                          {version.images && version.images.length > 0 && (
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
                  );
                })}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
