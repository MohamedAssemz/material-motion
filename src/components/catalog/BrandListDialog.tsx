import { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Trash2, Loader2, Palette, Search, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface Brand {
  id: string;
  name_en: string;
  name_ar?: string | null;
  description?: string | null;
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
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [form, setForm] = useState({ name_en: '', name_ar: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setShowForm(false);
    setEditingBrand(null);
    setForm({ name_en: '', name_ar: '', description: '' });
    setImageFile(null);
    setImagePreview(null);
  };

  const filteredBrands = useMemo(() => {
    const sorted = [...brands].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase();
    return sorted.filter(brand => 
      brand.name_en.toLowerCase().includes(query) || 
      brand.name_ar?.toLowerCase().includes(query) ||
      brand.description?.toLowerCase().includes(query)
    );
  }, [brands, searchQuery]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Max 5MB', variant: 'destructive' });
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return editingBrand?.logo_url || null;
    setUploading(true);
    try {
      const ext = imageFile.name.split('.').pop();
      const path = `brands/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, imageFile);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      return urlData.publicUrl;
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      return editingBrand?.logo_url || null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) return;
    setSaving(true);
    try {
      const imageUrl = await uploadImage();
      if (editingBrand) {
        const { error } = await supabase
          .from('brands')
          .update({ 
            name_en: form.name_en.trim(), 
            name_ar: form.name_ar.trim() || null, 
            description: form.description.trim() || null,
            logo_url: imageUrl,
          })
          .eq('id', editingBrand.id);
        if (error) throw error;
        toast({ title: t('catalog.brand_updated') });
      } else {
        const { error } = await supabase
          .from('brands')
          .insert({ 
            name_en: form.name_en.trim(), 
            name_ar: form.name_ar.trim() || null, 
            description: form.description.trim() || null,
            logo_url: imageUrl,
          });
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
    setForm({ name_en: brand.name_en, name_ar: brand.name_ar || '', description: brand.description || '' });
    setImagePreview(brand.logo_url || null);
    setImageFile(null);
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
                <Label htmlFor="brand-name-en">{t('catalog.english_name')} *</Label>
                <Input id="brand-name-en" value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="Brand name" />
              </div>
              <div>
                <Label htmlFor="brand-name-ar">{t('catalog.arabic_name')}</Label>
                <Input id="brand-name-ar" value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} placeholder="اسم العلامة التجارية" dir="rtl" />
              </div>
            </div>
            <div>
              <Label htmlFor="brand-description">{t('catalog.description')}</Label>
              <Textarea
                id="brand-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('catalog.optional_desc')}
                rows={3}
              />
            </div>
            <div>
              <Label>{t('catalog.image')}</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
              />
              {imagePreview ? (
                <div className="relative w-24 h-24 mt-2">
                  <img src={imagePreview} alt="Preview" className="w-full h-full object-cover rounded-lg border" />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => { setImageFile(null); setImagePreview(null); }}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="me-2 h-4 w-4" />
                  {t('catalog.upload_image')}
                </Button>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
              <Button onClick={handleSave} disabled={saving || uploading || !form.name_en.trim()}>
                {(saving || uploading) && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
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
                          <img src={brand.logo_url} alt={brand.name_en} className="h-10 w-10 object-contain rounded shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                            <Palette className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {brand.name_en}{brand.name_ar ? ` - ${brand.name_ar}` : ''}
                            </span>
                            <Badge variant="secondary" className="shrink-0">
                              {brand.product_count || 0} {t('catalog.products_label')}
                            </Badge>
                          </div>
                          {brand.description && (
                            <p className="text-sm text-muted-foreground truncate">{brand.description}</p>
                          )}
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
