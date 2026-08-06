'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, GripVertical, Eye, EyeOff, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import type { Product, ProductVariant } from '@/lib/types'

// ── Local state types ──────────────────────────────────────────────────────────

interface ImageEntry {
  id?: string        // existing DB id (undefined for new)
  file?: File        // only for new uploads
  preview: string    // objectURL or existing URL
  existing: boolean
  sort_order: number
  toDelete?: boolean
}

interface ColorEntry {
  id: string
  isNew: boolean
  name: string
  hex_code: string
  image_url: string | null   // backward compat — set to first image URL on save
  is_visible: boolean
  toDelete?: boolean
  images: ImageEntry[]
}

interface SizeEntry {
  id: string
  isNew: boolean
  label: string
  is_visible: boolean
  sort_order: number
  toDelete?: boolean
}

// ── Quick-add size presets ─────────────────────────────────────────────────────

const SIZE_PRESETS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']

// ── Helpers ────────────────────────────────────────────────────────────────────

function tempId() {
  return `new_${Math.random().toString(36).slice(2)}`
}

function stockKey(colorId: string, sizeId: string) {
  return `${colorId}:${sizeId}`
}

function buildInitialColors(product?: Product): ColorEntry[] {
  if (!product?.product_colors?.length) return []
  return product.product_colors.map(c => ({
    id: c.id,
    isNew: false,
    name: c.name,
    hex_code: c.hex_code,
    image_url: c.image_url,
    is_visible: c.is_visible,
    images: (c.images ?? []).map(img => ({
      id: img.id,
      preview: img.image_url,
      existing: true,
      sort_order: img.sort_order,
    })),
  }))
}

