import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AspectRatio } from '@/components/ui/aspect-ratio';
import { Upload, X, Star, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ProductImage {
  id?: string;
  image_url: string;
  is_main: boolean;
  sort_order: number;
  file?: File; // For new uploads before saving
}

interface ProductImageUploadProps {
  images: ProductImage[];
  onChange: (images: ProductImage[]) => void;
  productId?: string; // If editing existing product
  disabled?: boolean;
}

export function ProductImageUpload({ 
  images, 
  onChange,
  productId,
  disabled = false 
}: ProductImageUploadProps) {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    
    try {
      const newImages: ProductImage[] = [];
      
      for (const file of files) {
        // Validate file type
        if (!file.type.startsWith('image/')) {
          toast({
            title: 'Invalid file type',
            description: `${file.name} is not an image`,
            variant: 'destructive',
          });
          continue;
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          toast({
            title: 'File too large',
            description: `${file.name} exceeds 5MB limit`,
            variant: 'destructive',
          });
          continue;
        }

        // Generate unique filename
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const ext = file.name.split('.').pop();
        const fileName = `${productId || 'temp'}/${timestamp}-${randomStr}.${ext}`;

        // Upload to Supabase Storage
        const { data, error } = await supabase.storage
          .from('product-images')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (error) {
          console.error('Upload error:', error);
          toast({
            title: 'Upload failed',
            description: error.message,
            variant: 'destructive',
          });
          continue;
        }

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('product-images')
          .getPublicUrl(data.path);

        newImages.push({
          image_url: publicUrl,
          is_main: images.length === 0 && newImages.length === 0, // First image is main
          sort_order: images.length + newImages.length,
        });
      }

      onChange([...images, ...newImages]);
      
      if (newImages.length > 0) {
        toast({
          title: 'Images uploaded',
          description: `${newImages.length} image(s) uploaded successfully`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Upload error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemove = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    // If we removed the main image, set the first remaining as main
    if (images[index].is_main && newImages.length > 0) {
      newImages[0].is_main = true;
    }
    onChange(newImages);
  };

  const handleSetMain = (index: number) => {
    const newImages = images.map((img, i) => ({
      ...img,
      is_main: i === index,
    }));
    onChange(newImages);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {images.map((image, index) => (
          <Card key={image.id || index} className="relative overflow-hidden group">
            <AspectRatio ratio={1}>
              <img 
                src={image.image_url} 
                alt={`Product image ${index + 1}`}
                className="h-full w-full object-cover"
              />
            </AspectRatio>
            
            {/* Main badge */}
            {image.is_main && (
              <div className="absolute top-2 left-2">
                <span className="bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Star className="h-3 w-3" fill="currentColor" />
                  Main
                </span>
              </div>
            )}
            
            {/* Actions overlay */}
            {!disabled && (
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                {!image.is_main && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSetMain(index)}
                  >
                    <Star className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRemove(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        ))}
        
        {/* Upload button */}
        {!disabled && (
          <Card 
            className={cn(
              "relative overflow-hidden cursor-pointer border-dashed hover:border-primary transition-colors",
              uploading && "pointer-events-none opacity-50"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <AspectRatio ratio={1}>
              <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                {uploading ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-8 w-8" />
                    <span className="text-xs">Upload</span>
                  </>
                )}
              </div>
            </AspectRatio>
          </Card>
        )}
      </div>
      
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />
      
      {images.length === 0 && (
        <p className="text-xs text-muted-foreground text-center">
          <ImageIcon className="h-4 w-4 inline-block mr-1" />
          Upload product images. First image will be set as main.
        </p>
      )}
    </div>
  );
}
