'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronLeft, ShoppingBag, Check } from 'lucide-react'
import { useCartStore } from '@/lib/cart-store'
import { getDiscountPercent, hasDiscount } from '@/lib/discount'
import Modal from '@/components/ui/Modal'
import OrderForm from './OrderForm'
import type { Product, ProductVariant } from '@/lib/types'

export default function ProductDetail({
  product,
  storePolicy,
  productVariants = product.product_variants ?? [],
}: {
  product: Product
  storePolicy: string
  productVariants?: ProductVariant[]
}) {
  const visibleColors = product.product_colors
    ?.slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .filter(c => c.is_visible) ?? []
  const visibleSizes = product.product_sizes?.filter(s => s.is_visible)
    .filter((s, i, arr) => arr.findIndex(t => t.label === s.label) === i) ?? []

  const [selectedColorId, setSelectedColorId] = useState(visibleColors[0]?.id ?? '')
  const [selectedSizeId, setSelectedSizeId] = useState('')
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [added, setAdded] = useState(false)
  const [buyNowOpen, setBuyNowOpen] = useState(false)

  const addItem = useCartStore(s => s.addItem)
  const selectedColor = visibleColors.find(c => c.id === selectedColorId) ?? visibleColors[0]

  const colorImages = selectedColor?.images?.length
    ? selectedColor.images.map(img => img.image_url)
    : selectedColor?.image_url
      ? [selectedColor.image_url]
      : []

  const selectedVariant = selectedColor && selectedSizeId
    ? productVariants.find(v => v.color_id === selectedColor.id && v.size_id === selectedSizeId)
    : undefined
  const isOutOfStock = selectedVariant?.stock === 0

  const handleColorChange = useCallback((colorId: string) => {
    setSelectedColorId(colorId)
    setCurrentImageIndex(0)
  }, [])

  const handleAdd = () => {
    if (!selectedSizeId || !selectedColor || isOutOfStock) return
    const size = visibleSizes.find(s => s.id === selectedSizeId)
    if (!size) return
    addItem({
      product_id: product.id,
      product_name: product.name,
      color_id: selectedColor.id,
      color_name: selectedColor.name,
      color_hex: selectedColor.hex_code,
      color_image_url: colorImages[0] ?? selectedColor.image_url,
      size_id: size.id,
      size_label: size.label,
      quantity: 1,
      price: product.price,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1500)
  }

  const handleBuyNow = () => {
    if (!selectedSizeId || !selectedColor || isOutOfStock) return
    const size = visibleSizes.find(s => s.id === selectedSizeId)
    if (!size) return

    const { clearCart, addItem } = useCartStore.getState()
    clearCart()
    addItem({
      product_id: product.id,
      product_name: product.name,
      color_id: selectedColor.id,
      color_name: selectedColor.name,
      color_hex: selectedColor.hex_code,
      color_image_url: colorImages[0] ?? selectedColor.image_url,
      size_id: size.id,
      size_label: size.label,
      quantity: 1,
      price: product.price,
    })

    setBuyNowOpen(true)
  }

  return (
    <div className="min-h-screen bg-[#FFFDF9]">

      {/* Breadcrumb */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
        <div className="flex items-center gap-2 text-sm font-body text-muted">
          <Link href="/" className="hover:text-brand transition-colors">الرئيسية</Link>
          <ChevronLeft size={14} className="text-border" />
          <Link href="/#products" className="hover:text-brand transition-colors">التشكيلة</Link>
          <ChevronLeft size={14} className="text-border" />
          <span className="text-brand font-bold truncate max-w-[150px]">{product.name}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 pb-16">
        <div className="flex flex-col lg:flex-row-reverse gap-8 lg:gap-12">

          {/* ── IMAGES SECTION ── */}
          <div className="lg:w-[55%]">

            {/* Mobile: Full-width carousel */}
            <div className="lg:hidden">
              <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                {colorImages.length > 0 ? (
                  <img
                    src={colorImages[currentImageIndex]}
                    alt={product.name}
                    className="w-full h-full object-cover transition-opacity duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-heading font-black text-6xl text-border">M</span>
                  </div>
                )}

                {isOutOfStock && (
                  <span
                    className="absolute bottom-4 right-4 left-4 z-10 text-center font-heading font-black text-xs px-4 py-2 rounded-full"
                    style={{
                      background: 'rgba(26,20,16,0.86)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255,255,255,0.22)',
                    }}
                  >
                    المنتج غير متوفر
                  </span>
                )}

                {colorImages.length > 1 && (
                  <>
                    <button
                      onClick={() => setCurrentImageIndex(i => (i + 1) % colorImages.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm"
                    >
                      <ChevronLeft size={18} className="text-brand" />
                    </button>
                    <button
                      onClick={() => setCurrentImageIndex(i => (i - 1 + colorImages.length) % colorImages.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center shadow-sm"
                    >
                      <ChevronRight size={18} className="text-brand" />
                    </button>
                  </>
                )}
              </div>

              {colorImages.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-3">
                  {colorImages.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentImageIndex(i)}
                      className="transition-all duration-200 rounded-full"
                      style={{
                        width: i === currentImageIndex ? '20px' : '6px',
                        height: '6px',
                        backgroundColor: i === currentImageIndex ? '#1a1a1a' : '#E8E4DF',
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Desktop: Main image + thumbnails */}
            <div className="hidden lg:flex gap-3">
              {colorImages.length > 1 && (
                <div className="flex flex-col gap-2 w-20 flex-shrink-0">
                  {colorImages.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentImageIndex(i)}
                      className="aspect-square rounded-xl overflow-hidden border-2 transition-all duration-200"
                      style={{ borderColor: i === currentImageIndex ? '#1a1a1a' : 'transparent' }}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface">
                {colorImages.length > 0 ? (
                  <img
                    src={colorImages[currentImageIndex]}
                    alt={product.name}
                    className="w-full h-full object-cover transition-opacity duration-300"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <span className="font-heading font-black text-6xl text-border">M</span>
                  </div>
                )}

                {isOutOfStock && (
                  <span
                    className="absolute bottom-4 right-4 left-4 z-10 text-center font-heading font-black text-sm px-4 py-2 rounded-full"
                    style={{
                      background: 'rgba(26,20,16,0.86)',
                      color: '#FFFFFF',
                      border: '1px solid rgba(255,255,255,0.22)',
                    }}
                  >
                    المنتج غير متوفر
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── INFO SECTION ── */}
          <div className="lg:w-[45%] flex flex-col gap-6">

            {/* Name & Price */}
            <div>
              <h1 className="font-heading font-black text-2xl lg:text-3xl text-brand text-right mb-3">
                {product.name}
              </h1>
              {hasDiscount(product.price, product.original_price) ? (
                <div className="flex flex-col items-end gap-1">
                  <div className="flex items-center gap-3">
                    <span
                      className="font-heading font-black text-xs text-white px-2.5 py-1 rounded-full"
                      style={{ backgroundColor: '#8B1A2E' }}
                    >
                      -{getDiscountPercent(product.price, product.original_price)}% تخفيض
                    </span>
                    <span className="font-body text-sm text-muted line-through">
                      {product.original_price.toLocaleString('ar-DZ')} دج
                    </span>
                  </div>
                  <p className="font-heading font-black text-3xl text-accent text-right">
                    {product.price.toLocaleString('ar-DZ')} دج
                  </p>
                </div>
              ) : (
                <p className="font-heading font-black text-2xl text-accent text-right">
                  {product.price.toLocaleString('ar-DZ')} دج
                </p>
              )}
            </div>

            {/* Colors */}
            {visibleColors.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-heading font-bold text-brand">{selectedColor?.name}</span>
                  <span className="text-xs text-muted font-body">اللون</span>
                </div>
                <div className="flex flex-row-reverse gap-2 flex-wrap">
                  {visibleColors.map(color => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => handleColorChange(color.id)}
                      className="w-9 h-9 rounded-full border-2 transition-all duration-200"
                      style={{
                        backgroundColor: color.hex_code,
                        borderColor: selectedColorId === color.id ? '#1a1a1a' : 'transparent',
                        transform: selectedColorId === color.id ? 'scale(1.15)' : 'scale(1)',
                        boxShadow: selectedColorId === color.id ? '0 0 0 2px #fff, 0 0 0 4px #1a1a1a' : 'none',
                      }}
                      title={color.name}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Sizes */}
            {visibleSizes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-heading font-bold text-brand">
                    {selectedSizeId
                      ? visibleSizes.find(s => s.id === selectedSizeId)?.label
                      : 'اختاري مقاساً'}
                  </span>
                  <span className="text-xs text-muted font-body">المقاس</span>
                </div>
                <div className="flex flex-row-reverse flex-wrap gap-2">
                  {visibleSizes.map(size => (
                    <button
                      key={size.id}
                      type="button"
                      onClick={() => setSelectedSizeId(size.id)}
                      className="rounded-xl px-4 py-2 text-sm font-heading font-bold border-2 transition-all duration-200"
                      style={{
                        backgroundColor: selectedSizeId === size.id ? '#1a1a1a' : '#ffffff',
                        color: selectedSizeId === size.id ? '#ffffff' : '#1a1a1a',
                        borderColor: selectedSizeId === size.id ? '#1a1a1a' : '#E8E4DF',
                      }}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Add to cart */}
            <button
              type="button"
              onClick={handleAdd}
              disabled={!selectedSizeId || added || isOutOfStock}
              className="w-full h-14 rounded-2xl font-heading font-black text-base transition-all duration-200 flex items-center justify-center gap-2"
              style={{
                backgroundColor: added
                  ? '#16a34a'
                  : selectedSizeId && !isOutOfStock
                    ? '#1a1a1a'
                    : '#E8E4DF',
                color: (selectedSizeId && !isOutOfStock) || added ? '#ffffff' : '#6B6B6B',
                cursor: !selectedSizeId || isOutOfStock ? 'not-allowed' : 'pointer',
              }}
            >
              {added ? (
                <><Check size={18} /> تمت الإضافة</>
              ) : isOutOfStock ? (
                'غير متوفر حالياً'
              ) : selectedSizeId ? (
                <><ShoppingBag size={18} /> إضافة للسلة</>
              ) : (
                'اختاري المقاس أولاً'
              )}
            </button>

            {/* Buy now */}
            <button
              type="button"
              onClick={handleBuyNow}
              disabled={!selectedSizeId || isOutOfStock}
              className="w-full h-14 rounded-2xl font-heading font-black text-base transition-all duration-200 flex items-center justify-center gap-2 border-2"
              style={{
                backgroundColor: 'transparent',
                color: selectedSizeId && !isOutOfStock ? '#8B1A2E' : '#6B6B6B',
                borderColor: selectedSizeId && !isOutOfStock ? '#8B1A2E' : '#E8E4DF',
                cursor: !selectedSizeId || isOutOfStock ? 'not-allowed' : 'pointer',
              }}
            >
              {isOutOfStock ? 'غير متوفر حالياً' : 'اطلبي الآن'}
            </button>
            {product.description && (
              <div className="border-t border-border pt-6">
                <h3 className="font-heading font-bold text-base text-brand text-right mb-3">
                  تفاصيل المنتج
                </h3>
                <p className="font-body text-muted text-sm leading-relaxed text-right whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            )}

            {/* Shipping & Payment & Policy */}
            <div className="border-t border-border pt-6 space-y-4">

              {/* Shipping */}
              <div className="flex items-start gap-3 justify-right">
                <div className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B1A2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="3" width="15" height="13" rx="1" />
                    <path d="M16 8h4l3 5v3h-7V8z" />
                    <circle cx="5.5" cy="18.5" r="2.5" />
                    <circle cx="18.5" cy="18.5" r="2.5" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold text-sm text-brand mb-0.5">
                    الشحن عبر World Express
                  </p>
                  <p className="font-body text-xs text-muted">
                    توصيل لجميع ولايات الجزائر . 
                  </p>
                </div>

              </div>

              {/* Payment */}
              <div className="flex items-start gap-3 justify-right">
                <div className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center flex-shrink-0">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B1A2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="1" y="4" width="22" height="16" rx="2" />
                    <line x1="1" y1="10" x2="23" y2="10" />
                  </svg>
                </div>
                <div className="text-right">
                  <p className="font-heading font-bold text-sm text-brand mb-0.5">
طرق الدفع
                  </p>
                  <p className="font-body text-xs text-muted">
الدفع عند الاستلام
                  </p>
                </div>

              </div>

              {/* Store Policy */}
              {storePolicy && (
                <div className="flex items-start gap-3 justify-right">
                  <div className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center flex-shrink-0">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B1A2E" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <div className="text-right">
                    <p className="font-heading font-bold text-sm text-brand mb-0.5">
                      سياسة المتجر
                    </p>
                    <p className="font-body text-xs text-muted leading-relaxed">
                      {storePolicy}
                    </p>
                  </div>

                </div>
              )}

            </div>

          </div>
        </div>
      </div>

      <Modal
        isOpen={buyNowOpen}
        onClose={() => setBuyNowOpen(false)}
        title="تفاصيل الطلب"
      >
        <OrderForm onSuccess={() => setBuyNowOpen(false)} />
      </Modal>
    </div>
  )
}
