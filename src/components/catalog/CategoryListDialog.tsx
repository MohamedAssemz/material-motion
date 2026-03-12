import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Edit, Trash2, Loader2, Tag, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';

interface Category {
  id: string;
  name: string;
  description: string | null;
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
  const [form, setForm] = useState({ name: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const resetForm = () => {
    setShowForm(false);
    setEditingCategory(null);
    setForm({ name: '', description: '' });
  };

  const filteredCategories = useMemo(() => {
    const sorted = [...categories].sort((a, b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    if (!searchQuery.trim()) return sorted;
    const query = searchQuery.toLowerCase();
    return sorted.filter(cat => 
      cat.name.toLowerCase().includes(query) || 
      cat.description?.toLowerCase().includes(query)
    );
  }, [categories, searchQuery]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingCategory) {
        const { error } = await supabase
          .from('categories')
          .update({ name: form.name.trim(), description: form.description.trim() || null })
          .eq('id', editingCategory.id);
        if (error) throw error;
        toast({ title: t('catalog.category_updated') });
      } else {
        const { error } = await supabase
          .from('categories')
          .insert({ name: form.name.trim(), description: form.description.trim() || null });
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
    setForm({ name: category.name, description: category.description || '' });
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
            <div>
              <Label htmlFor="category-name">{t('catalog.category_name')} *</Label>
              <Input
                id="category-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="category-description">{t('catalog.description')}</Label>
              <Input
                id="category-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder={t('catalog.optional_desc')}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={resetForm}>{t('common.cancel')}</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
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
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">{category.name}</span>
                          <Badge variant="secondary" className="shrink-0">
                            {category.product_count || 0} {t('catalog.products_label')}
                          </Badge>
                        </div>
                        {category.description && (
                          <p className="text-sm text-muted-foreground truncate">{category.description}</p>
                        )}
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
