'use client'

import { useRef } from 'react'
import Link from 'next/link'
import { Tag, ArrowLeft } from 'lucide-react'
import { motion, useInView } from 'framer-motion'
import ProductCard from './ProductCard'
import type { Product } from '@/lib/types'

export default function DiscountsSection({ products }: { products: Product[] }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  if (products.length === 0) return null

  return (
    <section
      ref={ref}
      id="discounts"
      className="w-full py-20 relative overflow-hidden"
      style={{ background: 'linear-gradient(165deg, #FFF6E8 0%, #FFF0D6 50%, #FFF6E8 100%)' }}
    >
      {/* Decorative background blob */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                   w-[600px] h-[600px] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(184,135,46,0.08) 0%, transparent 70%)',
          filter: 'blur(50px)',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col items-center text-center mb-10"
        >
          {/* Eyebrow */}
          <div className="flex items-center gap-2 mb-3">
            <div
              className="h-px w-6"
              style={{ background: 'linear-gradient(90deg, transparent, rgba(184,135,46,0.5))' }}
            />
            <Tag size={13} style={{ color: '#B8872E' }} />
            <span
              className="font-heading font-bold text-xs tracking-[0.18em] uppercase"
              style={{ color: '#B8872E' }}
            >
              عروض خاصة
            </span>
            <Tag size={13} style={{ color: '#B8872E' }} />
            <div
              className="h-px w-6"
              style={{ background: 'linear-gradient(90deg, rgba(184,135,46,0.5), transparent)' }}
            />
          </div>

          <h2
            className="font-heading font-black text-3xl sm:text-4xl mb-2"
            style={{ color: '#1A1410' }}
          >
            تخفيضات مميزة
          </h2>
          <p className="font-body text-sm mb-4" style={{ color: '#7A6A58' }}>
            أسعار استثنائية على أجمل التشكيلات
          </p>

          <Link href="/discounts" prefetch={false}>
            <motion.span
              whileHover={{ gap: '10px' }}
              className="inline-flex items-center gap-1.5 font-heading font-bold text-sm transition-all duration-200"
              style={{ color: '#B8872E' }}
            >
              عرض الكل
              <ArrowLeft size={14} />
            </motion.span>
          </Link>
        </motion.div>

        {/* Products grid */}
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-5">
          {products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 40 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.55,
                delay: 0.1 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </div>

      </div>
    </section>
  )
}
