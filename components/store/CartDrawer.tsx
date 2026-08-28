'use client'

import { useState } from 'react'
import { useLockScroll } from '@/lib/use-lock-scroll'
import Image from 'next/image'
import { X, ShoppingBag, Minus, Plus, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useCartStore } from '@/lib/cart-store'
import { getImageUrl } from '@/lib/storage'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import OrderForm from './OrderForm'

interface CartDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export default function CartDrawer({ isOpen, onClose }: CartDrawerProps) {
  const [orderFormOpen, setOrderFormOpen] = useState(false)

  const items = useCartStore((state) => state.items)
  const removeItem = useCartStore((state) => state.removeItem)
  const updateQuantity = useCartStore((state) => state.updateQuantity)
  const clearCart = useCartStore((state) => state.clearCart)
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)

  useLockScroll(isOpen)

  const handleOrderSuccess = () => {
    clearCart()
    setOrderFormOpen(false)
    onClose()
  }

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
            />

            {/* Drawer panel — slides in from physical left */}
            <motion.div
              className="fixed inset-y-0 left-0 w-full max-w-sm bg-white z-50 flex flex-col shadow-2xl"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0.3, right: 0 }}
              onDragEnd={(_, info) => {
                if (info.offset.x < -80) onClose()
              }}
            >
              {/* ── Header ── */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-border flex-shrink-0">
                {/* Title + badge — right side in RTL (first child) */}
                <div className="flex items-center gap-2">
                  <h2 className="font-heading font-bold text-lg text-brand">
                    سلة التسوق
                  </h2>
                  {itemCount > 0 && (
                    <span className="bg-accent text-white text-[11px] font-bold font-heading px-2 py-0.5 rounded-full leading-none">
                      {itemCount}
                    </span>
                  )}
                </div>
                {/* Close — left side in RTL (last child) */}
                <button
                  onClick={onClose}
                  className="p-3 min-w-[44px] min-h-[44px] rounded-xl text-muted hover:text-brand hover:bg-surface transition-colors flex items-center justify-center"
                  aria-label="إغلاق"
                >
                  <X size={20} />
                </button>
              </div>

              {/* ── Items ── */}
              {items.length === 0 ? (
                // Empty state
                <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
                  <div className="w-16 h-16 rounded-xl bg-surface border border-border flex items-center justify-center text-muted">
                    <ShoppingBag size={28} />
                  </div>
                  <div>
                    <p className="font-heading font-bold text-base text-brand mb-1">
                      سلتك فارغة
                    </p>
                    <p className="text-sm text-muted font-body">
                      أضيفي منتجاً لمتابعة التسوق
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={onClose}>
                    تصفحي المنتجات
                  </Button>
                </div>
              ) : (
                // Items list
                <div className="flex-1 overflow-y-auto">
                  {items.map((item, index) => (
                    <div key={`${item.product_id}-${item.color_id}-${item.size_id}`}>
                      <div className="flex items-start gap-3 px-4 py-4">

                        {/* Image — right side in RTL (first child) */}
                        <div className="relative w-[72px] h-[72px] rounded-xl overflow-hidden flex-shrink-0">
                          {getImageUrl(item.color_image_url) ? (
                            <Image
                              src={getImageUrl(item.color_image_url)!}
                              alt={item.product_name}
                              fill
                              unoptimized
                              sizes="72px"
                              className="object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full"
                              style={{ backgroundColor: item.color_hex }}
                            />
                          )}
                        </div>

                        {/* Details — middle */}
                        <div className="flex-1 min-w-0">
                          <p className="font-heading font-bold text-sm text-brand leading-snug mb-1.5 truncate">
                            {item.product_name}
                          </p>

                          {/* Color swatch + name + size pill */}
                          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
                            <span
                              className="w-3.5 h-3.5 rounded-full flex-shrink-0 border border-black/10"
                              style={{ backgroundColor: item.color_hex }}
                            />
                            <span className="text-xs text-muted font-body">
                              {item.color_name}
                            </span>
                            <span className="text-border text-xs select-none">·</span>
                            <span className="text-[11px] font-heading font-bold text-brand border border-border rounded-full px-2 py-0.5 leading-none">
                              {item.size_label}
                            </span>
                          </div>

                          {/* Quantity — dir="ltr" for universal +/− layout */}
                          <div className="flex items-center gap-1.5" dir="ltr">
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.product_id,
                                  item.color_id,
                                  item.size_id,
                                  item.quantity - 1
                                )
                              }
                              className="w-[30px] h-[30px] rounded-lg border border-border text-muted hover:border-brand hover:text-brand transition-colors flex items-center justify-center"
                              aria-label="تقليل"
                            >
                              <Minus size={11} />
                            </button>
                            <span className="w-7 text-center font-heading font-bold text-sm text-brand select-none tabular-nums">
                              {item.quantity}
                            </span>
                            <button
                              onClick={() =>
                                updateQuantity(
                                  item.product_id,
                                  item.color_id,
                                  item.size_id,
                                  item.quantity + 1
                                )
                              }
                              className="w-[30px] h-[30px] rounded-lg border border-border text-muted hover:border-brand hover:text-brand transition-colors flex items-center justify-center"
                              aria-label="زيادة"
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        </div>

                        {/* Remove — left side in RTL (last child) */}
                        <button
                          onClick={() =>
                            removeItem(item.product_id, item.color_id, item.size_id)
                          }
                          className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0 mt-0.5"
                          aria-label="حذف"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      {/* Separator between items */}
                      {index < items.length - 1 && (
                        <div className="border-b border-border mx-4" />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Footer ── */}
              {items.length > 0 && (
                <div className="border-t border-border px-4 pt-4 pb-5 flex-shrink-0">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted font-body">إجمالي القطع</span>
                    <span className="font-heading font-bold text-brand">
                      {itemCount} قطعة
                    </span>
                  </div>
                  <div className="border-t border-border mb-4" />
                  <Button
                    fullWidth
                    size="lg"
                    onClick={() => setOrderFormOpen(true)}
                  >
                    تأكيد الطلب
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Order form — z-50 from Modal component, appears above drawer */}
      <Modal
        isOpen={orderFormOpen}
        onClose={() => setOrderFormOpen(false)}
        title="تفاصيل الطلب"
      >
        <OrderForm onSuccess={handleOrderSuccess} />
      </Modal>
    </>
  )
}
