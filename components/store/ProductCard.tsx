'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useCartStore } from '@/lib/cart-store'
import { getDiscountPercent, hasDiscount } from '@/lib/discount'
import type { Product } from '@/lib/types'

export default function ProductCard({ product }: { product: Product }) {
  const visibleColors = product.product_colors?.filter(c => c.is_visible) ?? []
  const visibleSizes = product.product_sizes
    ?.filter(s => s.is_visible)
    .filter((s, i, arr) => arr.findIndex(t => t.label === s.label) === i) ?? []

  const [selectedColorId, setSelectedColorId] = useState(visibleColors[0]?.id ?? '')
  const [selectedSizeId, setSelectedSizeId] = useState('')
  const [added, setAdded] = useState(false)
  const [imageHovered, setImageHovered] = useState(false)

  const addItem = useCartStore((s) => s.addItem)
  const selectedColor = visibleColors.find(c => c.id === selectedColorId) ?? visibleColors[0]

  const handleAdd = () => {
    if (!selectedSizeId || !selectedColor) return
    const size = visibleSizes.find(s => s.id === selectedSizeId)
    if (!size) return
    addItem({
      product_id: product.id,
      product_name: product.name,
      color_id: selectedColor.id,
      color_name: selectedColor.name,
      color_hex: selectedColor.hex_code,
      color_image_url: selectedColor.image_url,
      size_id: size.id,
      size_label: size.label,
      quantity: 1,
      price: product.price,
    })
    setAdded(true)
    setTimeout(() => setAdded(false), 1600)
  }

  const isOnSale = hasDiscount(product.price, product.original_price)
  const discountPercent = getDiscountPercent(product.price, product.original_price)
  const isNew = new Date(product.created_at) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  return (
    <motion.div
      whileHover={{ y: -3 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="rounded-2xl overflow-hidden flex flex-row-reverse h-48"
      style={{
        background: '#FFFDF9',
        border: '1px solid #EAE0D4',
        boxShadow: '0 2px 12px rgba(14,11,9,0.06)',
      }}
    >

      {/* RIGHT — Image */}
      <Link
        href={`/products/${product.id}`}
        className="w-[42%] shrink-0 relative overflow-hidden"
        style={{ background: '#F4ECE0' }}
        onMouseEnter={() => setImageHovered(true)}
        onMouseLeave={() => setImageHovered(false)}
      >
        {selectedColor?.image_url ? (
          <motion.div
            animate={{ scale: imageHovered ? 1.07 : 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full h-full relative"
          >
            <Image
              src={selectedColor.image_url}
              alt={product.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 42vw, 280px"
            />
          </motion.div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="font-heading font-black text-5xl" style={{ color: '#EAE0D4' }}>
              {product.name.charAt(0)}
            </span>
          </div>
        )}

        {/* Badge */}
        {isOnSale ? (
          <span
            className="absolute top-2 right-2 z-10 font-heading font-black text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: 'linear-gradient(135deg, #C8963C, #E8B45A)', color: '#0E0B09' }}
          >
            -{discountPercent}%
          </span>
        ) : isNew ? (
          <span
            className="absolute top-2 right-2 z-10 font-heading font-black text-[10px] px-2 py-0.5 rounded-full text-white"
            style={{ background: '#0E0B09' }}
          >
            جديد
          </span>
        ) : null}
      </Link>

      {/* LEFT — Content */}
      <div className="flex-1 flex flex-col justify-between p-3.5 overflow-hidden">

        {/* Name + colors + sizes */}
        <div>
          <p className="font-heading font-black text-base text-brand text-right leading-tight line-clamp-2 mb-2">
            {product.name}
          </p>

          {/* Color swatches */}
          {visibleColors.length > 0 && (
            <div className="flex flex-row-reverse gap-1.5 mb-2">
              {visibleColors.slice(0, 5).map((color) => (
                <motion.button
                  key={color.id}
                  type="button"
                  onClick={() => setSelectedColorId(color.id)}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-5 h-5 rounded-full border-2 transition-all duration-200"
                  style={{
                    backgroundColor: color.hex_code,
                    borderColor: selectedColorId === color.id ? '#C8963C' : 'transparent',
                    boxShadow: selectedColorId === color.id ? '0 0 0 2px rgba(200,150,60,0.3)' : 'none',
                  }}
                  title={color.name}
                />
              ))}
              {visibleColors.length > 5 && (
                <span className="text-[10px] text-muted self-center">+{visibleColors.length - 5}</span>
              )}
            </div>
          )}

          {/* Size pills */}
          {visibleSizes.length > 0 && (
            <div className="flex flex-row-reverse flex-wrap gap-1">
              {visibleSizes.map((size) => (
                <motion.button
                  key={size.id}
                  type="button"
                  onClick={() => setSelectedSizeId(size.id)}
                  whileTap={{ scale: 0.93 }}
                  className="rounded-full px-2 py-0.5 text-[11px] font-heading font-bold border transition-all duration-200"
                  style={{
                    background: selectedSizeId === size.id ? '#0E0B09' : 'transparent',
                    color: selectedSizeId === size.id ? '#FFFFFF' : '#8A7B6C',
                    borderColor: selectedSizeId === size.id ? '#0E0B09' : '#EAE0D4',
                  }}
                >
                  {size.label}
                </motion.button>
              ))}
            </div>
          )}
        </div>

        {/* Price + button */}
        <div className="flex flex-row-reverse items-center justify-between gap-2 mt-2">
          {isOnSale ? (
            <div className="flex flex-col items-end">
              <span className="font-heading font-black text-base whitespace-nowrap leading-tight"
                    style={{ color: '#C8963C' }}>
                {product.price.toLocaleString('ar-DZ')} دج
              </span>
              <span className="font-body text-[11px] text-muted line-through whitespace-nowrap leading-tight">
                {product.original_price.toLocaleString('ar-DZ')} دج
              </span>
            </div>
          ) : (
            <p className="font-heading font-black text-base whitespace-nowrap" style={{ color: '#C8963C' }}>
              {product.price.toLocaleString('ar-DZ')} دج
            </p>
          )}

          <motion.button
            type="button"
            onClick={handleAdd}
            disabled={!selectedSizeId || added}
            whileHover={selectedSizeId && !added ? { scale: 1.04 } : {}}
            whileTap={selectedSizeId && !added ? { scale: 0.93 } : {}}
            className="rounded-xl px-3 h-9 text-xs font-heading font-bold whitespace-nowrap transition-all duration-200"
            style={{
              background: added
                ? '#16a34a'
                : selectedSizeId
                  ? 'linear-gradient(135deg, #C8963C, #E8B45A)'
                  : 'rgba(200,150,60,0.08)',
              color: added ? '#FFFFFF' : selectedSizeId ? '#0E0B09' : '#8A7B6C',
              cursor: !selectedSizeId || added ? 'default' : 'pointer',
            }}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={added ? 'done' : 'add'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-1"
              >
                {added ? (
                  <><CheckCircle2 size={13} /> تمت</>
                ) : selectedSizeId ? (
                  'أضيفي للسلة'
                ) : (
                  'اختاري المقاس'
                )}
              </motion.span>
            </AnimatePresence>
          </motion.button>
        </div>

      </div>
    </motion.div>
  )
}
