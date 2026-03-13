import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
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
import { ArrowLeft, Plus, Loader2, Trash2, Pencil, Check, X, Hammer, Sparkles, Package, Box, Cog } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Machine {
  id: string;
  name: string;
  type: "manufacturing" | "finishing" | "packaging" | "boxing";
  is_active: boolean;
  created_at: string;
}

const TYPE_CONFIG: Record<
  string,
  { labelKey: string; icon: React.ElementType; accent: string; bg: string; iconBg: string }
> = {
  manufacturing: {
    labelKey: "machines.type.manufacturing",
    icon: Hammer,
    accent: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    iconBg: "bg-blue-100 dark:bg-blue-900/50",
  },
  finishing: {
    labelKey: "machines.type.finishing",
    icon: Sparkles,
    accent: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    iconBg: "bg-purple-100 dark:bg-purple-900/50",
  },
  packaging: {
    labelKey: "machines.type.packaging",
    icon: Package,
    accent: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    iconBg: "bg-orange-100 dark:bg-orange-900/50",
  },
  boxing: {
    labelKey: "machines.type.boxing",
    icon: Box,
    accent: "text-cyan-600",
    bg: "bg-cyan-50 dark:bg-cyan-950/30",
    iconBg: "bg-cyan-100 dark:bg-cyan-900/50",
  },
};

