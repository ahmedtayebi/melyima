'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Product, ProductColor, ProductSize, ProductVariant } from '@/lib/types'

type StockFilter = 'all' | 'out' | 'low' | 'unmanaged'
type CellStatus = 'idle' | 'saving' | 'saved' | 'error'

type InventoryCombination = {
  key: string
  productId: string
  productName: string
  colorId: string
  colorName: string
  sizeId: string
  sizeLabel: string
  stock: number | null
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

function stockKey(productId: string, colorId: string, sizeId: string) {
  return `${productId}:${colorId}:${sizeId}`
}

function sortSizes(sizes: ProductSize[]) {
  return [...sizes].sort((a, b) => a.sort_order - b.sort_order)
}

function getVariant(product: Product, colorId: string, sizeId: string) {
  return product.product_variants?.find(variant =>
    variant.color_id === colorId && variant.size_id === sizeId
  )
}

function getStock(product: Product, colorId: string, sizeId: string) {
  return getVariant(product, colorId, sizeId)?.stock ?? null
}

function normalizeStockValue(value: string) {
  const trimmed = value.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(0, Math.floor(parsed))
}

function flattenInventory(products: Product[]): InventoryCombination[] {
  return products.flatMap(product => {
    const colors = product.product_colors
      ?.slice()
      .sort((a, b) => a.sort_order - b.sort_order) ?? []
    const sizes = sortSizes(product.product_sizes ?? [])
    if (colors.length === 0 || sizes.length === 0) return []

    return colors.flatMap(color =>
      sizes.map(size => ({
        key: stockKey(product.id, color.id, size.id),
        productId: product.id,
        productName: product.name,
        colorId: color.id,
        colorName: color.name,
        sizeId: size.id,
        sizeLabel: size.label,
        stock: getStock(product, color.id, size.id),
      }))
    )
  })
}

function combinationMatchesFilter(combination: InventoryCombination, filter: StockFilter) {
  return (
    filter === 'all' ||
    (filter === 'out' && combination.stock === 0) ||
    (filter === 'low' && combination.stock !== null && combination.stock > 0 && combination.stock <= LOW_STOCK_LIMIT) ||
    (filter === 'unmanaged' && combination.stock === null)
  )
}

function productMatchesSearch(product: Product, search: string) {
  const q = search.trim().toLowerCase()
  if (!q) return true

  return [
    product.name,
    ...(product.product_colors ?? []).map(color => color.name),
    ...(product.product_sizes ?? []).map(size => size.label),
  ].some(value => value.toLowerCase().includes(q))
}

function productMatchesFilter(product: Product, filter: StockFilter) {
  if (filter === 'all') return true
  return flattenInventory([product]).some(combination => combinationMatchesFilter(combination, filter))
}

export default function InventoryClient({ initialProducts }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [cellStatus, setCellStatus] = useState<Record<string, CellStatus>>({})
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const combinations = useMemo(() => flattenInventory(products), [products])

  const stats = useMemo(() => ({
    total: combinations.length,
    out: combinations.filter(item => item.stock === 0).length,
    low: combinations.filter(item => item.stock !== null && item.stock > 0 && item.stock <= LOW_STOCK_LIMIT).length,
    unmanaged: combinations.filter(item => item.stock === null).length,
  }), [combinations])

  const visibleProducts = useMemo(() => {
    return products.filter(product =>
      productMatchesSearch(product, search) && productMatchesFilter(product, filter)
    )
  }, [filter, products, search])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  const updateDraft = (key: string, value: string) => {
    if (value !== '' && !/^\d+$/.test(value)) return
    setDrafts(prev => ({ ...prev, [key]: value }))
  }

  const setStatus = (key: string, status: CellStatus) => {
    setCellStatus(prev => ({ ...prev, [key]: status }))
  }

  const updateProductVariant = (savedVariant: ProductVariant | null, productId: string, colorId: string, sizeId: string) => {
    setProducts(prev => prev.map(product => {
      if (product.id !== productId) return product

      const retained = (product.product_variants ?? []).filter(variant =>
        !(variant.color_id === colorId && variant.size_id === sizeId)
      )

      return {
        ...product,
        product_variants: savedVariant ? [...retained, savedVariant] : retained,
      }
    }))
  }

  const saveCell = async (productId: string, colorId: string, sizeId: string) => {
    const key = stockKey(productId, colorId, sizeId)
    const product = products.find(item => item.id === productId)
    if (!product) return

    const currentStock = getStock(product, colorId, sizeId)
    const value = drafts[key] ?? (currentStock === null ? '' : String(currentStock))
    const parsed = normalizeStockValue(value)

    if (parsed === undefined) {
      showToast('قيمة المخزون غير صحيحة', 'error')
      setStatus(key, 'error')
      return
    }

    if (parsed === currentStock) {
      setDrafts(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      return
    }

    setStatus(key, 'saving')
    try {
      const supabase = createClient()

      if (parsed === null) {
        const { error } = await supabase
          .from('product_variants')
          .delete()
          .eq('product_id', productId)
          .eq('color_id', colorId)
          .eq('size_id', sizeId)

        if (error) throw new Error(error.message)
        updateProductVariant(null, productId, colorId, sizeId)
      } else {
        const { data, error } = await supabase
          .from('product_variants')
          .upsert(
            { product_id: productId, color_id: colorId, size_id: sizeId, stock: parsed },
            { onConflict: 'color_id,size_id' }
          )
          .select('id, product_id, color_id, size_id, stock')
          .single()

        if (error) throw new Error(error.message)
        updateProductVariant(data as ProductVariant, productId, colorId, sizeId)
      }

      setDrafts(prev => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      setStatus(key, 'saved')
      setTimeout(() => setStatus(key, 'idle'), 1400)
    } catch (err) {
      setStatus(key, 'error')
      showToast(err instanceof Error ? err.message : 'تعذر حفظ المخزون', 'error')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="font-heading font-black text-2xl text-brand">المخزون</h1>
        <span className="bg-brand text-white text-xs font-bold font-heading px-2.5 py-1 rounded-full">
          {combinations.length}
        </span>
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

      <div className="space-y-4">
        {visibleProducts.length === 0 ? (
          <div className="bg-white rounded-xl border border-border py-16 text-center">
            <p className="text-muted font-body text-sm">لا توجد منتجات مطابقة</p>
          </div>
        ) : visibleProducts.map(product => (
          <ProductInventoryCard
            key={product.id}
            product={product}
            drafts={drafts}
            cellStatus={cellStatus}
            onDraftChange={updateDraft}
            onSaveCell={saveCell}
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

function ProductInventoryCard({
  product,
  drafts,
  cellStatus,
  onDraftChange,
  onSaveCell,
}: {
  product: Product
  drafts: Record<string, string>
  cellStatus: Record<string, CellStatus>
  onDraftChange: (key: string, value: string) => void
  onSaveCell: (productId: string, colorId: string, sizeId: string) => void
}) {
  const colors = product.product_colors
    ?.slice()
    .sort((a, b) => a.sort_order - b.sort_order) ?? []
  const sizes = sortSizes(product.product_sizes ?? [])
  const firstImage = colors.find(color => color.image_url)?.image_url ?? null

  const outCount = colors.reduce((sum, color) =>
    sum + sizes.filter(size => getStock(product, color.id, size.id) === 0).length, 0)

  const unmanagedCount = colors.reduce((sum, color) =>
    sum + sizes.filter(size => getStock(product, color.id, size.id) === null).length, 0)

  return (
    <section className="bg-white rounded-xl border border-border overflow-hidden">
      <div className="flex flex-col lg:flex-row-reverse">
        <aside className="lg:w-64 border-b lg:border-b-0 lg:border-l border-border bg-[#FFFCF6] p-4">
          <div className="flex lg:flex-col gap-3">
            <div className="relative w-20 h-20 lg:w-full lg:aspect-[4/3] lg:h-auto rounded-xl overflow-hidden bg-surface border border-border flex-shrink-0">
              {firstImage ? (
                <Image
                  src={firstImage}
                  alt={product.name}
                  fill
                  sizes="(max-width: 1024px) 80px, 256px"
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="font-heading font-black text-3xl text-border">M</span>
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-heading font-black text-base text-brand text-right leading-snug line-clamp-2">
                    {product.name}
                  </h2>
                  <p className="mt-1 text-xs text-muted font-body text-right">
                    {colors.length} لون · {sizes.length} مقاس
                  </p>
                </div>
                <Link
                  href={`/admin/products/${product.id}/edit`}
                  className="inline-flex lg:hidden items-center justify-center w-9 h-9 rounded-lg border border-border text-muted hover:text-brand hover:border-brand"
                  aria-label="تعديل المنتج"
                >
                  <Pencil size={15} />
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {!product.is_visible && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-heading font-bold text-gray-500">
                    المنتج مخفي
                  </span>
                )}
                {outCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-heading font-bold text-amber-800">
                    {outCount} نفد
                  </span>
                )}
                {unmanagedCount > 0 && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-heading font-bold text-gray-600">
                    {unmanagedCount} غير مُدار
                  </span>
                )}
              </div>

              <Link
                href={`/admin/products/${product.id}/edit`}
                className="hidden lg:inline-flex mt-4 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-heading font-bold text-muted hover:text-brand hover:border-brand transition-colors"
              >
                <Pencil size={12} />
                تعديل المنتج
              </Link>
            </div>
          </div>
        </aside>

        <div className="flex-1 p-4 min-w-0">
          {colors.length === 0 || sizes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface px-4 py-8 text-center">
              <p className="text-sm text-muted font-body">
                أضيفي ألواناً ومقاسات لهذا المنتج لإدارة مخزونه.
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
                  style={{ gridTemplateColumns: `minmax(136px, 1.2fr) repeat(${sizes.length}, minmax(86px, 104px))` }}
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
                  <ColorStockRow
                    key={color.id}
                    product={product}
                    color={color}
                    sizes={sizes}
                    drafts={drafts}
                    cellStatus={cellStatus}
                    onDraftChange={onDraftChange}
                    onSaveCell={onSaveCell}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

function ColorStockRow({
  product,
  color,
  sizes,
  drafts,
  cellStatus,
  onDraftChange,
  onSaveCell,
}: {
  product: Product
  color: ProductColor
  sizes: ProductSize[]
  drafts: Record<string, string>
  cellStatus: Record<string, CellStatus>
  onDraftChange: (key: string, value: string) => void
  onSaveCell: (productId: string, colorId: string, sizeId: string) => void
}) {
  return (
    <div
      className="grid border-b border-border last:border-b-0"
      style={{ gridTemplateColumns: `minmax(136px, 1.2fr) repeat(${sizes.length}, minmax(86px, 104px))` }}
    >
      <div className="px-3 py-3 flex items-center gap-2 min-w-0">
        <span
          className="w-5 h-5 rounded-full border border-black/10 flex-shrink-0"
          style={{ backgroundColor: color.hex_code }}
        />
        <div className="min-w-0">
          <p className="font-heading font-bold text-xs text-brand truncate">{color.name}</p>
          {!color.is_visible && (
            <p className="text-[10px] text-muted font-body">مخفي</p>
          )}
        </div>
      </div>

      {sizes.map(size => (
        <StockCell
          key={size.id}
          product={product}
          color={color}
          size={size}
          value={drafts[stockKey(product.id, color.id, size.id)]}
          status={cellStatus[stockKey(product.id, color.id, size.id)] ?? 'idle'}
          onDraftChange={onDraftChange}
          onSaveCell={onSaveCell}
        />
      ))}
    </div>
  )
}

function StockCell({
  product,
  color,
  size,
  value,
  status,
  onDraftChange,
  onSaveCell,
}: {
  product: Product
  color: ProductColor
  size: ProductSize
  value: string | undefined
  status: CellStatus
  onDraftChange: (key: string, value: string) => void
  onSaveCell: (productId: string, colorId: string, sizeId: string) => void
}) {
  const key = stockKey(product.id, color.id, size.id)
  const stock = getStock(product, color.id, size.id)
  const displayValue = value ?? (stock === null ? '' : String(stock))
  const changed = normalizeStockValue(displayValue) !== stock
  const isOut = normalizeStockValue(displayValue) === 0

  const save = () => onSaveCell(product.id, color.id, size.id)

  return (
    <div className={cn(
      'relative border-r border-border p-2 transition-colors',
      isOut ? 'bg-amber-100/70' : 'bg-white',
      changed && 'bg-accent/10',
      status === 'error' && 'bg-red-50'
    )}>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={event => onDraftChange(key, event.target.value)}
        onBlur={save}
        onKeyDown={event => {
          if (event.key === 'Enter') {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        placeholder="غير محدود"
        className={cn(
          'h-9 w-full rounded-lg border px-2 text-center text-sm font-body text-brand outline-none transition-colors placeholder:text-gray-400',
          isOut ? 'border-amber-300 bg-amber-50' : 'border-border bg-white',
          changed && 'border-accent',
          status === 'error' && 'border-red-300 bg-red-50'
        )}
        dir="ltr"
        aria-label={`${product.name} ${color.name} ${size.label}`}
      />
      <CellStatusIndicator status={status} />
    </div>
  )
}

function CellStatusIndicator({ status }: { status: CellStatus }) {
  if (status === 'saving') {
    return (
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted">
        <Loader2 size={12} className="animate-spin" />
      </span>
    )
  }

  if (status === 'saved') {
    return (
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-green-600">
        <CheckCircle2 size={12} />
      </span>
    )
  }

  if (status === 'error') {
    return (
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-red-600">
        <AlertTriangle size={12} />
      </span>
    )
  }

  return null
}
