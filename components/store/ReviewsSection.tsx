'use client'

import { useRef, useState } from 'react'
import { Star, ChevronLeft, ChevronRight, MessageSquare, X } from 'lucide-react'
import { motion, useInView, AnimatePresence } from 'framer-motion'
import ReviewForm from './ReviewForm'
import type { Review } from '@/lib/types'

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex flex-row-reverse gap-0.5">
      {[1, 2, 3, 4, 5].map(star => (
        <Star
          key={star}
          size={14}
          fill={rating >= star ? '#C8963C' : 'none'}
          stroke={rating >= star ? '#C8963C' : '#D4C4B0'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}

function ReviewCard({ review, index, onImageClick }: { review: Review; index: number; onImageClick: (url: string) => void }) {
  const date = new Date(review.created_at).toLocaleDateString('ar-DZ', {
    year: 'numeric',
    month: 'long',
  })
  const photos = review.images?.filter(Boolean) ?? []

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ y: -4, boxShadow: '0 12px 40px rgba(200,150,60,0.12)' }}
      className="flex-shrink-0 w-72 sm:w-80 rounded-2xl p-6 flex flex-col gap-4 select-none cursor-default transition-shadow"
      style={{
        background: '#FFFDF9',
        border: '1px solid #EAE0D4',
        boxShadow: '0 2px 16px rgba(14,11,9,0.06)',
      }}
    >
      <StarRating rating={review.rating} />

      <p className="font-body text-brand/80 text-sm leading-relaxed text-right flex-1 line-clamp-4">
        "{review.comment}"
      </p>

      {photos.length > 0 && (
        <div className="flex gap-2 justify-end">
          {photos.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              onClick={() => onImageClick(url)}
              className="w-20 h-20 rounded-lg object-cover cursor-pointer border border-border hover:opacity-90 transition-opacity duration-150 flex-shrink-0"
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
        <div className="text-right">
          <p className="font-heading font-bold text-sm text-brand">{review.customer_name}</p>
          <p className="font-body text-xs text-muted">{date}</p>
        </div>
        <div
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-heading font-black text-sm"
          style={{
            background: 'linear-gradient(135deg, #C8963C, #E8B45A)',
            color: '#0E0B09',
          }}
        >
          {review.customer_name.charAt(0)}
        </div>
      </div>
    </motion.div>
  )
}

export default function ReviewsSection({ reviews }: { reviews: Review[] }) {
  const ref = useRef<HTMLElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })
  const [showForm, setShowForm] = useState(false)
  const [scrollIndex, setScrollIndex] = useState(0)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const visibleCount = 3

  const canPrev = scrollIndex > 0
  const canNext = scrollIndex < reviews.length - visibleCount

  const scroll = (dir: 'prev' | 'next') => {
    setScrollIndex(i =>
      dir === 'next'
        ? Math.min(i + 1, reviews.length - visibleCount)
        : Math.max(i - 1, 0)
    )
  }

  return (
    <section
      ref={ref}
      id="reviews"
      className="w-full py-20 lg:py-28"
      style={{ background: '#FFFDF9' }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="flex items-end justify-between mb-12"
        >
          <div className="text-right">
            {/* Eyebrow */}
            <div className="flex items-center gap-2 mb-3">
              <div className="h-px w-6 bg-gradient-to-r from-transparent to-amber-600/50" />
              <MessageSquare size={13} style={{ color: '#C8963C' }} />
              <span className="font-heading font-bold text-xs tracking-widest uppercase" style={{ color: '#C8963C' }}>
                آراء العملاء
              </span>
            </div>

            <h2 className="font-heading font-black text-3xl sm:text-4xl text-brand mb-2">
              ماذا قالت زبوناتنا
            </h2>
            {reviews.length > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[1,2,3,4,5].map(s => (
                    <Star key={s} size={13} fill="#C8963C" stroke="#C8963C" strokeWidth={1.5} />
                  ))}
                </div>
                <span className="font-body text-sm text-muted">{reviews.length} تقييم</span>
              </div>
            )}
          </div>

          <motion.button
            onClick={() => setShowForm(s => !s)}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full font-heading font-bold text-sm transition-all duration-300 flex-shrink-0"
            style={{
              background: showForm
                ? 'linear-gradient(135deg, #C8963C, #E8B45A)'
                : 'transparent',
              color: showForm ? '#0E0B09' : '#C8963C',
              border: '1.5px solid',
              borderColor: '#C8963C',
            }}
          >
            {showForm ? 'إغلاق' : 'أضيفي رأيك'}
          </motion.button>
        </motion.div>

        {/* Review form */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="overflow-hidden mb-10"
            >
              <div
                className="rounded-2xl p-6 max-w-lg"
                style={{ background: '#F9F4EE', border: '1px solid #EAE0D4' }}
              >
                <h3 className="font-heading font-black text-lg text-brand mb-5 text-right">
                  شاركينا تجربتك
                </h3>
                <ReviewForm />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reviews carousel */}
        {reviews.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                 style={{ background: 'rgba(200,150,60,0.1)' }}>
              <Star size={22} style={{ color: '#C8963C' }} />
            </div>
            <p className="font-body text-muted text-sm">كوني أول من يشارك رأيها!</p>
          </div>
        ) : (
          <>
            {/* Desktop: scrollable with arrows */}
            <div className="hidden lg:block">
              <div className="overflow-hidden">
                <motion.div
                  animate={{ x: scrollIndex * -(320 + 20) }}
                  transition={{ type: 'spring', stiffness: 280, damping: 30 }}
                  className="flex gap-5"
                >
                  {reviews.map((review, i) => (
                    <ReviewCard key={review.id} review={review} index={i} onImageClick={setLightbox} />
                  ))}
                </motion.div>
              </div>

              {reviews.length > visibleCount && (
                <div className="flex gap-3 mt-8 justify-center">
                  <motion.button
                    onClick={() => scroll('prev')}
                    disabled={!canPrev}
                    whileHover={canPrev ? { scale: 1.08 } : {}}
                    whileTap={canPrev ? { scale: 0.93 } : {}}
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-200 disabled:opacity-30"
                    style={{ borderColor: '#C8963C', color: '#C8963C' }}
                  >
                    <ChevronRight size={18} />
                  </motion.button>
                  <motion.button
                    onClick={() => scroll('next')}
                    disabled={!canNext}
                    whileHover={canNext ? { scale: 1.08 } : {}}
                    whileTap={canNext ? { scale: 0.93 } : {}}
                    className="w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all duration-200 disabled:opacity-30"
                    style={{ borderColor: '#C8963C', color: '#C8963C' }}
                  >
                    <ChevronLeft size={18} />
                  </motion.button>
                </div>
              )}
            </div>

            {/* Mobile: horizontal scroll */}
            <div
              className="lg:hidden flex flex-row-reverse gap-4 overflow-x-auto pb-4 snap-x snap-mandatory"
              style={{ scrollbarWidth: 'none' }}
            >
              {reviews.map((review, i) => (
                <div key={review.id} className="snap-start">
                  <ReviewCard review={review} index={i} onImageClick={setLightbox} />
                </div>
              ))}
            </div>
          </>
        )}

      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setLightbox(null)}
          >
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.2 }}
              src={lightbox}
              alt=""
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              type="button"
              className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
              onClick={() => setLightbox(null)}
            >
              <X size={18} className="text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
