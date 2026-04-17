"use client"

import { useState, useRef } from "react"
import { Upload, X, ImageIcon, Loader2 } from "lucide-react"
import Image from "next/image"
import { cn } from "@/lib/utils"

interface ImageUploadProps {
  value?: string
  onChange: (file: File) => Promise<void>
  onRemove?: () => void
  disabled?: boolean
  label?: string
  description?: string
  aspectRatio?: "square" | "video"
  className?: string
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  disabled,
  label,
  description,
  aspectRatio = "square",
  className
}: ImageUploadProps) {
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<string | null>(value || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Create local preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPreview(reader.result as string)
    }
    reader.readAsDataURL(file)

    setLoading(true)
    try {
      await onChange(file)
    } catch (error) {
      console.error("Upload failed:", error)
      setPreview(value || null) // Revert if failed
    } finally {
      setLoading(false)
    }
  }

  const triggerInput = () => {
    fileInputRef.current?.click()
  }

  return (
    <div className={cn("space-y-4 w-full", className)}>
      {label && <label className="block text-sm font-medium text-foreground mb-1">{label}</label>}
      <div 
        onClick={!disabled && !loading ? triggerInput : undefined}
        className={cn(
          "relative group cursor-pointer border-2 border-dashed border-border-solid rounded-2xl overflow-hidden transition-all hover:border-brand/50 bg-surface-elevated",
          aspectRatio === "square" ? "aspect-square" : "aspect-video",
          disabled && "opacity-50 cursor-not-allowed",
          loading && "cursor-wait"
        )}
      >
        {preview ? (
          <>
            <Image
              src={preview}
              alt="Preview"
              fill
              className={cn(
                "object-cover transition-all",
                loading && "opacity-40 grayscale"
              )}
            />
            {!loading && !disabled && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                <p className="text-white text-sm font-bold flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Change
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <div className="w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6 text-brand" />
            </div>
            <p className="text-sm font-bold text-foreground">Upload Image</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-[2px]">
            <Loader2 className="w-8 h-8 text-brand animate-spin" />
          </div>
        )}
        
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
          disabled={disabled || loading}
        />
      </div>
    </div>
  )
}
