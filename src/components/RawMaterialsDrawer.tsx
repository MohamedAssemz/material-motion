import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { format } from "date-fns";
import { Send } from "lucide-react";
import { RawMaterialImageUpload } from "@/components/RawMaterialImageUpload";

interface RawMaterialVersion {
  id: string;
  version_number: number;
  content: string;
  images: string[];
  created_by: string | null;
  created_at: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface RawMaterialsDrawerProps {
  orderId: string;
  orderNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RawMaterialsDrawer({
  orderId,
  orderNumber,
  open,
  onOpenChange,
}: RawMaterialsDrawerProps) {
  const { user, hasRole } = useAuth();
  const [versions, setVersions] = useState<RawMaterialVersion[]>([]);
  const [newContent, setNewContent] = useState("");
  const [newImages, setNewImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const canEdit = hasRole("manufacture_lead") || hasRole("admin");

  useEffect(() => {
    if (open) {
      fetchVersions();
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
        profile: v.created_by ? profileMap.get(v.created_by) : undefined,
      })) || [];

      setVersions(mappedVersions);

      if (mappedVersions.length > 0 && !newContent) {
        setNewContent(mappedVersions[0].content);
      }
    } catch (error) {
      console.error("Error fetching raw material versions:", error);
      toast.error("Failed to load raw materials");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if ((!newContent.trim() && newImages.length === 0) || !user) return;

    setSubmitting(true);
    try {
      const nextVersion = versions.length > 0 ? versions[0].version_number + 1 : 1;

      const { error } = await supabase.from("raw_material_versions").insert({
        order_id: orderId,
        version_number: nextVersion,
        content: newContent.trim(),
        images: newImages,
        created_by: user.id,
      });

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

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Raw Materials - {orderNumber}</SheetTitle>
        </SheetHeader>

        {canEdit && (
          <div className="space-y-3 py-4 border-b">
            <Textarea
              placeholder="Enter raw material details for this order..."
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              className="min-h-[80px] resize-none"
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
          ) : versions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No raw material records yet</p>
              <p className="text-sm">Add the first version</p>
            </div>
          ) : (
            <div className="relative py-4">
              <div className="absolute left-4 top-8 bottom-4 w-px bg-border" />
              <div className="space-y-6">
                {versions.map((version, index) => (
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
                      <div
                        className={`mt-1 p-3 rounded-lg text-sm ${
                          index === 0
                            ? "bg-primary/10 border border-primary/20"
                            : "bg-muted"
                        }`}
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
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
