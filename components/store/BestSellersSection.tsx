'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { TrendingUp, ArrowLeft } from 'lucide-react'
import { motion, useInView } from 'framer-motion'
import ProductCard from './ProductCard'
import type { Product } from '@/lib/types'

export default function BestSellersSection({ products }: { products: Product[] }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  if (products.length === 0) return null

  return (
    <section
      ref={ref}
      id="best"
      className="w-full py-20"
      style={{ background: 'linear-gradient(180deg, #F9F4EE 0%, #F5EBD8 100%)' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex flex-col items-center text-center mb-10"
        >
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-3">
            <div className="h-px w-6 bg-gradient-to-r from-transparent to-amber-600/50" />
            <TrendingUp size={14} style={{ color: '#C8963C' }} />
            <span className="font-heading font-bold text-xs tracking-widest uppercase" style={{ color: '#C8963C' }}>
              الأكثر مبيعاً
            </span>
            <TrendingUp size={14} style={{ color: '#C8963C' }} />
            <div className="h-px w-6 bg-gradient-to-l from-transparent to-amber-600/50" />
          </div>

          <h2 className="font-heading font-black text-3xl sm:text-4xl text-brand mb-2">
            الأكثر طلباً
          </h2>
          <p className="font-body text-muted text-sm mb-4">
            المنتجات الأكثر طلباً من زبوناتنا
          </p>

          <Link href="/best-sellers" prefetch={false}>
            <motion.span
              whileHover={{ gap: '10px' }}
              className="inline-flex items-center gap-1.5 font-heading font-bold text-sm transition-all duration-200"
              style={{ color: '#C8963C' }}
            >
              عرض الكل
              <ArrowLeft size={14} />
            </motion.span>
          </Link>
        </motion.div>

        {/* Products */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-5">
          {products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.55, delay: 0.1 + i * 0.08, ease: [0.25, 0.46, 0.45, 0.94] }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
