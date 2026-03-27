"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ProductImage } from "@/types";

interface ImageGalleryProps {
  productId: number;
  images: ProductImage[];
}

export function ImageGallery({ productId, images }: ImageGalleryProps) {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [imageType, setImageType] = useState<string>("hero");

  const handleUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("file", file);
      form.append("image_type", imageType);
      form.append("sort_order", String(images.length));

      await fetch(`/api/products/${productId}/images`, {
        method: "POST",
        body: form,
      });
    }

    setUploading(false);
    router.refresh();
  }, [productId, imageType, images.length, router]);

  function handleImageTypeChange(value: string | null) {
    if (value) setImageType(value);
  }

  async function handleDelete(imageId: number) {
    await fetch(`/api/products/${productId}/images/${imageId}`, { method: "DELETE" });
    router.refresh();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    handleUpload(e.dataTransfer.files);
  }

  return (
    <div>
      {images.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {images.map((img) => (
            <div key={img.id} className="relative group border rounded-lg overflow-hidden">
              <img
                src={`/api/images/${img.file_path}`}
                alt=""
                className="w-full h-32 object-cover"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button size="sm" variant="destructive" onClick={() => handleDelete(img.id)}>
                  Remove
                </Button>
              </div>
              {img.image_type && (
                <span className="absolute top-1 left-1 text-xs bg-black/60 text-white px-1.5 py-0.5 rounded">
                  {img.image_type}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary/50 transition-colors"
      >
        <p className="text-muted-foreground mb-2">
          {uploading ? "Uploading..." : "Drag & drop images here, or click to browse"}
        </p>
        <div className="flex items-center justify-center gap-2">
          <Select value={imageType} onValueChange={handleImageTypeChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="hero">Hero</SelectItem>
              <SelectItem value="pack">Pack</SelectItem>
              <SelectItem value="lifestyle">Lifestyle</SelectItem>
              <SelectItem value="nutritional">Nutritional</SelectItem>
            </SelectContent>
          </Select>
          <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium transition-colors hover:bg-muted hover:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50">
            Browse Files
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