export default function Machines() {
  const navigate = useNavigate();
  const { hasRole } = useAuth();
  const { t, isRTL } = useLanguage();
  const isAdmin = hasRole("admin");
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newMachine, setNewMachine] = useState<{
    name: string;
    type: "manufacturing" | "finishing" | "packaging" | "boxing";
  }>({ name: "", type: "manufacturing" });
  const [submitting, setSubmitting] = useState(false);
  const [machineToDelete, setMachineToDelete] = useState<Machine | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    fetchMachines();
  }, []);

  const fetchMachines = async () => {
    try {
      const { data, error } = await supabase
        .from("machines")
        .select("*")
        .order("type", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      setMachines((data as Machine[]) || []);
    } catch {
      toast.error(t("toast.action_failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleAddMachine = async () => {
    if (!newMachine.name.trim()) {
      toast.error(t("toast.invalid_input"));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("machines").insert({ name: newMachine.name.trim(), type: newMachine.type });
      if (error) throw error;
      toast.success(t("toast.created_successfully"));
      setDialogOpen(false);
      setNewMachine({ name: "", type: "manufacturing" });
      fetchMachines();
    } catch {
      toast.error(t("toast.action_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMachineStatus = async (machine: Machine) => {
    try {
      const { error } = await supabase.from("machines").update({ is_active: !machine.is_active }).eq("id", machine.id);
      if (error) throw error;
      setMachines((prev) => prev.map((m) => (m.id === machine.id ? { ...m, is_active: !m.is_active } : m)));
      toast.success(t("toast.updated_successfully"));
    } catch {
      toast.error(t("toast.action_failed"));
    }
  };

  const handleDeleteMachine = async () => {
    if (!machineToDelete) return;
    try {
      const { error } = await supabase.from("machines").delete().eq("id", machineToDelete.id);
      if (error) throw error;
      setMachines((prev) => prev.filter((m) => m.id !== machineToDelete.id));
      toast.success(t("toast.deleted_successfully"));
    } catch {
      toast.error(t("toast.action_failed"));
    } finally {
      setMachineToDelete(null);
    }
  };

  const startEdit = (machine: Machine) => {
    setEditingId(machine.id);
    setEditingName(machine.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = async (machine: Machine) => {
    if (!editingName.trim()) {
      toast.error(t("toast.invalid_input"));
      return;
    }
    try {
      const { error } = await supabase.from("machines").update({ name: editingName.trim() }).eq("id", machine.id);
      if (error) throw error;
      setMachines((prev) => prev.map((m) => (m.id === machine.id ? { ...m, name: editingName.trim() } : m)));
      toast.success(t("toast.updated_successfully"));
    } catch {
      toast.error(t("toast.action_failed"));
    } finally {
      cancelEdit();
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const grouped = (["manufacturing", "finishing", "packaging", "boxing"] as const).map((type) => ({
    type,
    machines: machines.filter((m) => m.type === type),
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className={cn("flex items-center gap-3", isRTL && "flex-row-reverse")}>
            <Cog className="h-6 w-6 text-primary" />
            <div className={isRTL ? "text-right" : ""}>
              <h1 className="text-xl font-bold">{t("machines.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("machines.manage_desc")}</p>
            </div>
          </div>
          {isAdmin && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  {t("machines.add_machine")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("machines.add_new")}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{t("machines.machine_name")}</Label>
                    <Input
                      id="name"
                      value={newMachine.name}
                      onChange={(e) => setNewMachine((prev) => ({ ...prev, name: e.target.value }))}
                      placeholder={t("machines.machine_placeholder")}
                      onKeyDown={(e) => e.key === "Enter" && handleAddMachine()}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("form.type")}</Label>
                    <Select
                      value={newMachine.type}
                      onValueChange={(v) => setNewMachine((prev) => ({ ...prev, type: v as typeof newMachine.type }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                          <SelectItem key={key} value={key}>
                            {t(cfg.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button onClick={handleAddMachine} disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : t("machines.add_machine")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>

      <div className="container mx-auto p-6">
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {grouped.map(({ type, machines: list }) => {
            const cfg = TYPE_CONFIG[type];
            const Icon = cfg.icon;
            const activeCount = list.filter((m) => m.is_active).length;
            return (
              <div key={type} className={cn("rounded-2xl border border-border overflow-hidden", cfg.bg)}>
                {/* Section header */}
                <div className={cn("px-5 pt-5 pb-4 flex items-center gap-3", isRTL && "flex-row-reverse")}>
                  <div className={cn("p-2 rounded-xl", cfg.iconBg)}>
                    <Icon className={cn("h-5 w-5", cfg.accent)} />
                  </div>
                  <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                    <p className="font-semibold text-foreground">{t(cfg.labelKey)}</p>
                    <p className="text-xs text-muted-foreground">
                      {activeCount}/{list.length} {t("machines.active_count")}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {list.length}
                  </Badge>
                </div>

                {/* Machine list */}
                <div className="px-3 pb-4 space-y-2">
                  {list.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground text-sm">{t("machines.no_machines")}</div>
                  ) : (
                    list.map((machine) => (
                      <div
                        key={machine.id}
                        className={cn(
                          "bg-card rounded-xl border border-border px-4 py-3 flex items-center gap-3 group",
                          isRTL && "flex-row-reverse",
                        )}
                      >
                        {/* Status dot */}
                        <span
                          className={cn(
                            "h-2 w-2 rounded-full shrink-0 transition-colors",
                            machine.is_active ? "bg-green-500" : "bg-muted-foreground/40",
                          )}
                        />

                        {/* Name / inline edit */}
                        <div className={cn("flex-1 min-w-0", isRTL && "text-right")}>
                          {editingId === machine.id ? (
                            <Input
                              autoFocus
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit(machine);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="h-7 text-sm"
                            />
                          ) : (
                            <p
                              className={cn(
                                "text-sm font-medium truncate",
                                !machine.is_active && "text-muted-foreground",
                              )}
                            >
                              {machine.name}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        {isAdmin && (
                          <div className={cn("flex items-center gap-1 shrink-0", isRTL && "flex-row-reverse")}>
                            {editingId === machine.id ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-green-600 hover:text-green-700"
                                  onClick={() => saveEdit(machine)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground"
                                  onClick={cancelEdit}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => startEdit(machine)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Switch
                                  checked={machine.is_active}
                                  onCheckedChange={() => toggleMachineStatus(machine)}
                                  className="scale-75"
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => setMachineToDelete(machine)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                        {!isAdmin && (
                          <span
                            className={cn(
                              "text-xs font-medium px-2 py-0.5 rounded-full",
                              machine.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground",
                            )}
                          >
                            {machine.is_active ? t("common.active") : t("common.inactive")}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog open={!!machineToDelete} onOpenChange={(open) => !open && setMachineToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("machines.delete_title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("machines.delete_desc")} "{machineToDelete?.name}"? {t("machines.delete_warning")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMachine}
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