function buildInitialSizes(product?: Product): SizeEntry[] {
  if (!product?.product_sizes?.length) return []
  return [...product.product_sizes]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => ({
      id: s.id,
      isNew: false,
      label: s.label,
      is_visible: s.is_visible,
      sort_order: s.sort_order,
    }))
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  productId: string
  initialData?: Product
  categories?: { id: string; name: string }[]
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function ProductForm({ productId, initialData, categories = [] }: Props) {
  const router = useRouter()
  const isEdit = !!initialData

  const [name, setName] = useState(initialData?.name ?? '')
  const [description, setDescription] = useState(initialData?.description ?? '')
  const hasInitialDiscount = Boolean(
    initialData?.original_price &&
    initialData.original_price > 0 &&
    initialData.original_price > initialData.price
  )
  const [originalPrice, setOriginalPrice] = useState<string>(
    initialData
      ? String(hasInitialDiscount ? initialData.original_price : initialData.price)
      : ''
  )
  const [price, setPrice] = useState<string>(
    initialData && hasInitialDiscount ? String(initialData.price) : ''
  )
  const [isVisible, setIsVisible] = useState(initialData?.is_visible ?? true)
  const [categoryId, setCategoryId] = useState<string>(initialData?.category_id ?? '')
  const [colors, setColors] = useState<ColorEntry[]>(buildInitialColors(initialData))
  const [sizes, setSizes] = useState<SizeEntry[]>(buildInitialSizes(initialData))
  const [customSize, setCustomSize] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [variantStocks, setVariantStocks] = useState<Record<string, string>>({})
  const [variantStockTouched, setVariantStockTouched] = useState(false)

  // Drag state for size reorder
  const dragSizeIndex = useRef<number | null>(null)

  useEffect(() => {
    let ignore = false

    async function loadVariants() {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('product_variants')
        .select('id, product_id, color_id, size_id, stock')
        .eq('product_id', productId)

      if (ignore || error || !data) return

      const next = Object.fromEntries(
        (data as ProductVariant[]).map(variant => [
          stockKey(variant.color_id, variant.size_id),
          String(Math.max(0, variant.stock ?? 0)),
        ])
      )
      setVariantStocks(next)
    }

    loadVariants()
    return () => { ignore = true }
  }, [productId])

  // ── Color helpers ────────────────────────────────────────────────────────────

  const addColor = () => {
    setColors(prev => [...prev, {
      id: tempId(),
      isNew: true,
      name: '',
      hex_code: '#000000',
      image_url: null,
      is_visible: true,
      images: [],
    }])
  }

  const updateColor = (id: string, patch: Partial<ColorEntry>) => {
    setColors(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c))
  }

  const removeColor = (id: string) => {
    setColors(prev => prev.map(c =>
      c.id === id ? (c.isNew ? null! : { ...c, toDelete: true }) : c
    ).filter(Boolean))
  }

  const addImagesToColor = useCallback((colorId: string, files: FileList) => {
    setColors(prev => prev.map(c => {
      if (c.id !== colorId) return c
      const existingActive = c.images.filter(i => !i.toDelete)
      const newImages: ImageEntry[] = Array.from(files).map((file, i) => ({
        file,
        preview: URL.createObjectURL(file),
        existing: false,
        sort_order: existingActive.length + i,
      }))
      return { ...c, images: [...c.images, ...newImages] }
    }))
  }, [])

  const removeImageFromColor = useCallback((colorId: string, imgIdx: number) => {
    setColors(prev => prev.map(c => {
      if (c.id !== colorId) return c
      const active = c.images.filter(i => !i.toDelete)
      const target = active[imgIdx]
      if (!target) return c
      const images = c.images.map(img => {
        if (img !== target) return img
        return img.existing ? { ...img, toDelete: true } : null!
      }).filter(Boolean)
      // Re-number sort_order
      const reNumbered = images.map((img) => img.toDelete ? img : { ...img, sort_order: images.filter(x => !x.toDelete).indexOf(img) })
      return { ...c, images: reNumbered }
    }))
  }, [])

  const reorderColorImages = useCallback((colorId: string, fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return
    setColors(prev => prev.map(c => {
      if (c.id !== colorId) return c
      const active = c.images.filter(i => !i.toDelete)
      const deleted = c.images.filter(i => i.toDelete)
      const reordered = [...active]
      const [moved] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, moved)
      const withOrder = reordered.map((img, i) => ({ ...img, sort_order: i }))
      return { ...c, images: [...withOrder, ...deleted] }
    }))
  }, [])

  // ── Size helpers ─────────────────────────────────────────────────────────────

  const addSize = (label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    if (sizes.some(s => !s.toDelete && s.label === trimmed)) return
    setSizes(prev => [...prev, {
      id: tempId(),
      isNew: true,
      label: trimmed,
      is_visible: true,
      sort_order: prev.filter(s => !s.toDelete).length,
    }])
  }

  const removeSize = (id: string) => {
    setSizes(prev => prev.map(s =>
      s.id === id ? (s.isNew ? null! : { ...s, toDelete: true }) : s
    ).filter(Boolean))
  }

  const updateSize = (id: string, patch: Partial<SizeEntry>) => {
    setSizes(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  const updateVariantStock = (colorId: string, sizeId: string, value: string) => {
    setVariantStockTouched(true)
    setVariantStocks(prev => {
      const key = stockKey(colorId, sizeId)
      if (value === '') {
        const rest = { ...prev }
        delete rest[key]
        return rest
      }
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) return prev
      return { ...prev, [key]: String(Math.max(0, Math.floor(parsed))) }
    })
  }

  // ── Drag-to-reorder sizes ────────────────────────────────────────────────────

  const visibleSizes = sizes.filter(s => !s.toDelete)

  const onSizeDragStart = (idx: number) => { dragSizeIndex.current = idx }

  const onSizeDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    const from = dragSizeIndex.current
    if (from === null || from === idx) return
    setSizes(prev => {
      const visible = prev.filter(s => !s.toDelete)
      const deleted = prev.filter(s => s.toDelete)
      const reordered = [...visible]
      const [moved] = reordered.splice(from, 1)
      reordered.splice(idx, 0, moved)
      const withOrder = reordered.map((s, i) => ({ ...s, sort_order: i }))
      dragSizeIndex.current = idx
      return [...withOrder, ...deleted]
    })
  }

  // ── Save ─────────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setError('')
    if (!name.trim()) { setError('يرجى إدخال اسم المنتج'); return }
    const originalPriceNum = Number(originalPrice)
    const hasDiscountPrice = price.trim() !== ''
    const discountPriceNum = hasDiscountPrice ? Number(price) : originalPriceNum

    if (originalPrice === '' || isNaN(originalPriceNum) || originalPriceNum <= 0) {
      setError('يرجى إدخال السعر الأصلي')
      return
    }
    if (hasDiscountPrice && (isNaN(discountPriceNum) || discountPriceNum <= 0)) {
      setError('يرجى إدخال سعر مخفض صحيح')
      return
    }
    if (discountPriceNum > originalPriceNum) {
      setError('السعر المخفض يجب أن يكون أقل من السعر الأصلي')
      return
    }

    const savedPrice = discountPriceNum
    const savedOriginalPrice = discountPriceNum < originalPriceNum ? originalPriceNum : 0

    const activeColors = colors.filter(c => !c.toDelete)
    if (activeColors.length === 0) { setError('يرجى إضافة لون واحد على الأقل'); return }
    if (activeColors.some(c => !c.name.trim())) { setError('يرجى إدخال اسم لكل لون'); return }

    setSaving(true)
    try {
      const supabase = createClient()

      // 1. Upsert product
      const { error: productError } = await supabase
        .from('products')
        .upsert({
          id: productId,
          name: name.trim(),
          price: savedPrice,
          original_price: savedOriginalPrice,
          description: description.trim() || null,
          is_visible: isVisible,
          category_id: categoryId || null,
        })
      if (productError) throw new Error(productError.message)

      // 2. Process colors
      const activeColorIds: { sourceId: string; actualId: string }[] = []
      for (const color of colors) {
        if (color.toDelete) {
          // Delete all color images first
          await supabase.from('product_color_images').delete().eq('color_id', color.id)
          await supabase.from('product_variants').delete().eq('color_id', color.id)
          await supabase.from('product_colors').delete().eq('id', color.id)
          continue
        }

        let actualColorId = color.id

        if (color.isNew) {
          const { data: insertedColor, error: insertError } = await supabase
            .from('product_colors')
            .insert({
              product_id: productId,
              name: color.name.trim(),
              hex_code: color.hex_code,
              image_url: null,
              is_visible: color.is_visible,
            })
            .select('id')
            .single()
          if (insertError) throw new Error(insertError.message)
          actualColorId = insertedColor!.id
        } else {
          const { error: updateError } = await supabase
            .from('product_colors')
            .update({
              name: color.name.trim(),
              hex_code: color.hex_code,
              is_visible: color.is_visible,
            })
            .eq('id', color.id)
          if (updateError) throw new Error(updateError.message)
        }

        activeColorIds.push({ sourceId: color.id, actualId: actualColorId })

        // 3. Process images for this color
        const finalUrls: { url: string; sort_order: number }[] = []

        for (const img of color.images) {
          if (img.toDelete) {
            if (img.id) {
              await supabase.from('product_color_images').delete().eq('id', img.id)
            }
            continue
          }

          if (img.existing) {
            if (img.id) {
              await supabase
                .from('product_color_images')
                .update({ sort_order: img.sort_order })
                .eq('id', img.id)
            }
            finalUrls.push({ url: img.preview, sort_order: img.sort_order })
          } else if (img.file) {
            const timestamp = Date.now() + Math.random()
            const path = `${productId}/${actualColorId}/${timestamp}.webp`
            const { error: uploadError } = await supabase.storage
              .from('product-images')
              .upload(path, img.file, { upsert: true, contentType: 'image/webp' })
            if (!uploadError) {
              const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(path)
              await supabase.from('product_color_images').insert({
                color_id: actualColorId,
                image_url: publicUrl,
                sort_order: img.sort_order,
              })
              finalUrls.push({ url: publicUrl, sort_order: img.sort_order })
            }
          }
        }

        // 4. Update image_url to first image for backward compat
        const sorted = finalUrls.sort((a, b) => a.sort_order - b.sort_order)
        await supabase
          .from('product_colors')
          .update({ image_url: sorted[0]?.url ?? null })
          .eq('id', actualColorId)
      }

      // 5. Process sizes
      const activeSizeIds: { sourceId: string; actualId: string }[] = []
      for (const size of sizes) {
        if (size.toDelete) {
          await supabase.from('product_variants').delete().eq('size_id', size.id)
          await supabase.from('product_sizes').delete().eq('id', size.id)
          continue
        }
        if (size.isNew) {
          const { data: insertedSize, error: sizeInsertError } = await supabase.from('product_sizes').insert({
            product_id: productId,
            label: size.label,
            is_visible: size.is_visible,
            sort_order: size.sort_order,
          }).select('id').single()
          if (sizeInsertError) throw new Error(sizeInsertError.message)
          activeSizeIds.push({ sourceId: size.id, actualId: insertedSize!.id })
        } else {
          const { error: sizeUpdateError } = await supabase.from('product_sizes').update({
            label: size.label,
            is_visible: size.is_visible,
            sort_order: size.sort_order,
          }).eq('id', size.id)
          if (sizeUpdateError) throw new Error(sizeUpdateError.message)
          activeSizeIds.push({ sourceId: size.id, actualId: size.id })
        }
      }

      // 6. Process stock variants. Empty untouched grids keep backward-compatible unlimited stock.
      const shouldSaveVariants = variantStockTouched || Object.keys(variantStocks).length > 0
      if (shouldSaveVariants && activeColorIds.length > 0 && activeSizeIds.length > 0) {
        const variantRows = activeColorIds.flatMap(color =>
          activeSizeIds.map(size => {
            const sourceValue = variantStocks[stockKey(color.sourceId, size.sourceId)]
            const actualValue = variantStocks[stockKey(color.actualId, size.actualId)]
            return {
              product_id: productId,
              color_id: color.actualId,
              size_id: size.actualId,
              stock: Math.max(0, Number(sourceValue ?? actualValue ?? 0)),
            }
          })
        )

        const { error: variantError } = await supabase
          .from('product_variants')
          .upsert(variantRows, { onConflict: 'color_id,size_id' })

        if (variantError) throw new Error(variantError.message)
      }

      router.push('/admin/products')
      router.refresh()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'حدث خطأ، يرجى المحاولة مجدداً')
    } finally {
      setSaving(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl space-y-8">

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="font-heading font-black text-2xl text-brand">
          {isEdit ? 'تعديل المنتج' : 'إضافة منتج'}
        </h1>
        <button
          onClick={() => router.back()}
          className="text-sm font-heading font-bold text-muted hover:text-brand transition-colors"
        >
          رجوع
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-body rounded-xl px-4 py-3">
          {error}
        </div>
      )}

      {/* Product name */}
      <section className="bg-white rounded-xl border border-border p-5 space-y-4">
        <h2 className="font-heading font-bold text-base text-brand">اسم المنتج</h2>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="مثال: عباية سوداء فاخرة"
          className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 font-body"
        />
      </section>

      {/* Description */}
      <section className="bg-white rounded-xl border border-border p-5 space-y-4">
        <h2 className="font-heading font-bold text-base text-brand">وصف المنتج</h2>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="اكتبي تفاصيل المنتج، المقاس، القماش، المميزات..."
          rows={4}
          className="w-full border border-border rounded-xl px-4 py-3 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 font-body text-right resize-none"
        />
      </section>

      {/* Price */}
      <section className="bg-white rounded-xl border border-border p-5 space-y-4">
        <h2 className="font-heading font-bold text-base text-brand">أسعار المنتج بالدينار الجزائري</h2>
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            السعر الأصلي
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={originalPrice}
            onChange={e => setOriginalPrice(e.target.value)}
            placeholder="مثال: 7000"
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 font-body"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            السعر المخفض <span className="text-muted font-body font-normal">(اختياري)</span>
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="مثال: 5500"
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 font-body"
            dir="ltr"
          />
          {Number(originalPrice) > 0 && Number(price) > 0 && Number(originalPrice) > Number(price) && (
            <p className="text-xs text-green-600 mt-1 text-right font-body">
              نسبة التخفيض: {Math.round(((Number(originalPrice) - Number(price)) / Number(originalPrice)) * 100)}%
            </p>
          )}
        </div>
      </section>

      {/* Category */}
      {categories.length > 0 && (
        <section className="bg-white rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-heading font-bold text-base text-brand">التصنيف</h2>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full border border-border rounded-xl px-4 py-2.5 text-sm text-brand focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 font-body bg-white"
          >
            <option value="">بدون تصنيف</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </section>
      )}

      {/* Visibility */}
      <section className="bg-white rounded-xl border border-border p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-heading font-bold text-base text-brand">ظهور المنتج</p>
            <p className="text-xs text-muted font-body mt-0.5">
              {isVisible ? 'المنتج ظاهر للزبائن' : 'المنتج مخفي عن الزبائن'}
            </p>
          </div>
          <button
            onClick={() => setIsVisible(v => !v)}
            className={cn(
              'flex items-center gap-1.5 text-sm font-heading font-bold px-4 py-2 rounded-full border transition-colors',
              isVisible
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'border-border text-muted hover:border-brand hover:text-brand'
            )}
          >
            {isVisible ? <Eye size={15} /> : <EyeOff size={15} />}
            {isVisible ? 'ظاهر' : 'مخفي'}
          </button>
        </div>
      </section>

      {/* Colors */}
      <section className="bg-white rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading font-bold text-base text-brand">الألوان</h2>
          <button
            onClick={addColor}
            className="flex items-center gap-1 text-xs font-heading font-bold text-accent hover:text-accent/80 transition-colors"
          >
            <Plus size={14} />
            إضافة لون
          </button>
        </div>

        {colors.filter(c => !c.toDelete).length === 0 && (
          <p className="text-sm text-muted font-body text-center py-4">
            لم يتم إضافة أي لون بعد
          </p>
        )}

        <div className="space-y-4">
          {colors.filter(c => !c.toDelete).map(color => (
            <ColorRow
              key={color.id}
              color={color}
              onChange={patch => updateColor(color.id, patch)}
              onRemove={() => removeColor(color.id)}
              onAddImages={files => addImagesToColor(color.id, files)}
              onRemoveImage={idx => removeImageFromColor(color.id, idx)}
              onReorderImage={(from, to) => reorderColorImages(color.id, from, to)}
            />
          ))}
        </div>
      </section>

      {/* Sizes */}
      <section className="bg-white rounded-xl border border-border p-5 space-y-4">
        <h2 className="font-heading font-bold text-base text-brand">المقاسات</h2>

        {/* Quick-add presets */}
        <div className="flex flex-wrap gap-2">
          {SIZE_PRESETS.map(preset => {
            const exists = visibleSizes.some(s => s.label === preset)
            return (
              <button
                key={preset}
                onClick={() => exists ? removeSize(sizes.find(s => s.label === preset && !s.toDelete)!.id) : addSize(preset)}
                className={cn(
                  'px-3 py-1 text-xs font-heading font-bold rounded-full border transition-colors',
                  exists
                    ? 'bg-brand text-white border-brand'
                    : 'border-border text-muted hover:border-brand hover:text-brand'
                )}
              >
                {preset}
              </button>
            )
          })}
        </div>

        {/* Custom size */}
        <div className="flex gap-2">
          <input
            value={customSize}
            onChange={e => setCustomSize(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { addSize(customSize); setCustomSize('') } }}
            placeholder="مقاس مخصص..."
            className="flex-1 border border-border rounded-xl px-4 py-2 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 font-body"
          />
          <button
            onClick={() => { addSize(customSize); setCustomSize('') }}
            className="px-4 py-2 bg-brand text-white text-sm font-heading font-bold rounded-xl hover:bg-brand/90 transition-colors"
          >
            إضافة
          </button>
        </div>

        {/* Size list — draggable */}
        {visibleSizes.length > 0 && (
          <div className="space-y-2">
            {visibleSizes.map((size, idx) => (
              <div
                key={size.id}
                draggable
                onDragStart={() => onSizeDragStart(idx)}
                onDragOver={e => onSizeDragOver(e, idx)}
                className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2.5 border border-border cursor-grab active:cursor-grabbing"
              >
                <GripVertical size={14} className="text-muted flex-shrink-0" />
                <span className="flex-1 font-heading font-bold text-sm text-brand">{size.label}</span>
                <button
                  onClick={() => updateSize(size.id, { is_visible: !size.is_visible })}
                  className={cn(
                    'p-1 rounded transition-colors',
                    size.is_visible ? 'text-green-600 hover:text-green-700' : 'text-muted hover:text-brand'
                  )}
                  title={size.is_visible ? 'إخفاء' : 'إظهار'}
                >
                  {size.is_visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
                <button
                  onClick={() => removeSize(size.id)}
                  className="p-1 rounded text-muted hover:text-red-500 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Stock management */}
      <StockGrid
        colors={colors.filter(c => !c.toDelete)}
        sizes={visibleSizes}
        stocks={variantStocks}
        onChange={updateVariantStock}
      />

      {/* Save */}
      <div className="flex gap-3 pb-8">
        <Button onClick={handleSave} loading={saving} className="flex-1">
          {isEdit ? 'حفظ التعديلات' : 'إضافة المنتج'}
        </Button>
        <Button variant="secondary" onClick={() => router.back()} className="flex-1">
          إلغاء
        </Button>
      </div>
    </div>
  )
}

// ── StockGrid sub-component ───────────────────────────────────────────────────

interface StockGridProps {
  colors: ColorEntry[]
  sizes: SizeEntry[]
  stocks: Record<string, string>
  onChange: (colorId: string, sizeId: string, value: string) => void
}

function StockGrid({ colors, sizes, stocks, onChange }: StockGridProps) {
  return (
    <section className="bg-white rounded-xl border border-border p-5 space-y-4">
      <div className="space-y-1">
        <h2 className="font-heading font-bold text-base text-brand">إدارة المخزون</h2>
        <p className="text-xs text-muted font-body text-right leading-relaxed">
          حددي الكمية لكل لون ومقاس. اتركي الخانة فارغة إذا كان المخزون غير محدود.
        </p>
      </div>

      {colors.length === 0 || sizes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-5 text-center">
          <p className="text-sm text-muted font-body">
            أضيفي لوناً ومقاساً واحداً على الأقل لإدارة المخزون.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto pb-1">
          <div
            className="min-w-max rounded-xl border border-border overflow-hidden"
            style={{ backgroundColor: '#FDFAF5' }}
          >
            <div
              className="grid border-b border-border"
              style={{ gridTemplateColumns: `minmax(150px, 1fr) repeat(${sizes.length}, minmax(96px, 112px))` }}
            >
              <div className="px-3 py-3 text-xs font-heading font-bold text-muted text-right">
                اللون
              </div>
              {sizes.map(size => (
                <div
                  key={size.id}
                  className="px-2 py-3 text-center text-xs font-heading font-black text-brand border-r border-border"
                >
                  {size.label}
                </div>
              ))}
            </div>

            {colors.map(color => (
              <div
                key={color.id}
                className="grid border-b border-border last:border-b-0"
                style={{ gridTemplateColumns: `minmax(150px, 1fr) repeat(${sizes.length}, minmax(96px, 112px))` }}
              >
                <div className="flex items-center gap-2 px-3 py-3 bg-white">
                  <span
                    className="w-5 h-5 rounded-full border border-black/10 flex-shrink-0"
                    style={{ backgroundColor: color.hex_code }}
                  />
                  <span className="font-heading font-bold text-sm text-brand truncate">
                    {color.name || 'لون بدون اسم'}
                  </span>
                </div>

                {sizes.map(size => (
                  <div key={size.id} className="px-2 py-2 bg-white border-r border-border">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={stocks[stockKey(color.id, size.id)] ?? ''}
                      onChange={e => onChange(color.id, size.id, e.target.value)}
                      aria-label={`مخزون ${color.name || 'اللون'} مقاس ${size.label}`}
                      placeholder="غير محدود"
                      className="w-full min-h-11 rounded-lg border border-border bg-surface px-2 text-center text-sm font-heading font-bold text-brand placeholder:text-[10px] placeholder:font-body placeholder:text-muted/70 focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                    />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

// ── ColorRow sub-component ─────────────────────────────────────────────────────

interface ColorRowProps {
  color: ColorEntry
  onChange: (patch: Partial<ColorEntry>) => void
  onRemove: () => void
  onAddImages: (files: FileList) => void
  onRemoveImage: (idx: number) => void
  onReorderImage: (fromIdx: number, toIdx: number) => void
}

function ColorRow({ color, onChange, onRemove, onAddImages, onRemoveImage, onReorderImage }: ColorRowProps) {
  const dragImgIndex = useRef<number | null>(null)
  const activeImages = color.images.filter(img => !img.toDelete)

  return (
    <div className="border border-border rounded-xl p-4 space-y-3">
      {/* Top row: color picker + name + remove */}
      <div className="flex items-center gap-3">
        {/* Color picker */}
        <div className="relative flex-shrink-0">
          <input
            type="color"
            value={color.hex_code}
            onChange={e => onChange({ hex_code: e.target.value })}
            className="sr-only"
            id={`color-picker-${color.id}`}
          />
          <label
            htmlFor={`color-picker-${color.id}`}
            className="w-10 h-10 rounded-lg border-2 border-white shadow cursor-pointer block"
            style={{ backgroundColor: color.hex_code }}
          />
        </div>

        {/* Hex input */}
        <input
          value={color.hex_code}
          onChange={e => {
            const v = e.target.value
            if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange({ hex_code: v })
          }}
          className="w-24 border border-border rounded-lg px-2 py-1.5 text-xs font-body text-brand focus:outline-none focus:border-brand"
          dir="ltr"
        />

        {/* Name */}
        <input
          value={color.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder="اسم اللون"
          className="flex-1 border border-border rounded-lg px-3 py-1.5 text-sm font-body text-brand placeholder:text-muted focus:outline-none focus:border-brand"
        />

        {/* Visibility */}
        <button
          onClick={() => onChange({ is_visible: !color.is_visible })}
          className={cn(
            'p-2 rounded-lg transition-colors',
            color.is_visible ? 'text-green-600 hover:bg-green-50' : 'text-muted hover:text-brand hover:bg-surface'
          )}
          title={color.is_visible ? 'إخفاء' : 'إظهار'}
        >
          {color.is_visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>

        {/* Remove */}
        <button
          onClick={onRemove}
          className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Images grid */}
      <div>
        <p className="text-xs text-muted font-body mb-2 text-right">صور اللون</p>
        <div className="flex flex-wrap gap-2">
          {activeImages.map((img, idx) => (
            <ImageSlot
              key={img.id ?? img.preview}
              img={img}
              idx={idx}
              onRemove={() => onRemoveImage(idx)}
              onDragStart={() => { dragImgIndex.current = idx }}
              onDragOver={e => {
                e.preventDefault()
                const from = dragImgIndex.current
                if (from !== null && from !== idx) {
                  onReorderImage(from, idx)
                  dragImgIndex.current = idx
                }
              }}
            />
          ))}

          {/* Add images button */}
          <label className="w-20 h-20 rounded-xl border-2 border-dashed border-border hover:border-brand/60 flex flex-col items-center justify-center cursor-pointer gap-1 transition-colors flex-shrink-0">
            <Plus size={16} className="text-muted" />
            <span className="text-[10px] text-muted font-body">إضافة</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={e => { if (e.target.files?.length) onAddImages(e.target.files) }}
            />
          </label>
        </div>
      </div>
    </div>
  )
}

// ── ImageSlot sub-component ────────────────────────────────────────────────────

interface ImageSlotProps {
  img: ImageEntry
  idx: number
  onRemove: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
}

function ImageSlot({ img, idx, onRemove, onDragStart, onDragOver }: ImageSlotProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      className="relative w-20 h-20 rounded-xl overflow-hidden border border-border cursor-grab active:cursor-grabbing flex-shrink-0"
    >
      <img src={img.preview} alt="" className="w-full h-full object-cover" />
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onRemove() }}
        className="absolute top-1 right-1 w-5 h-5 bg-white/90 rounded-full flex items-center justify-center shadow text-brand hover:text-red-500 transition-colors"
      >
        <X size={11} />
      </button>
      {idx === 0 && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[9px] text-center py-0.5 font-body pointer-events-none">
          رئيسية
        </div>
      )}
    </div>
  )
}
