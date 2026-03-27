import { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Trash2, Loader2, Tag, Search, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface Category {
  id: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  image_url: string | null;
  created_at: string;
  product_count?: number;
}

interface CategoryListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  onRefresh: () => void;
}

export function CategoryListDialog({ open, onOpenChange, categories, onRefresh }: CategoryListDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState({ name_en: '', name_ar: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setShowForm(false);
    setEditingCategory(null);
    setForm({ name_en: '', name_ar: '', description: '' });
    setImageFile(null);
    setImagePreview(null);
  };

  const filteredCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase();
    return sorted.filter(cat => 
      cat.name_en.toLowerCase().includes(query) || 
      cat.name_ar?.toLowerCase().includes(query) ||
      cat.description?.toLowerCase().includes(query)
    );
  }, [categories, searchQuery]);

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
    if (!imageFile) return editingCategory?.image_url || null;
    setUploading(true);
    try {
      const ext = imageFile.name.split('.').pop();
      const path = `categories/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('product-images').upload(path, imageFile);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('product-images').getPublicUrl(path);
      return urlData.publicUrl;
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
      return editingCategory?.image_url || null;
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name_en.trim()) return;
    setSaving(true);
    try {
      const imageUrl = await uploadImage();
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({ 
            name_en: form.name_en.trim(), 
            name_ar: form.name_ar.trim() || null,
            description: form.description.trim() || null,
            image_url: imageUrl,
          })
          .eq('id', editingCategory.id);
        if (error) throw error;
        toast({ title: t('catalog.category_updated') });
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({ 
            name_en: form.name_en.trim(), 
            name_ar: form.name_ar.trim() || null,
            description: form.description.trim() || null,
            image_url: imageUrl,
          });
        if (error) throw error;
        toast({ title: t('catalog.category_created') });
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
    if (!confirm(t('catalog.confirm_delete_category'))) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
      toast({ title: t('catalog.category_deleted') });
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    setForm({ name_en: category.name_en, name_ar: category.name_ar || '', description: category.description || '' });
    setImagePreview(category.image_url || null);
    setImageFile(null);
    setShowForm(true);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { resetForm(); setSearchQuery(''); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            {t('catalog.manage_categories')}
          </DialogTitle>
          <DialogDescription>
            {t('catalog.manage_categories_desc')}
          </DialogDescription>
        </DialogHeader>

        {showForm ? (
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cat-name-en">{t('catalog.english_name')} *</Label>
                <Input
                  id="cat-name-en"
                  value={form.name_en}
                  onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                  placeholder="Category name"
                />
              </div>
              <div>
                <Label htmlFor="cat-name-ar">{t('catalog.arabic_name')}</Label>
                <Input
                  id="cat-name-ar"
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                  placeholder="اسم الفئة"
                  dir="rtl"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="cat-description">{t('catalog.description')}</Label>
              <Textarea
                id="cat-description"
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
                {editingCategory ? t('common.update') : t('common.create')}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('catalog.search_categories')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="ps-9"
                />
              </div>
              <Button size="sm" onClick={() => setShowForm(true)}>
                <Plus className="me-2 h-4 w-4" />
                {t('catalog.add_category')}
              </Button>
            </div>

            <ScrollArea className="flex-1 -mx-6 px-6 min-h-[300px]">
              {filteredCategories.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? t('catalog.no_categories_match') : t('catalog.no_categories_yet')}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredCategories.map((category) => (
                    <div
                      key={category.id}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        {category.image_url ? (
                          <img src={category.image_url} alt={category.name_en} className="h-10 w-10 object-cover rounded shrink-0" />
                        ) : (
                          <div className="h-10 w-10 rounded bg-muted flex items-center justify-center shrink-0">
                            <Tag className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {category.name_en}{category.name_ar ? ` - ${category.name_ar}` : ''}
                            </span>
                            <Badge variant="secondary" className="shrink-0">
                              {category.product_count || 0} {t('catalog.products_label')}
                            </Badge>
                          </div>
                          {category.description && (
                            <p className="text-sm text-muted-foreground truncate">{category.description}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 ms-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(category)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(category.id)}>
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
