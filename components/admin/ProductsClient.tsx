'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Pencil, Trash2, Eye, EyeOff, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
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

  const supabase = createClient()

  // Filter products by category
  const filtered = activeCategory === 'all'
    ? products
    : products.filter(p => p.category_id === activeCategory)

  // Add category
  const handleAddCategory = async () => {
    if (!newCategoryName.trim()) return
    const { data, error } = await supabase
      .from('categories')
      .insert({ name: newCategoryName.trim(), sort_order: categories.length })
      .select()
      .single()
    if (!error && data) {
      setCategories(prev => [...prev, data])
      setNewCategoryName('')
      setAddingCategory(false)
    }
  }

  // Delete category
  const handleDeleteCategory = async (id: string) => {
    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
    if (!error) {
      setCategories(prev => prev.filter(c => c.id !== id))
      if (activeCategory === id) setActiveCategory('all')
    }
  }

  // Toggle product visibility
  const toggleVisibility = async (id: string, current: boolean) => {
    const { error } = await supabase
      .from('products')
      .update({ is_visible: !current })
      .eq('id', id)
    if (!error) {
      setProducts(prev =>
        prev.map(p => p.id === id ? { ...p, is_visible: !current } : p)
      )
    }
  }

  // Delete product
  const handleDeleteProduct = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return
    setDeletingId(id)
    await supabase.from('product_colors').delete().eq('product_id', id)
    await supabase.from('product_sizes').delete().eq('product_id', id)
    const { error } = await supabase.from('products').delete().eq('id', id)
    if (!error) {
      setProducts(prev => prev.filter(p => p.id !== id))
    }
    setDeletingId(null)
  }

  const getFirstImage = (product: Product) => {
    const colors = product.product_colors ?? []
    const first = colors.find(c => c.image_url)
    return first?.image_url ?? null
  }

  const formatPrice = (value: number) => `${value.toLocaleString('ar-DZ')} دج`

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="font-heading font-black text-2xl text-brand">المنتجات</h1>
          <span className="bg-brand text-white text-xs font-bold font-heading px-2.5 py-1 rounded-full">
            {products.length}
          </span>
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
          الكل ({products.length})
        </button>

        {/* Category tabs */}
        {categories.map((cat) => {
          const count = products.filter(p => p.category_id === cat.id).length
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
            const hasOutOfStockVariant = product.product_variants?.some(variant => variant.stock === 0) ?? false
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
                  <img
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
                  {product.product_colors?.length ?? 0} لون ·{' '}
                  {product.product_sizes?.length ?? 0} مقاس
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
                      onClick={() => handleDeleteProduct(product.id)}
                      disabled={deletingId === product.id}
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

    </div>
  )
}
