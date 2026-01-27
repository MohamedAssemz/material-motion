import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Trash2, Loader2, Palette, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Brand {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
  product_count?: number;
}

interface BrandListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brands: Brand[];
  onRefresh: () => void;
}

export function BrandListDialog({ open, onOpenChange, brands, onRefresh }: BrandListDialogProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name: '', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const resetForm = () => {
    setShowForm(false);
    setEditingBrand(null);
    setForm({ name: '', logo_url: '' });
  };

  const filteredBrands = useMemo(() => {
    const sorted = [...brands].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase();
    return sorted.filter(brand => brand.name.toLowerCase().includes(query));
  }, [brands, searchQuery]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingBrand) {
        const { error } = await supabase
          .from('brands')
          .update({ name: form.name.trim(), logo_url: form.logo_url.trim() || null })
          .eq('id', editingBrand.id);
        if (error) throw error;
        toast({ title: 'Brand updated' });
      } else {
        const { error } = await supabase
          .from('brands')
          .insert({ name: form.name.trim(), logo_url: form.logo_url.trim() || null });
        if (error) throw error;
        toast({ title: 'Brand created' });
      }
      resetForm();
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this brand?')) return;
    try {
      const { error } = await supabase.from('brands').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Brand deleted' });
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setForm({ name: brand.name, logo_url: brand.logo_url || '' });
    setShowForm(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { resetForm(); setSearchQuery(''); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Manage Brands
          </DialogTitle>
          <DialogDescription>
            Create and manage product brands
          </DialogDescription>
        </DialogHeader>

        {showForm ? (
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="brand-name">Name *</Label>
              <Input
                id="brand-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Brand name"
              />
            </div>
            <div>
              <Label htmlFor="brand-logo">Logo URL</Label>
              <Input
                id="brand-logo"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingBrand ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search brands..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Brand
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6 min-h-[300px]">
              {filteredBrands.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? 'No brands match your search.' : 'No brands yet. Create your first brand.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBrands.map((brand) => (
                    <div
                      key={brand.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {brand.logo_url ? (
                          <img src={brand.logo_url} alt={brand.name} className="h-10 w-10 object-contain rounded" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                            <Palette className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{brand.name}</span>
                            <Badge variant="secondary" className="shrink-0">
                              {brand.product_count || 0} products
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(brand)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(brand.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}