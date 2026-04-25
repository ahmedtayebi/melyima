'use client'

import { useRef, useState } from 'react'
import { Star, Check, Camera, X, Loader2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'

const MAX_IMAGES = 3
const MAX_BYTES  = 5 * 1024 * 1024
const ACCEPTED   = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

type ImageEntry = {
  preview: string
  file:    File
  url:     string | null
  progress: 'idle' | 'uploading' | 'done' | 'error'
}

export default function ReviewForm() {
  const [formData, setFormData] = useState({
    customer_name: '',
    rating: 0,
    comment: '',
  })
  const [hoveredRating, setHoveredRating] = useState(0)
  const [errors, setErrors]       = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted]   = useState(false)
  const [images, setImages]         = useState<ImageEntry[]>([])
  const [lightbox, setLightbox]     = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const validate = () => {
    const next: Record<string, string> = {}
    if (!formData.customer_name.trim()) next.customer_name = 'الاسم مطلوب'
    if (!formData.rating) next.rating = 'يرجى اختيار تقييم'
    if (!formData.comment.trim()) next.comment = 'الرأي مطلوب'
    else if (formData.comment.trim().length < 10) next.comment = 'الرأي قصير جداً'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const pickFiles = (files: FileList | null) => {
    if (!files) return
    const remaining = MAX_IMAGES - images.length
    const toAdd = Array.from(files).slice(0, remaining)
    const next: ImageEntry[] = toAdd
      .filter(f => ACCEPTED.includes(f.type) && f.size <= MAX_BYTES)
      .map(f => ({ file: f, preview: URL.createObjectURL(f), url: null, progress: 'idle' }))
    setImages(prev => [...prev, ...next])
  }

  const removeImage = (idx: number) => {
    setImages(prev => {
      URL.revokeObjectURL(prev[idx].preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const uploadAll = async (): Promise<string[]> => {
    const supabase = createClient()
    const results: string[] = []

    for (let i = 0; i < images.length; i++) {
      const entry = images[i]
      if (entry.progress === 'done' && entry.url) { results.push(entry.url); continue }

      setImages(prev => prev.map((e, idx) => idx === i ? { ...e, progress: 'uploading' } : e))

      const ext  = entry.file.name.split('.').pop() ?? 'jpg'
      const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

      const { error } = await supabase.storage
        .from('review-images')
        .upload(path, entry.file, { contentType: entry.file.type })

      if (error) {
        console.error('Storage upload error:', error)
        setImages(prev => prev.map((e, idx) => idx === i ? { ...e, progress: 'error' } : e))
        continue
      }

      const { data } = supabase.storage.from('review-images').getPublicUrl(path)
      setImages(prev => prev.map((e, idx) => idx === i ? { ...e, progress: 'done', url: data.publicUrl } : e))
      results.push(data.publicUrl)
    }

    return results
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const uploadedUrls = images.length > 0 ? await uploadAll() : []

      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, images: uploadedUrls }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.error)
      setSubmitted(true)
    } catch {
      setErrors({ submit: 'حدث خطأ، حاولي مجدداً' })
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <Check size={28} className="text-green-600" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-heading font-black text-lg text-brand mb-1">
            شكراً على رأيك!
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

        {/* Name */}
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            الاسم
          </label>
          <input
            value={formData.customer_name}
            onChange={e => setFormData(d => ({ ...d, customer_name: e.target.value }))}
            placeholder="فاطمة بن علي"
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 text-right"
          />
          {errors.customer_name && (
            <p className="text-xs text-red-500 mt-1 text-right">{errors.customer_name}</p>
          )}
        </div>

        {/* Rating stars */}
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            التقييم
          </label>
          <div className="flex flex-row-reverse gap-1">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                onClick={() => setFormData(d => ({ ...d, rating: star }))}
                onMouseEnter={() => setHoveredRating(star)}
                onMouseLeave={() => setHoveredRating(0)}
                className="transition-transform duration-100 hover:scale-110"
              >
                <Star
                  size={32}
                  fill={(hoveredRating || formData.rating) >= star ? '#B8872E' : 'none'}
                  stroke={(hoveredRating || formData.rating) >= star ? '#B8872E' : '#E8DDD0'}
                  strokeWidth={1.5}
                />
              </button>
            ))}
          </div>
          {errors.rating && (
            <p className="text-xs text-red-500 mt-1 text-right">{errors.rating}</p>
          )}
        </div>

        {/* Comment */}
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            رأيك
          </label>
          <textarea
            value={formData.comment}
            onChange={e => setFormData(d => ({ ...d, comment: e.target.value }))}
            placeholder="شاركينا تجربتك مع MELY•IMA..."
            rows={4}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 text-right resize-none"
          />
          {errors.comment && (
            <p className="text-xs text-red-500 mt-1 text-right">{errors.comment}</p>
          )}
        </div>

        {/* Image upload */}
        <div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            multiple
            className="hidden"
            onChange={e => pickFiles(e.target.files)}
            onClick={e => { (e.target as HTMLInputElement).value = '' }}
          />

          {images.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-border bg-white hover:border-brand/40 hover:bg-brand/[0.02] transition-all duration-200 group"
            >
              <div className="w-10 h-10 rounded-full bg-surface flex items-center justify-center group-hover:scale-105 transition-transform duration-200">
                <Camera size={18} className="text-muted" />
              </div>
              <div className="text-center">
                <p className="font-heading font-bold text-sm text-brand">أضيفي صور المنتج (اختياري)</p>
                <p className="font-body text-xs text-muted mt-0.5">
                  حتى {MAX_IMAGES} صور · JPG, PNG, WEBP · 5MB كحد أقصى
                </p>
              </div>
            </button>
          )}

          {images.length > 0 && (
            <div className="flex gap-3 flex-wrap mt-3">
              {images.map((img, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border border-border group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.preview}
                    alt=""
                    className="w-full h-full object-cover cursor-pointer"
                    onClick={() => setLightbox(img.preview)}
                  />

                  {/* Progress overlay */}
                  {img.progress === 'uploading' && (
                    <div className="absolute inset-0 bg-brand/50 flex items-center justify-center">
                      <Loader2 size={20} className="text-white animate-spin" />
                    </div>
                  )}
                  {img.progress === 'done' && (
                    <div className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                      <Check size={11} className="text-white" strokeWidth={3} />
                    </div>
                  )}
                  {img.progress === 'error' && (
                    <div className="absolute inset-0 bg-brand/60 flex items-center justify-center">
                      <p className="text-white text-[10px] font-bold px-1 text-center">فشل</p>
                    </div>
                  )}

                  {/* Remove button */}
                  {img.progress !== 'uploading' && (
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 left-1 w-5 h-5 rounded-full bg-brand/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-brand"
                    >
                      <X size={10} className="text-white" strokeWidth={3} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {errors.submit && (
          <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-right">
            {errors.submit}
          </p>
        )}

        <Button type="submit" fullWidth size="lg" loading={submitting} disabled={submitting}>
          {submitting ? 'جارٍ الإرسال...' : 'إرسال التقييم'}
        </Button>

      </form>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-w-full max-h-full rounded-xl object-contain shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X size={18} className="text-white" />
          </button>
        </div>
      )}
    </>
  )
}
