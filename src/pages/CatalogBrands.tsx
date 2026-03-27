import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Loader2, Tag, Upload, X } from 'lucide-react';
import { format } from 'date-fns';

interface Brand {
  id: string;
  name_en: string;
  name_ar: string | null;
  description: string | null;
  logo_url: string | null;
  created_at: string;
  product_count?: number;
}

export default function CatalogBrands() {
  const { hasRole } = useAuth();
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState<Brand | null>(null);
  const [deletingBrand, setDeletingBrand] = useState<Brand | null>(null);
  const [formData, setFormData] = useState({ name_en: '', name_ar: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canManage = hasRole('admin');

  useEffect(() => {
    fetchBrands();
  }, []);

  const fetchBrands = async () => {
    try {
      const { data: brandsData, error } = await supabase
        .from('brands')
        .select('id, name_en, name_ar, description, logo_url, created_at')
        .order('name_en');

      if (error) throw error;

      const { data: countData } = await supabase
        .from('products')
        .select('brand_id')
        .not('brand_id', 'is', null);

      const countByBrand: Record<string, number> = {};
      countData?.forEach(p => {
        if (p.brand_id) {
          countByBrand[p.brand_id] = (countByBrand[p.brand_id] || 0) + 1;
        }
      });

      const brandsWithCount = (brandsData || []).map(brand => ({
        ...brand,
        product_count: countByBrand[brand.id] || 0,
      }));

      setBrands(brandsWithCount);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Invalid file', description: 'Please select an image file', variant: 'destructive' });
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name_en.trim()) {
      toast({ title: 'Validation Error', description: 'English name is required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const imageUrl = await uploadImage();
      if (editingBrand) {
        const { error } = await supabase
          .from('brands')
          .update({
            name_en: formData.name_en.trim(),
            name_ar: formData.name_ar.trim() || null,
            description: formData.description.trim() || null,
            logo_url: imageUrl,
          })
          .eq('id', editingBrand.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Brand updated successfully' });
      } else {
        const { error } = await supabase
          .from('brands')
          .insert({
            name_en: formData.name_en.trim(),
            name_ar: formData.name_ar.trim() || null,
            description: formData.description.trim() || null,
            logo_url: imageUrl,
          });
        if (error) throw error;
        toast({ title: 'Success', description: 'Brand created successfully' });
      }
      setDialogOpen(false);
      resetForm();
      fetchBrands();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingBrand) return;
    try {
      const { error } = await supabase.from('brands').delete().eq('id', deletingBrand.id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Brand deleted successfully' });
      fetchBrands();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } finally {
      setDeleteDialogOpen(false);
      setDeletingBrand(null);
    }
  };

  const resetForm = () => {
    setFormData({ name_en: '', name_ar: '', description: '' });
    setEditingBrand(null);
    setImageFile(null);
    setImagePreview(null);
  };

  const openEditDialog = (brand: Brand) => {
    setEditingBrand(brand);
    setFormData({
      name_en: brand.name_en,
      name_ar: brand.name_ar || '',
      description: brand.description || '',
    });
    setImagePreview(brand.logo_url || null);
    setImageFile(null);
    setDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6 text-primary" />
            Brands
          </h1>
          <p className="text-muted-foreground">Manage product brands</p>
        </div>
        
        {canManage && (
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Add Brand
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingBrand ? 'Edit Brand' : 'Add New Brand'}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name_en">English Name *</Label>
                    <Input
                      id="name_en"
                      value={formData.name_en}
                      onChange={(e) => setFormData(prev => ({ ...prev, name_en: e.target.value }))}
                      placeholder="Brand name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="name_ar">Arabic Name</Label>
                    <Input
                      id="name_ar"
                      value={formData.name_ar}
                      onChange={(e) => setFormData(prev => ({ ...prev, name_ar: e.target.value }))}
                      placeholder="اسم العلامة التجارية"
                      dir="rtl"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Image</Label>
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
                      <Upload className="mr-2 h-4 w-4" />
                      Upload Image
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={saving || uploading}>
                    {(saving || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingBrand ? 'Update' : 'Create'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => {
                    setDialogOpen(false);
                    resetForm();
                  }}>
                    Cancel
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[60px]">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-center">Products</TableHead>
                <TableHead>Created</TableHead>
                {canManage && <TableHead className="w-[100px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {brands.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canManage ? 6 : 5} className="text-center text-muted-foreground py-12">
                    No brands yet
                  </TableCell>
                </TableRow>
              ) : (
                brands.map((brand) => (
                  <TableRow key={brand.id}>
                    <TableCell>
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={brand.logo_url || undefined} alt={brand.name_en} />
                        <AvatarFallback className="text-xs">
                          {brand.name_en.substring(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      {brand.name_en}{brand.name_ar ? ` - ${brand.name_ar}` : ''}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {brand.description || '-'}
                    </TableCell>
                    <TableCell className="text-center">{brand.product_count}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(brand.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    {canManage && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(brand)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setDeletingBrand(brand);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Brand?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingBrand?.name_en}"? 
              Products using this brand will have their brand cleared. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
