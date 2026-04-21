import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Loader2, Pencil, Plus, Trash2, Warehouse } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

interface Storehouse {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export default function WarehouseSettings() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const canManage = hasRole("admin");

  const [storehouses, setStorehouses] = useState<Storehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const [editing, setEditing] = useState<Storehouse | null>(null);
  const [editName, setEditName] = useState("");

  const [toDelete, setToDelete] = useState<Storehouse | null>(null);

  const fetchStorehouses = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any)
        .from("storehouses")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true });
      if (error) throw error;
      setStorehouses(data || []);
    } catch (e: any) {
      toast({ title: t("toast.error"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStorehouses();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    try {
      const nextOrder = storehouses.length
        ? Math.max(...storehouses.map((s) => s.sort_order)) + 1
        : 1;
      const { data, error } = await (supabase as any)
        .from("storehouses")
        .insert({ name: newName.trim(), sort_order: nextOrder })
        .select()
        .single();
      if (error) throw error;
      toast({ title: t("toast.success"), description: t("toast.created_successfully") });
      logAudit({
        action: "storehouse.created",
        entity_type: "storehouse",
        entity_id: String(data.id),
        module: "warehouse_settings",
        metadata: { name: data.name, sort_order: data.sort_order },
      });
      setAddOpen(false);
      setNewName("");
      fetchStorehouses();
    } catch (e: any) {
      toast({ title: t("toast.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !editName.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("storehouses")
        .update({ name: editName.trim() })
        .eq("id", editing.id);
      if (error) throw error;
      toast({ title: t("toast.success"), description: t("toast.updated_successfully") });
      logAudit({
        action: "storehouse.renamed",
        entity_type: "storehouse",
        entity_id: String(editing.id),
        module: "warehouse_settings",
        metadata: { old_name: editing.name, new_name: editName.trim() },
      });
      setEditing(null);
      setEditName("");
      fetchStorehouses();
    } catch (e: any) {
      toast({ title: t("toast.error"), description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (sh: Storehouse) => {
    try {
      // Check usage in extra_boxes
      const { count, error: cErr } = await supabase
        .from("extra_boxes")
        .select("*", { count: "exact", head: true })
        .eq("storehouse", sh.id);
      if (cErr) throw cErr;
      if ((count || 0) > 0) {
        toast({
          title: t("toast.error"),
          description: t("warehouse_settings.in_use_error"),
          variant: "destructive",
        });
        return;
      }
      const { error } = await (supabase as any).from("storehouses").delete().eq("id", sh.id);
      if (error) throw error;
      toast({ title: t("toast.deleted_successfully") });
      logAudit({
        action: "storehouse.deleted",
        entity_type: "storehouse",
        entity_id: String(sh.id),
        module: "warehouse_settings",
        metadata: { name: sh.name },
      });
      fetchStorehouses();
    } catch (e: any) {
      toast({ title: t("toast.error"), description: e.message, variant: "destructive" });
    }
  };

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
            <Button variant="ghost" size="icon" onClick={() => navigate("/extra-inventory")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Warehouse className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">{t("warehouse_settings.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("warehouse_settings.subtitle")}</p>
            </div>
          </div>

          {canManage && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t("warehouse_settings.add")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("warehouse_settings.add")}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAdd} className="space-y-4">
                  <div>
                    <Label>{t("warehouse_settings.name")} *</Label>
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Storehouse 3"
                      required
                      autoFocus
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                      {t("common.cancel")}
                    </Button>
                    <Button type="submit" disabled={submitting || !newName.trim()}>
                      {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t("common.save")}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("warehouse_settings.list_title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {storehouses.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Warehouse className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>{t("warehouse_settings.empty")}</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[80px]">ID</TableHead>
                    <TableHead>{t("warehouse_settings.name")}</TableHead>
                    {canManage && <TableHead className="w-[140px] text-end">{t("common.actions")}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {storehouses.map((sh) => (
                    <TableRow key={sh.id}>
                      <TableCell className="font-mono">{sh.id}</TableCell>
                      <TableCell className="font-medium">{sh.name}</TableCell>
                      {canManage && (
                        <TableCell className="text-end">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditing(sh);
                              setEditName(sh.name);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setToDelete(sh)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {!canManage && (
              <p className="mt-4 text-xs text-muted-foreground">
                {t("warehouse_settings.read_only")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("warehouse_settings.edit")}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4">
            <div>
              <Label>{t("warehouse_settings.name")} *</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} required autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={submitting || !editName.trim()}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("common.save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("warehouse_settings.delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("warehouse_settings.delete_confirm")} ({toDelete?.name})? {t("extra.cannot_undo")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) {
                  handleDelete(toDelete);
                  setToDelete(null);
                }
              }}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
