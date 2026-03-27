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
import { useLanguage } from '@/contexts/LanguageContext';

interface Brand {
  id: string;
  name_en: string;
  name_ar?: string | null;
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
  const { t, language } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name_en: '', name_ar: '', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const resetForm = () => {
    setShowForm(false);
    setEditingBrand(null);
    setForm({ name_en: '', name_ar: '', logo_url: '' });
  };

  const filteredBrands = useMemo(() => {
    const sorted = [...brands].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase();
    return sorted.filter(brand => brand.name_en.toLowerCase().includes(query) || brand.name_ar?.toLowerCase().includes(query));
  }, [brands, searchQuery]);

  const handleSave = async () => {
    if (!form.name_en.trim()) return;
    setSaving(true);
    try {
      if (editingBrand) {
        const { error } = await supabase
          .from('brands')
          .update({ name_en: form.name_en.trim(), name_ar: form.name_ar.trim() || null, logo_url: form.logo_url.trim() || null })
          .eq('id', editingBrand.id);
        if (error) throw error;
        toast({ title: t('catalog.brand_updated') });
      } else {
        const { error } = await supabase
          .from('brands')
          .insert({ name_en: form.name_en.trim(), name_ar: form.name_ar.trim() || null, logo_url: form.logo_url.trim() || null });
        if (error) throw error;
        toast({ title: t('catalog.brand_created') });
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
    if (!confirm(t('catalog.confirm_delete_brand'))) return;
    try {
      const { error } = await supabase.from('brands').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('catalog.brand_deleted') });
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEdit = (brand: Brand) => {
    setEditingBrand(brand);
    setForm({ name_en: brand.name_en, name_ar: brand.name_ar || '', logo_url: brand.logo_url || '' });
    setShowForm(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { resetForm(); setSearchQuery(''); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            {t('catalog.manage_brands')}
          </DialogTitle>
          <DialogDescription>
            {t('catalog.manage_brands_desc')}
          </DialogDescription>
        </DialogHeader>

        {showForm ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="brand-name-en">{t('catalog.english_brand')} *</Label>
                <Input id="brand-name-en" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="brand-name-ar">{t('catalog.arabic_brand')}</Label>
                <Input id="brand-name-ar" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} dir="rtl" />
              </div>
            </div>
            <div>
              <Label htmlFor="brand-logo">{t('catalog.logo_url')}</Label>
              <Input id="brand-logo" value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://example.com/logo.png" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
              <Button onClick={handleSave} disabled={saving || !form.name_en.trim()}>
                {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
                {editingBrand ? t('common.update') : t('common.create')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('catalog.search_brands')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ps-9"
                />
              </div>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="me-2 h-4 w-4" />
                {t('catalog.add_brand')}
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6 min-h-[300px]">
              {filteredBrands.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? t('catalog.no_brands_match') : t('catalog.no_brands_yet')}
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
                          <img src={brand.logo_url} alt={brand.name_en} className="h-10 w-10 object-contain rounded" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                            <Palette className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{language === 'ar' && brand.name_ar ? brand.name_ar : brand.name_en}</span>
                            <Badge variant="secondary" className="shrink-0">
                              {brand.product_count || 0} {t('catalog.products_label')}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1 ms-2">
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
