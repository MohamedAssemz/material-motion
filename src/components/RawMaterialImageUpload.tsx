import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ImagePlus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface RawMaterialImageUploadProps {
  images: string[];
  onChange: (images: string[]) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function RawMaterialImageUpload({
  images,
  onChange,
  disabled = false,
  compact = false,
}: RawMaterialImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploading(true);
    const newUrls: string[] = [];

    try {
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} is not an image`);
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`${file.name} exceeds 5MB limit`);
          continue;
        }

        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(7);
        const ext = file.name.split(".").pop();
        const fileName = `rm/${timestamp}-${randomStr}.${ext}`;

        const { data, error } = await supabase.storage
          .from("raw-material-images")
          .upload(fileName, file, { cacheControl: "3600", upsert: false });

        if (error) {
          toast.error(`Upload failed: ${error.message}`);
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("raw-material-images").getPublicUrl(data.path);

        newUrls.push(publicUrl);
      }

      if (newUrls.length > 0) {
        onChange([...images, ...newUrls]);
        toast.success(`${newUrls.length} image(s) uploaded`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className={cn("grid gap-2", compact ? "grid-cols-4" : "grid-cols-3")}>
          {images.map((url, index) => (
            <div key={index} className="relative group rounded-md overflow-hidden border">
              <img
                src={url}
                alt={`Raw material ${index + 1}`}
                className={cn("w-full object-cover", compact ? "h-16" : "h-24")}
              />
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!disabled && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <ImagePlus className="h-4 w-4 mr-1" />
            )}
            {uploading ? "Uploading..." : "Add Images"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </>
      )}
    </div>
  );
}
