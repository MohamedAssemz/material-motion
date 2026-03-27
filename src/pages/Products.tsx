import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Package, Plus, Edit, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { getProductDisplayName } from "@/lib/catalogHelpers";

interface Product {
  id: string;
  sku: string;
  name_en: string;
  name_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  needs_packing: boolean;
}

export default function Products() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    sku: "",
    name_en: "",
    name_ar: "",
    description_en: "",
    description_ar: "",
    needs_packing: true,
  });

  const canManage = hasRole("admin");

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase.from("products").select("id, sku, name_en, name_ar, description_en, description_ar, needs_packing").order("sku");
      if (error) throw error;
      setProducts(data || []);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        sku: formData.sku,
        name_en: formData.name_en,
        name_ar: formData.name_ar || null,
        description_en: formData.description_en || null,
        description_ar: formData.description_ar || null,
        needs_packing: formData.needs_packing,
      };
      if (editingProduct) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (error) throw error;
        toast({ title: "Success", description: "Product updated successfully" });
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast({ title: "Success", description: "Product created successfully" });
      }
      setDialogOpen(false);
      resetForm();
      fetchProducts();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const resetForm = () => {
    setFormData({ sku: "", name_en: "", name_ar: "", description_en: "", description_ar: "", needs_packing: true });
    setEditingProduct(null);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      sku: product.sku,
      name_en: product.name_en,
      name_ar: product.name_ar || "",
      description_en: product.description_en || "",
      description_ar: product.description_ar || "",
      needs_packing: product.needs_packing ?? true,
    });
    setDialogOpen(true);
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
            <Package className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-xl font-bold">Products</h1>
              <p className="text-sm text-muted-foreground">Manage product catalog</p>
            </div>
          </div>
          {canManage && (
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" />Add Product</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label htmlFor="sku">SKU</Label>
                    <Input id="sku" value={formData.sku} onChange={(e) => setFormData({ ...formData, sku: e.target.value })} required />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name_en">English Name *</Label>
                      <Input id="name_en" value={formData.name_en} onChange={(e) => setFormData({ ...formData, name_en: e.target.value })} required />
                    </div>
                    <div>
                      <Label htmlFor="name_ar">Arabic Name</Label>
                      <Input id="name_ar" value={formData.name_ar} onChange={(e) => setFormData({ ...formData, name_ar: e.target.value })} dir="rtl" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="description_en">English Description</Label>
                      <Textarea id="description_en" value={formData.description_en} onChange={(e) => setFormData({ ...formData, description_en: e.target.value })} rows={2} />
                    </div>
                    <div>
                      <Label htmlFor="description_ar">Arabic Description</Label>
                      <Textarea id="description_ar" value={formData.description_ar} onChange={(e) => setFormData({ ...formData, description_ar: e.target.value })} rows={2} dir="rtl" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <Label htmlFor="needs_packing" className="font-medium">Needs Packing</Label>
                      <p className="text-xs text-muted-foreground">Enable if this product requires packing phase</p>
                    </div>
                    <Switch id="needs_packing" checked={formData.needs_packing} onCheckedChange={(checked) => setFormData({ ...formData, needs_packing: checked })} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" className="flex-1">{editingProduct ? "Update" : "Create"}</Button>
                    <Button type="button" variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </header>
      <div className="container mx-auto p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{getProductDisplayName(product, language)}</CardTitle>
                    <CardDescription>{product.sku}</CardDescription>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(product)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground flex-1">
                    {(language === 'ar' ? product.description_ar : product.description_en) || "No description available"}
                  </p>
                  {product.needs_packing ? (
                    <Badge variant="secondary" className="ml-2">Packing</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-2">No Packing</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        {products.length === 0 && (
          <Card className="p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No products yet</h3>
            <p className="text-muted-foreground mb-4">
              {canManage ? "Get started by adding your first product" : "Products will appear here once added by administrators"}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
