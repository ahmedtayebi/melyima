'use client'

import { ProductImg } from '@/components/ui/ProductImage'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Eye, EyeOff, X, Check, Archive, RotateCcw } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import { saveCatalog } from '@/lib/admin-catalog-client'
import type { Product, Category } from '@/lib/types'

interface Props {
  initialProducts: Product[]
  initialCategories: Category[]
}

export default function ProductsClient({ initialProducts, initialCategories }: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts)
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [activeCategory, setActiveCategory] = useState<string>('all')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const mutationPending = useRef(false)
  const [notice, setNotice] = useState('')

  const [error, setError] = useState('')

  // Filter products by category
  const activeProducts = products.filter(product => !product.archived_at)
  const archivedProducts = products.filter(product => product.archived_at)
  const filtered = activeCategory === 'all'
    ? activeProducts
    : activeProducts.filter(p => p.category_id === activeCategory)

  const mutate = async (action: () => Promise<void>) => {
    setError('')
    try { await action() }
    catch (err) { setError(err instanceof Error ? err.message : 'تعذّر حفظ التغييرات') }
  }

  const handleAddCategory = () => mutate(async () => {
    if (!newCategoryName.trim()) return
    const data = await saveCatalog<Category>('category_create', { name: newCategoryName.trim(), sort_order: categories.length })
    setCategories(prev => [...prev, data])
    setNewCategoryName('')
    setAddingCategory(false)
  })

  const handleDeleteCategory = (id: string) => mutate(async () => {
    await saveCatalog('category_delete', { id })
    setCategories(prev => prev.filter(c => c.id !== id))
    setProducts(prev => prev.map(p => p.category_id === id ? { ...p, category_id: null } : p))
    if (activeCategory === id) setActiveCategory('all')
  })

  const toggleVisibility = (id: string, current: boolean) => mutate(async () => {
    if (mutationPending.current) return
    mutationPending.current = true
    setDeletingId(id)
    try {
      const result = await saveCatalog<Partial<Product>>('product_visibility', { id, visible: !current })
      setProducts(prev => prev.map(p => p.id === id ? { ...p, ...result } : p))
    } finally { mutationPending.current = false; setDeletingId(null) }
  })

  const handleArchiveProduct = async (product: Product, restore = false) => {
    if (mutationPending.current) return
    if (!restore && !confirm('نقل المنتج إلى الأرشيف؟ سيختفي من المتجر ويمكن استرجاعه لاحقًا.')) return
    mutationPending.current = true
    setDeletingId(product.id)
    setNotice('')
    await mutate(async () => {
      const result = await saveCatalog<Partial<Product>>(restore ? 'product_restore' : 'product_delete', {
        id: product.id, expected_updated_at: product.updated_at,
      })
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, ...result } : p))
      setNotice(restore ? 'تم استرجاع المنتج وهو مخفي. يمكنك إظهاره من قائمة المنتجات.' : 'تم نقل المنتج إلى الأرشيف.')
    })
    mutationPending.current = false
    setDeletingId(null)
  }

  const getFirstImage = (product: Product) => {
    const colors = product.product_colors
      ?.slice()
      .filter(color => !color.archived_at)
      .sort((a, b) => a.sort_order - b.sort_order) ?? []
    const first = colors.find(c => c.image_url)
    return first?.image_url ?? null
  }

  const formatPrice = (value: number) => `${value.toLocaleString('ar-DZ')} دج`

  return (
    <div className="space-y-6">
      {!archiveOpen && error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!archiveOpen && notice && <p role="status" className="text-sm text-green-700">{notice}</p>}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-heading font-black text-2xl text-brand">المنتجات</h1>
          <span className="bg-brand text-white text-xs font-bold font-heading px-2.5 py-1 rounded-full">
            {activeProducts.length}
          </span>
          <button
            type="button"
            onClick={() => { setError(''); setNotice(''); setArchiveOpen(true) }}
            aria-label="أرشيف المنتجات"
            title="أرشيف المنتجات"
            className="p-2 rounded-lg text-muted/70 hover:text-brand hover:bg-white transition-colors focus-visible:outline-2 focus-visible:outline-brand"
          >
            <Archive size={17} />
          </button>
        </div>
        <Link
          href="/admin/products/new"
          className="flex items-center gap-2 bg-accent text-white px-4 py-2.5 rounded-xl font-heading font-bold text-sm hover:opacity-90 transition-all"
        >
          <Plus size={16} />
          إضافة منتج
        </Link>
      </div>

      {/* Category tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">

        {/* All tab */}
        <button
          onClick={() => setActiveCategory('all')}
          style={{
            backgroundColor: activeCategory === 'all' ? '#1a1a1a' : '#ffffff',
            color: activeCategory === 'all' ? '#ffffff' : '#6B6B6B',
            border: activeCategory === 'all' ? '2px solid #1a1a1a' : '2px solid #E8E4DF',
          }}
          className="flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-heading font-bold transition-all"
        >
          الكل ({activeProducts.length})
        </button>

        {/* Category tabs */}
        {categories.map((cat) => {
          const count = activeProducts.filter(p => p.category_id === cat.id).length
          const isActive = activeCategory === cat.id
          return (
            <div key={cat.id} className="flex-shrink-0 flex items-center gap-1">
              <button
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  backgroundColor: isActive ? '#1a1a1a' : '#ffffff',
                  color: isActive ? '#ffffff' : '#6B6B6B',
                  border: isActive ? '2px solid #1a1a1a' : '2px solid #E8E4DF',
                }}
                className="px-4 py-1.5 rounded-full text-xs font-heading font-bold transition-all"
              >
                {cat.name} ({count})
              </button>
              <button
                onClick={() => handleDeleteCategory(cat.id)}
                className="w-5 h-5 rounded-full bg-red-100 text-red-500 flex items-center justify-center hover:bg-red-200 transition-colors flex-shrink-0"
              >
                <X size={10} />
              </button>
            </div>
          )
        })}

        {/* Add category */}
        {addingCategory ? (
          <div className="flex items-center gap-1 flex-shrink-0">
            <input
              autoFocus
              value={newCategoryName}
              onChange={e => setNewCategoryName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddCategory()
                if (e.key === 'Escape') setAddingCategory(false)
              }}
              placeholder="اسم التصنيف"
              className="w-32 text-xs border border-border rounded-full px-3 py-1.5 focus:outline-none focus:border-brand text-right"
            />
            <button
              onClick={handleAddCategory}
              className="w-7 h-7 rounded-full bg-green-100 text-green-600 flex items-center justify-center hover:bg-green-200 transition-colors"
            >
              <Check size={12} />
            </button>
            <button
              onClick={() => { setAddingCategory(false); setNewCategoryName('') }}
              className="w-7 h-7 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAddingCategory(true)}
            className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-heading font-bold text-muted border-2 border-dashed border-border hover:border-brand hover:text-brand transition-all"
          >
            <Plus size={12} />
            تصنيف
          </button>
        )}

      </div>

      {/* Products grid */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-border py-16 text-center">
          <p className="text-muted font-body text-sm">لا توجد منتجات في هذا التصنيف</p>
          <Link
            href="/admin/products/new"
            className="inline-flex items-center gap-2 mt-4 bg-accent text-white px-4 py-2 rounded-xl font-heading font-bold text-sm"
          >
            <Plus size={14} />
            إضافة منتج
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((product) => {
            const hasOutOfStockVariant = product.product_variants?.some(variant => variant.stock === 0
              && product.product_colors?.some(color => color.id === variant.color_id && !color.archived_at)
              && product.product_sizes?.some(size => size.id === variant.size_id && !size.archived_at)) ?? false
            const hasDiscount = product.original_price > 0 && product.original_price > product.price
            const discountAmount = hasDiscount ? product.original_price - product.price : 0
            const discountPercent = hasDiscount
              ? Math.round((discountAmount / product.original_price) * 100)
              : 0

            return (
            <div
              key={product.id}
              className="bg-white rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow"
            >
              {/* Image */}
              <div className="aspect-[4/3] relative overflow-hidden bg-surface">
                {getFirstImage(product) ? (
                  <ProductImg
                    src={getFirstImage(product)!}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-heading font-black text-4xl text-border">M</span>
                  </div>
                )}
                <span className={`absolute top-2 right-2 text-[10px] font-heading font-bold px-2 py-0.5 rounded-full ${
                  product.is_visible
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {product.is_visible ? 'ظاهر' : 'مخفي'}
                </span>
                {hasOutOfStockVariant && (
                  <span
                    className="absolute top-2 left-2 text-[10px] font-heading font-bold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: 'rgba(184,135,46,0.16)',
                      color: '#8B6420',
                      border: '1px solid rgba(184,135,46,0.35)',
                    }}
                  >
                    نفد المخزون
                  </span>
                )}
              </div>

              {/* Info */}
              <div className="p-3">
                <p className="font-heading font-bold text-sm text-brand text-right truncate mb-1">
                  {product.name}
                </p>
                <p className="text-xs text-muted font-body text-right mb-3">
                  {product.product_colors?.filter(color => !color.archived_at).length ?? 0} لون ·{' '}
                  {product.product_sizes?.filter(size => !size.archived_at).length ?? 0} مقاس
                </p>
                <div className="mb-3 rounded-xl bg-surface/70 border border-border px-3 py-2 text-right">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted font-body">السعر الأصلي</span>
                    <span className="font-heading font-bold text-xs text-brand tabular-nums">
                      {formatPrice(hasDiscount ? product.original_price : product.price)}
                    </span>
                  </div>
                  {hasDiscount && (
                    <>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[11px] text-muted font-body">السعر المخفض</span>
                        <span className="font-heading font-black text-sm text-accent tabular-nums">
                          {formatPrice(product.price)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-1">
                        <span className="text-[11px] text-muted font-body">قيمة التخفيض</span>
                        <span className="font-heading font-bold text-xs text-green-700 tabular-nums">
                          {formatPrice(discountAmount)} · {discountPercent}%
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleArchiveProduct(product)}
                      disabled={deletingId !== null}
                      aria-label={`نقل ${product.name} إلى الأرشيف`}
                      title="نقل إلى الأرشيف"
                      className="p-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="p-2 rounded-lg text-muted hover:text-brand hover:bg-surface transition-colors"
                    >
                      <Pencil size={14} />
                    </Link>
                  </div>
                  <button
                    onClick={() => toggleVisibility(product.id, product.is_visible)}
                    disabled={deletingId !== null}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-heading font-bold transition-all ${
                      product.is_visible
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {product.is_visible
                      ? <><Eye size={12} /> ظاهر</>
                      : <><EyeOff size={12} /> مخفي</>
                    }
                  </button>
                </div>
              </div>
            </div>
            )
          })}
        </div>
      )}

      <Modal isOpen={archiveOpen} onClose={() => setArchiveOpen(false)} title="أرشيف المنتجات">
        <p className="text-sm text-muted mb-4">المنتجات هنا لا تظهر في المتجر. يمكنك استرجاعها مع صورها وخياراتها ومخزونها.</p>
        {error && <p role="alert" className="text-sm text-red-600 mb-3">{error}</p>}
        {notice && <p role="status" className="text-sm text-green-700 mb-3">{notice}</p>}
        {archivedProducts.length === 0 ? <p className="text-sm text-muted py-6 text-center">الأرشيف فارغ</p> : (
          <ul className="divide-y divide-border">
            {archivedProducts.map(product => (
              <li key={product.id} className="flex items-center gap-3 py-3">
                {getFirstImage(product) && <ProductImg src={getFirstImage(product)!} alt="" className="w-12 h-14 object-cover rounded-lg shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-heading font-bold text-brand break-words">{product.name}</p>
                  <p className="text-xs text-muted">{formatPrice(product.price)}</p>
                </div>
                <button type="button" onClick={() => handleArchiveProduct(product, true)} disabled={deletingId !== null}
                  aria-label={`استرجاع ${product.name}`}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-heading font-bold text-brand bg-surface disabled:opacity-50">
                  <RotateCcw size={14} />{deletingId === product.id ? 'جارٍ الاسترجاع...' : 'استرجاع'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  )
}
