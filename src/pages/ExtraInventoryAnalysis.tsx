import { useEffect, useMemo, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TablePagination } from "@/components/TablePagination";
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Loader2,
  Search,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "red" | "yellow" | "normal";

interface SizeRow {
  size: string | null;
  quantity: number;
  pct: number;
}

interface AnalysisRow {
  product_id: string;
  name_en: string;
  name_ar: string | null;
  sku: string;
  available: number;
  minimum: number;
  delta: number;
  status: Status;
  sizes: SizeRow[];
}

const PAGE_SIZE = 15;

function statusOf(available: number, minimum: number): Status {
  if (minimum <= 0) return "normal";
  if (available <= minimum) return "red";
  if (available <= minimum * 1.1) return "yellow";
  return "normal";
}

export default function ExtraInventoryAnalysis() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<AnalysisRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [productsRes, batchesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id, sku, name_en, name_ar, minimum_quantity"),
        supabase
          .from("extra_batches")
          .select("product_id, size, quantity")
          .eq("inventory_state", "AVAILABLE"),
      ]);
      if (productsRes.error) throw productsRes.error;
      if (batchesRes.error) throw batchesRes.error;

      const totals = new Map<string, { total: number; sizes: Map<string, number> }>();
      for (const b of batchesRes.data || []) {
        const key = b.product_id as string;
        const sizeKey = (b.size as string | null) ?? "__none__";
        const entry = totals.get(key) ?? { total: 0, sizes: new Map() };
        entry.total += b.quantity as number;
        entry.sizes.set(sizeKey, (entry.sizes.get(sizeKey) ?? 0) + (b.quantity as number));
        totals.set(key, entry);
      }

      const out: AnalysisRow[] = [];
      for (const p of productsRes.data || []) {
        const agg = totals.get(p.id as string);
        const available = agg?.total ?? 0;
        const minimum = (p.minimum_quantity as number) ?? 0;

        // Hide products with no minimum threshold AND no stock — nothing to report.
        if (minimum <= 0 && available <= 0) continue;

        const sizes: SizeRow[] = [];
        if (agg) {
          for (const [sizeKey, qty] of agg.sizes.entries()) {
            sizes.push({
              size: sizeKey === "__none__" ? null : sizeKey,
              quantity: qty,
              pct: available > 0 ? (qty / available) * 100 : 0,
            });
          }
          sizes.sort((a, b) => b.quantity - a.quantity);
        }

        out.push({
          product_id: p.id as string,
          name_en: p.name_en as string,
          name_ar: (p.name_ar as string | null) ?? null,
          sku: p.sku as string,
          available,
          minimum,
          delta: available - minimum,
          status: statusOf(available, minimum),
          sizes,
        });
      }

      // Most critical first: smallest (most negative) delta on top.
      out.sort((a, b) => {
        if (a.delta !== b.delta) return a.delta - b.delta;
        return a.name_en.localeCompare(b.name_en);
      });

      setRows(out);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel("extra-analysis")
      .on("postgres_changes", { event: "*", schema: "public", table: "extra_batches" }, () => {
        fetchData();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    let r = rows;
    if (search.trim()) {
      const q = search.toLowerCase();
      r = r.filter(
        (x) =>
          x.name_en.toLowerCase().includes(q) ||
          (x.name_ar ?? "").toLowerCase().includes(q) ||
          x.sku.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") r = r.filter((x) => x.status === statusFilter);
    return r;
  }, [rows, search, statusFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  const counts = useMemo(() => {
    const c = { red: 0, yellow: 0, normal: 0 };
    for (const r of rows) c[r.status]++;
    return c;
  }, [rows]);

  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const productName = (r: AnalysisRow) =>
    language === "ar" && r.name_ar ? r.name_ar : r.name_en;

  const statusBadge = (s: Status) => {
    const cls =
      s === "red"
        ? "bg-destructive text-destructive-foreground"
        : s === "yellow"
        ? "bg-yellow-500 text-white"
        : "bg-emerald-500 text-white";
    const label =
      s === "red"
        ? t("extra_analysis.status.red")
        : s === "yellow"
        ? t("extra_analysis.status.yellow")
        : t("extra_analysis.status.normal");
    return <Badge className={cls}>{label}</Badge>;
  };

  const rowTint = (s: Status) =>
    s === "red"
      ? "bg-destructive/5 border-l-4 border-destructive"
      : s === "yellow"
      ? "bg-yellow-500/5 border-l-4 border-yellow-500"
      : "";

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
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <BarChart3 className="h-6 w-6 text-amber-500" />
            <div>
              <h1 className="text-xl font-bold">{t("extra_analysis.title")}</h1>
              <p className="text-sm text-muted-foreground">{t("extra_analysis.subtitle")}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto space-y-4 px-4 py-6">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <Card className="border-l-4 border-destructive">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <div>
                <p className="text-xs text-muted-foreground">{t("extra_analysis.summary.critical")}</p>
                <p className="text-2xl font-bold">{counts.red}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-yellow-500">
            <CardContent className="flex items-center gap-3 p-4">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              <div>
                <p className="text-xs text-muted-foreground">{t("extra_analysis.summary.warning")}</p>
                <p className="text-2xl font-bold">{counts.yellow}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-emerald-500">
            <CardContent className="flex items-center gap-3 p-4">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">{t("extra_analysis.summary.healthy")}</p>
                <p className="text-2xl font-bold">{counts.normal}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("extra_analysis.search_placeholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ps-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-full sm:w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("extra_analysis.filter.all")}</SelectItem>
                  <SelectItem value="red">{t("extra_analysis.status.red")}</SelectItem>
                  <SelectItem value="yellow">{t("extra_analysis.status.yellow")}</SelectItem>
                  <SelectItem value="normal">{t("extra_analysis.status.normal")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>{t("extra_analysis.col.product")}</TableHead>
                    <TableHead className="text-end">{t("extra_analysis.col.available")}</TableHead>
                    <TableHead className="text-end">{t("extra_analysis.col.minimum")}</TableHead>
                    <TableHead className="text-end">{t("extra_analysis.col.delta")}</TableHead>
                    <TableHead>{t("extra_analysis.col.status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paged.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        {t("extra_analysis.empty_state")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paged.map((r) => {
                      const isOpen = expanded.has(r.product_id);
                      return (
                        <Fragment key={r.product_id}>
                          <TableRow className={cn(rowTint(r.status))}>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => toggleExpand(r.product_id)}
                              >
                                {isOpen ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell>
                              <p className="font-medium">{productName(r)}</p>
                              <p className="text-xs text-muted-foreground">{r.sku}</p>
                            </TableCell>
                            <TableCell className="text-end font-semibold">{r.available}</TableCell>
                            <TableCell className="text-end">{r.minimum}</TableCell>
                            <TableCell
                              className={cn(
                                "text-end font-medium",
                                r.delta < 0 && "text-destructive",
                                r.delta === 0 && "text-yellow-600",
                                r.delta > 0 && "text-emerald-600"
                              )}
                            >
                              {r.delta > 0 ? `+${r.delta}` : r.delta}
                            </TableCell>
                            <TableCell>{statusBadge(r.status)}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow className={cn(rowTint(r.status))}>
                              <TableCell colSpan={6} className="bg-muted/30">
                                <div className="space-y-2 p-2">
                                  <p className="text-xs font-semibold text-muted-foreground">
                                    {t("extra_analysis.size_breakdown")}
                                  </p>
                                  {r.sizes.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">
                                      {t("extra_analysis.no_stock")}
                                    </p>
                                  ) : (
                                    <div className="space-y-2">
                                      {r.sizes.map((s, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                          <span className="w-20 text-sm font-medium">
                                            {s.size ?? t("extra_analysis.no_size")}
                                          </span>
                                          <div className="flex-1">
                                            <Progress value={s.pct} className="h-2" />
                                          </div>
                                          <span className="w-16 text-end text-sm tabular-nums">
                                            {s.quantity}
                                          </span>
                                          <span className="w-14 text-end text-xs text-muted-foreground tabular-nums">
                                            {s.pct.toFixed(1)}%
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </Fragment>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <TablePagination
              currentPage={currentPage}
              totalItems={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
