'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle, CheckCircle2, Filter, Pencil, RotateCcw, Save, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Product, ProductVariant } from '@/lib/types'

type StockFilter = 'all' | 'out' | 'low' | 'unmanaged'

type InventoryRow = {
  key: string
  productId: string
  productName: string
  productVisible: boolean
  colorId: string
  colorName: string
  colorHex: string
  colorVisible: boolean
  sizeId: string
  sizeLabel: string
  sizeVisible: boolean
  imageUrl: string | null
  stock: number | null
  variantId: string | null
}

interface Props {
  initialProducts: Product[]
}

const LOW_STOCK_LIMIT = 3

const filterTabs: { key: StockFilter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'out', label: 'نفد' },
  { key: 'low', label: 'منخفض' },
  { key: 'unmanaged', label: 'غير مُدار' },
]

function rowKey(productId: string, colorId: string, sizeId: string) {
  return `${productId}:${colorId}:${sizeId}`
}

function flattenInventory(products: Product[]): InventoryRow[] {
  return products.flatMap(product => {
    const colors = [...(product.product_colors ?? [])]
    const sizes = [...(product.product_sizes ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    const variants = product.product_variants ?? []

    if (colors.length === 0 || sizes.length === 0) return []

    return colors.flatMap(color =>
      sizes.map(size => {
        const variant = variants.find(v => v.color_id === color.id && v.size_id === size.id)
        return {
          key: rowKey(product.id, color.id, size.id),
          productId: product.id,
          productName: product.name,
          productVisible: product.is_visible,
          colorId: color.id,
          colorName: color.name,
          colorHex: color.hex_code,
          colorVisible: color.is_visible,
          sizeId: size.id,
          sizeLabel: size.label,
          sizeVisible: size.is_visible,
          imageUrl: color.image_url,
          stock: variant?.stock ?? null,
          variantId: variant?.id ?? null,
        }
      })
    )
  })
}

function normalizeStockValue(value: string) {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.floor(parsed))
}

export default function InventoryClient({ initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const rows = useMemo(() => flattenInventory(products), [products])

  const stats = useMemo(() => ({
    total: rows.length,
    out: rows.filter(row => row.stock === 0).length,
    low: rows.filter(row => row.stock !== null && row.stock > 0 && row.stock <= LOW_STOCK_LIMIT).length,
    unmanaged: rows.filter(row => row.stock === null).length,
  }), [rows])

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(row => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'out' && row.stock === 0) ||
        (filter === 'low' && row.stock !== null && row.stock > 0 && row.stock <= LOW_STOCK_LIMIT) ||
        (filter === 'unmanaged' && row.stock === null)

      if (!matchesFilter) return false
      if (!q) return true

      return [
        row.productName,
        row.colorName,
        row.sizeLabel,
      ].some(value => value.toLowerCase().includes(q))
    })
  }, [filter, rows, search])

  const changedRows = useMemo(() => rows.filter(row => {
    if (!(row.key in drafts)) return false
    const parsed = normalizeStockValue(drafts[row.key])
    return parsed !== undefined && parsed !== row.stock
  }), [drafts, rows])

  const invalidChanges = useMemo(() => rows.filter(row => {
    if (!(row.key in drafts)) return false
    return normalizeStockValue(drafts[row.key]) === undefined
  }), [drafts, rows])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const updateDraft = (key: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return
    setDrafts(prev => ({ ...prev, [key]: value }))
  }

  const resetDrafts = () => setDrafts({})

  const saveChanges = async () => {
    if (invalidChanges.length > 0) {
      showToast('توجد قيم غير صحيحة في المخزون', 'error')
      return
    }
    if (changedRows.length === 0) return

    setSaving(true)
    try {
      const supabase = createClient()
      const toDelete = changedRows.filter(row => normalizeStockValue(drafts[row.key]) === null)
      const toUpsert = changedRows
        .map(row => {
          const stock = normalizeStockValue(drafts[row.key])
          if (stock === null || stock === undefined) return null
          return {
            product_id: row.productId,
            color_id: row.colorId,
            size_id: row.sizeId,
            stock,
          }
        })
        .filter(Boolean) as Omit<ProductVariant, 'id'>[]

      for (const row of toDelete) {
        const { error } = await supabase
          .from('product_variants')
          .delete()
          .eq('product_id', row.productId)
          .eq('color_id', row.colorId)
          .eq('size_id', row.sizeId)
        if (error) throw new Error(error.message)
      }

      let savedVariants: ProductVariant[] = []
      if (toUpsert.length > 0) {
        const { data, error } = await supabase
          .from('product_variants')
          .upsert(toUpsert, { onConflict: 'color_id,size_id' })
          .select('id, product_id, color_id, size_id, stock')

        if (error) throw new Error(error.message)
        savedVariants = (data ?? []) as ProductVariant[]
      }

      const deletedKeys = new Set(toDelete.map(row => row.key))
      const savedByKey = new Map(
        savedVariants.map(variant => [
          rowKey(variant.product_id, variant.color_id, variant.size_id),
          variant,
        ])
      )

      setProducts(prev => prev.map(product => {
        const productRowsChanged = changedRows.some(row => row.productId === product.id)
        if (!productRowsChanged) return product

        const existing = product.product_variants ?? []
        const retained = existing.filter(variant =>
          !deletedKeys.has(rowKey(product.id, variant.color_id, variant.size_id)) &&
          !savedByKey.has(rowKey(product.id, variant.color_id, variant.size_id))
        )

        return {
          ...product,
          product_variants: [...retained, ...savedVariants.filter(v => v.product_id === product.id)],
        }
      }))

      setDrafts(prev => {
        const next = { ...prev }
        changedRows.forEach(row => { delete next[row.key] })
        return next
      })
      showToast('تم حفظ المخزون بنجاح', 'success')
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'تعذر حفظ المخزون', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-heading font-black text-2xl text-brand">المخزون</h1>
          <span className="bg-brand text-white text-xs font-bold font-heading px-2.5 py-1 rounded-full">
            {rows.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={resetDrafts}
            disabled={Object.keys(drafts).length === 0 || saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-white text-muted text-sm font-heading font-bold hover:text-brand hover:border-brand transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            <RotateCcw size={15} />
            تراجع
          </button>
          <button
            type="button"
            onClick={saveChanges}
            disabled={changedRows.length === 0 || saving}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-accent text-white text-sm font-heading font-bold hover:opacity-90 transition-all disabled:opacity-50 disabled:pointer-events-none"
          >
            <Save size={15} />
            {saving ? 'جارٍ الحفظ...' : `حفظ (${changedRows.length})`}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'كل التركيبات', count: stats.total, active: filter === 'all', next: 'all' as StockFilter },
          { label: 'نفد المخزون', count: stats.out, active: filter === 'out', next: 'out' as StockFilter },
          { label: 'مخزون منخفض', count: stats.low, active: filter === 'low', next: 'low' as StockFilter },
          { label: 'غير مُدار', count: stats.unmanaged, active: filter === 'unmanaged', next: 'unmanaged' as StockFilter },
        ].map(item => (
          <button
            key={item.next}
            type="button"
            onClick={() => setFilter(item.next)}
            className={cn(
              'rounded-xl border-2 p-4 text-right transition-all',
              item.active ? 'bg-accent border-accent shadow-sm' : 'bg-white border-border hover:border-brand'
            )}
          >
            <p className={cn('font-heading font-black text-2xl', item.active ? 'text-white' : 'text-brand')}>
              {item.count}
            </p>
            <p className={cn('text-xs font-body mt-0.5', item.active ? 'text-white/80' : 'text-muted')}>
              {item.label}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-xl p-1 overflow-x-auto">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-heading font-bold whitespace-nowrap transition-colors',
                filter === tab.key ? 'bg-brand text-white' : 'text-muted hover:text-brand'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث باسم المنتج، اللون أو المقاس..."
            className="w-full bg-white border border-border rounded-xl pr-9 pl-4 py-2.5 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>
      </div>

      {invalidChanges.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-body">
          <AlertTriangle size={16} />
          توجد {invalidChanges.length} قيمة غير صحيحة. استعملي أرقامًا صحيحة فقط أو اتركي الخانة فارغة.
        </div>
      )}

      <div className="hidden lg:block bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface">
            <tr>
              {['المنتج', 'اللون', 'المقاس', 'الحالة', 'المخزون', 'تعديل'].map(h => (
                <th key={h} className="text-right px-4 py-3 font-heading font-bold text-xs text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-muted font-body text-sm">
                  لا توجد نتائج
                </td>
              </tr>
            ) : visibleRows.map(row => (
              <InventoryTableRow
                key={row.key}
                row={row}
                value={drafts[row.key] ?? (row.stock === null ? '' : String(row.stock))}
                changed={changedRows.some(changed => changed.key === row.key)}
                onChange={value => updateDraft(row.key, value)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="lg:hidden space-y-3">
        {visibleRows.length === 0 ? (
          <p className="text-center py-12 text-muted font-body text-sm">لا توجد نتائج</p>
        ) : visibleRows.map(row => (
          <InventoryMobileCard
            key={row.key}
            row={row}
            value={drafts[row.key] ?? (row.stock === null ? '' : String(row.stock))}
            changed={changedRows.some(changed => changed.key === row.key)}
            onChange={value => updateDraft(row.key, value)}
          />
        ))}
      </div>

      {toast && (
        <div className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full text-sm font-heading font-bold text-white shadow-lg pointer-events-none',
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        )}>
          {toast.message}
        </div>
      )}
    </div>
  )
}

function StockBadge({ row }: { row: InventoryRow }) {
  if (row.stock === null) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-heading font-bold text-gray-600">
        <Filter size={11} />
        غير مُدار
      </span>
    )
  }
  if (row.stock === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-heading font-bold text-red-700">
        <AlertTriangle size={11} />
        نفد
      </span>
    )
  }
  if (row.stock <= LOW_STOCK_LIMIT) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-heading font-bold text-amber-800">
        <AlertTriangle size={11} />
        منخفض
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-heading font-bold text-green-700">
      <CheckCircle2 size={11} />
      متوفر
    </span>
  )
}

