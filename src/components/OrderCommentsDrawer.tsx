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

interface Comment {
  id: string;
  content: string;
  created_at: string;
  created_by: string;
  profile?: {
    full_name: string | null;
    email: string | null;
  };
}

interface OrderCommentsDrawerProps {
  orderId: string;
  orderNumber: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OrderCommentsDrawer({
  orderId,
  orderNumber,
  open,
  onOpenChange,
}: OrderCommentsDrawerProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [newComment, setNewComment] = useState("");

  useEffect(() => {
    if (open) {
      fetchComments();
    }
  }, [open, orderId]);

  const fetchComments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("order_comments")
        .select("id, content, created_at, created_by")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch profile info for each unique user
      const userIds = [...new Set(data?.map((c) => c.created_by) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

      const commentsWithProfiles = (data || []).map((comment) => ({
        ...comment,
        profile: profileMap.get(comment.created_by) || null,
      }));

      setComments(commentsWithProfiles);
    } catch (error) {
      console.error("Error fetching comments:", error);
      toast.error("Failed to load comments");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!newComment.trim() || !user) return;

    try {
      setSubmitting(true);
      const { error } = await supabase.from("order_comments").insert({
        order_id: orderId,
        content: newComment.trim(),
        created_by: user.id,
      });

      if (error) throw error;

      setNewComment("");
      await fetchComments();
      toast.success("Comment added");
    } catch (error) {
      console.error("Error adding comment:", error);
      toast.error("Failed to add comment");
    } finally {
      setSubmitting(false);
    }
  };

  const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (email) {
      return email[0].toUpperCase();
    }
    return "?";
  };

  const formatTimestamp = (dateString: string) => {
    return format(new Date(dateString), "MMM d, yyyy 'at' h:mm a");
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Comments - {orderNumber}</SheetTitle>
        </SheetHeader>

        {/* New Comment Form */}
        <div className="space-y-3 py-4 border-b">
          <Textarea
            placeholder="Add a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            className="min-h-[80px] resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleSubmit();
              }
            }}
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-muted-foreground">
              Press ⌘+Enter to submit
            </span>
            <Button
              onClick={handleSubmit}
              disabled={!newComment.trim() || submitting}
              size="sm"
            >
              <Send className="h-4 w-4 mr-1" />
              {submitting ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>

        {/* Comments Timeline */}
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
          ) : comments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No comments yet</p>
              <p className="text-sm">Be the first to add a note</p>
            </div>
          ) : (
            <div className="relative py-4">
              {/* Timeline line */}
              <div className="absolute left-4 top-8 bottom-4 w-px bg-border" />

              <div className="space-y-6">
                {comments.map((comment, index) => (
                  <div key={comment.id} className="relative flex gap-3">
                    {/* Timeline dot */}
                    <div className="relative z-10">
                      <Avatar className="h-8 w-8 border-2 border-background">
                        <AvatarFallback className={index === 0 ? "bg-primary text-primary-foreground" : "bg-muted"}>
                          {getInitials(comment.profile?.full_name, comment.profile?.email)}
                        </AvatarFallback>
                      </Avatar>
                    </div>

                    {/* Comment content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {comment.profile?.full_name || comment.profile?.email || "Unknown User"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(comment.created_at)}
                        </span>
                      </div>
                      <div className={`mt-1 p-3 rounded-lg text-sm ${
                        index === 0 
                          ? "bg-primary/10 border border-primary/20" 
                          : "bg-muted"
                      }`}>
                        <p className="whitespace-pre-wrap break-words">{comment.content}</p>
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