function InventoryImage({ row }: { row: InventoryRow }) {
  return (
    <div className="w-11 h-11 rounded-xl overflow-hidden bg-surface border border-border flex-shrink-0">
      {row.imageUrl ? (
        <Image
          src={row.imageUrl}
          alt={row.productName}
          width={44}
          height={44}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full" style={{ backgroundColor: row.colorHex }} />
      )}
    </div>
  )
}

function VisibilityLabels({ row }: { row: InventoryRow }) {
  const hidden: string[] = []
  if (!row.productVisible) hidden.push('المنتج مخفي')
  if (!row.colorVisible) hidden.push('اللون مخفي')
  if (!row.sizeVisible) hidden.push('المقاس مخفي')

  if (hidden.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {hidden.map(label => (
        <span key={label} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-heading font-bold text-gray-500">
          {label}
        </span>
      ))}
    </div>
  )
}

function StockInput({
  value,
  changed,
  onChange,
}: {
  value: string
  changed: boolean
  onChange: (value: string) => void
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder="غير محدود"
      className={cn(
        'w-28 rounded-xl border px-3 py-2 text-sm text-brand text-center font-body focus:outline-none focus:ring-2 focus:ring-brand/10',
        changed ? 'border-accent bg-accent/5' : 'border-border bg-white focus:border-brand'
      )}
      dir="ltr"
    />
  )
}

function InventoryTableRow({
  row,
  value,
  changed,
  onChange,
}: {
  row: InventoryRow
  value: string
  changed: boolean
  onChange: (value: string) => void
}) {
  return (
    <tr className={cn('transition-colors hover:bg-surface/50', changed && 'bg-accent/5')}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <InventoryImage row={row} />
          <div className="min-w-0">
            <p className="font-heading font-bold text-sm text-brand truncate">{row.productName}</p>
            <VisibilityLabels row={row} />
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="w-4 h-4 rounded-full border border-black/10" style={{ backgroundColor: row.colorHex }} />
          <span className="font-body text-sm text-brand">{row.colorName}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <span className="inline-flex rounded-full border border-border px-3 py-1 text-xs font-heading font-bold text-brand">
          {row.sizeLabel}
        </span>
      </td>
      <td className="px-4 py-3">
        <StockBadge row={row} />
      </td>
      <td className="px-4 py-3">
        <StockInput value={value} changed={changed} onChange={onChange} />
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/admin/products/${row.productId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-heading font-bold text-muted hover:text-brand hover:border-brand transition-colors"
        >
          <Pencil size={12} />
          المنتج
        </Link>
      </td>
    </tr>
  )
}

function InventoryMobileCard({
  row,
  value,
  changed,
  onChange,
}: {
  row: InventoryRow
  value: string
  changed: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className={cn('bg-white rounded-xl border p-4 space-y-3', changed ? 'border-accent' : 'border-border')}>
      <div className="flex items-start gap-3">
        <InventoryImage row={row} />
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold text-sm text-brand truncate">{row.productName}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted font-body">
            <span className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: row.colorHex }} />
            <span>{row.colorName}</span>
            <span>·</span>
            <span>{row.sizeLabel}</span>
          </div>
          <VisibilityLabels row={row} />
        </div>
        <StockBadge row={row} />
      </div>
      <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
        <StockInput value={value} changed={changed} onChange={onChange} />
        <Link
          href={`/admin/products/${row.productId}/edit`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-heading font-bold text-muted hover:text-brand"
        >
          <Pencil size={12} />
          المنتج
        </Link>
      </div>
    </div>
  )
}
