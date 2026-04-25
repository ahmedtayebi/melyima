'use client'

import { useEffect, useRef, useState } from 'react'
import { Star, MessageSquare, ChevronDown, ChevronUp, X } from 'lucide-react'
import { motion, useInView, AnimatePresence, useReducedMotion } from 'framer-motion'
import ReviewForm from './ReviewForm'
import type { Review } from '@/lib/types'

// ─── Design tokens (Desert Gold Editorial) ────────────────────────────────────
const ACCENT  = '#B8872E'
const ACCENT2 = '#D4A94C'
const BRAND   = '#1A1410'
const MUTED   = '#7A6A58'
const BORDER  = '#E8DDD0'
const EASE: [number,number,number,number] = [0.25, 0.46, 0.45, 0.94]

// ─── Stars ────────────────────────────────────────────────────────────────────
function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${rating} نجوم من 5`}>
      {[1,2,3,4,5].map(s => (
        <Star
          key={s}
          size={size}
          fill={rating >= s ? ACCENT : 'none'}
          stroke={rating >= s ? ACCENT : BORDER}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}

// ─── Rating Summary (avg + distribution) ─────────────────────────────────────
function RatingSummary({ reviews }: { reviews: Review[] }) {
  const ref  = useRef<HTMLDivElement>(null)
  const show = useInView(ref, { once: true, margin: '-40px' })
  const avg  = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
  const dist = [5,4,3,2,1].map(s => {
    const count = reviews.filter(r => r.rating === s).length
    return { s, count, pct: (count / reviews.length) * 100 }
  })

  return (
    <div ref={ref} className="flex items-center gap-8 flex-wrap">
      {/* Big avg number */}
      <div className="text-center flex-shrink-0">
        <p className="font-heading font-black text-5xl tabular-nums leading-none" style={{ color: BRAND }}>
          {avg.toFixed(1)}
        </p>
        <div className="mt-1.5 flex justify-center">
          <Stars rating={Math.round(avg)} size={15} />
        </div>
        <p className="font-body text-xs mt-1.5" style={{ color: MUTED }}>
          {reviews.length} تقييم
        </p>
      </div>

      {/* Distribution bars */}
      <div className="flex-1 min-w-[180px] space-y-2">
        {dist.map(({ s, count, pct }) => (
          <div key={s} className="flex items-center gap-2.5">
            <span className="font-heading font-bold text-[11px] w-3 text-left tabular-nums flex-shrink-0" style={{ color: MUTED }}>
              {s}
            </span>
            <Star size={9} fill={ACCENT} stroke={ACCENT} strokeWidth={1.5} className="flex-shrink-0" />
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: BORDER }}>
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={show ? { width: `${pct}%` } : { width: 0 }}
                transition={{ duration: 0.7, delay: (5 - s) * 0.08, ease: EASE }}
                style={{ background: `linear-gradient(to left, ${ACCENT}, ${ACCENT2})` }}
              />
            </div>
            <span className="font-body text-[10px] w-4 tabular-nums text-right flex-shrink-0" style={{ color: MUTED }}>
              {count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Review Card ──────────────────────────────────────────────────────────────
function ReviewCard({
  review,
  index,
  onImageClick,
}: {
  review: Review
  index: number
  onImageClick: (url: string) => void
}) {
  const shouldReduceMotion = useReducedMotion()
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-40px' })
  const [expanded, setExpanded] = useState(false)

  const photos  = review.images?.filter(Boolean) ?? []
  const date    = new Date(review.created_at).toLocaleDateString('ar-DZ', { year: 'numeric', month: 'long' })
  const isLong  = review.comment.length > 150
  const shown   = expanded || !isLong ? review.comment : review.comment.slice(0, 150)

  return (
    <motion.div
      ref={ref}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 18 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.35), ease: EASE }}
      className="mb-5 break-inside-avoid bg-white rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${BORDER}`,
        borderTop: `3px solid ${ACCENT}`,
        boxShadow: '0 2px 20px rgba(26,20,16,0.055)',
      }}
    >
      <div className="p-5">

        {/* Stars + decorative quote watermark */}
        <div className="flex items-start justify-between mb-3">
          <Stars rating={review.rating} size={15} />
          <span
            className="font-heading font-black text-5xl leading-none select-none pointer-events-none"
            style={{ color: `${ACCENT}18`, marginTop: '-4px' }}
            aria-hidden="true"
          >
            "
          </span>
        </div>

        {/* Comment */}
        <p
          className="font-body text-sm leading-relaxed text-right"
          style={{ color: `${BRAND}CC` }}
        >
          {shown}
          {isLong && !expanded && '…'}
        </p>
        {isLong && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 mt-1.5 font-heading font-bold text-[11px] transition-opacity hover:opacity-70"
            style={{ color: ACCENT }}
            aria-expanded={expanded}
          >
            {expanded
              ? <><ChevronUp size={11} strokeWidth={2.5} /> عرض أقل</>
              : <><ChevronDown size={11} strokeWidth={2.5} /> عرض المزيد</>}
          </button>
        )}

        {/* Photos */}
        {photos.length > 0 && (
          <div className="flex gap-2 mt-4 justify-end flex-wrap">
            {photos.map((url, i) => (
              <button
                key={i}
                onClick={() => onImageClick(url)}
                className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 hover:opacity-85 transition-opacity duration-150 cursor-pointer"
                style={{ border: `1px solid ${BORDER}` }}
                aria-label={`فتح الصورة ${i + 1}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Author row */}
        <div
          className="flex items-center justify-end gap-3 mt-4 pt-4"
          style={{ borderTop: `1px solid ${BORDER}` }}
        >
          <div className="text-right">
            <p className="font-heading font-bold text-sm" style={{ color: BRAND }}>
              {review.customer_name}
            </p>
            <p className="font-body text-xs" style={{ color: MUTED }}>{date}</p>
          </div>
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-heading font-black text-sm"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: BRAND }}
            aria-hidden="true"
          >
            {review.customer_name.charAt(0)}
          </div>
        </div>

      </div>
    </motion.div>
  )
}

// ─── Section ──────────────────────────────────────────────────────────────────
export default function ReviewsSection({ reviews }: { reviews: Review[] }) {
  const sectionRef        = useRef<HTMLElement>(null)
  const inView            = useInView(sectionRef, { once: true, margin: '-80px' })
  const shouldReduceMotion = useReducedMotion()
  const [showForm, setShowForm] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)

  // Escape key closes lightbox
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [lightbox])

  return (
    <section
      ref={sectionRef}
      id="reviews"
      className="w-full py-20 lg:py-28 relative overflow-hidden"
      style={{ background: 'linear-gradient(180deg, #FFFBF4 0%, #F9F4EE 40%, #F5EBD8 100%)' }}
    >

      {/* ── Ambient glow orbs ── */}
      <div
        className="absolute -top-32 -right-32 w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(212,169,76,0.08) 0%, transparent 70%)', filter: 'blur(60px)' }}
      />
      <div
        className="absolute -bottom-32 left-0 w-[420px] h-[420px] rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(184,135,46,0.06) 0%, transparent 70%)', filter: 'blur(50px)' }}
      />

      {/* ── Ambient ring ── */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full pointer-events-none"
        style={{ border: '1px solid rgba(184,135,46,0.05)' }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 relative">

        {/* ── Section header ───────────────────────────────────────────────── */}
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.65, ease: EASE }}
          className="mb-12"
        >
          <div className="flex items-end justify-between gap-4 flex-wrap mb-6">

            {/* Left: titles */}
            <div className="text-right">
              {/* Eyebrow */}
              <div className="flex items-center gap-2 mb-3">
                <div className="h-px w-6" style={{ background: 'linear-gradient(to right, transparent, rgba(184,135,46,0.5))' }} />
                <MessageSquare size={13} style={{ color: ACCENT }} />
                <span
                  className="font-heading font-bold text-xs tracking-widest uppercase"
                  style={{ color: ACCENT }}
                >
                  آراء العملاء
                </span>
              </div>

              <h2 className="font-heading font-black text-3xl sm:text-4xl mb-3" style={{ color: BRAND }}>
                ماذا قالت زبوناتنا
              </h2>

              {/* Gold accent underline */}
              <div
                className="h-[3px] w-20 rounded-full"
                style={{ background: `linear-gradient(to left, ${ACCENT}, ${ACCENT2}44)` }}
              />
            </div>

            {/* Right: CTA */}
            <motion.button
              onClick={() => setShowForm(s => !s)}
              whileHover={shouldReduceMotion ? {} : { scale: 1.04 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.96 }}
              className="flex items-center gap-2 px-6 py-3 rounded-full font-heading font-bold text-sm transition-all duration-300 flex-shrink-0"
              style={{
                background: showForm ? `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` : 'transparent',
                color:      showForm ? BRAND : ACCENT,
                border:     `1.5px solid ${ACCENT}`,
              }}
              aria-expanded={showForm}
              aria-controls="review-form-panel"
            >
              {showForm ? 'إغلاق' : 'أضيفي رأيك'}
            </motion.button>
          </div>

          {/* Rating summary */}
          {reviews.length > 0 && (
            <div className="pt-6" style={{ borderTop: `1px solid ${BORDER}` }}>
              <RatingSummary reviews={reviews} />
            </div>
          )}
        </motion.div>

        {/* ── Review form ──────────────────────────────────────────────────── */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              id="review-form-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="overflow-hidden mb-12"
            >
              <div
                className="rounded-3xl p-6 lg:p-8 max-w-lg"
                style={{ background: '#F9F4EE', border: `1px solid ${BORDER}` }}
              >
                <h3 className="font-heading font-black text-xl text-right mb-6" style={{ color: BRAND }}>
                  شاركينا تجربتك
                </h3>
                <ReviewForm />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Reviews grid / empty state ────────────────────────────────── */}
        {reviews.length === 0 ? (

          <motion.div
            initial={shouldReduceMotion ? false : { opacity: 0, y: 20 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
            className="flex flex-col items-center gap-5 py-20 text-center"
          >
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(184,135,46,0.1)' }}
            >
              <Star size={32} style={{ color: ACCENT }} />
            </div>
            <div>
              <p className="font-heading font-black text-xl mb-1.5" style={{ color: BRAND }}>
                لا توجد تقييمات بعد
              </p>
              <p className="font-body text-sm mb-6" style={{ color: MUTED }}>
                كوني أول من تشارك تجربتها!
              </p>
              <button
                onClick={() => { setShowForm(true); document.getElementById('review-form-panel')?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }}
                className="px-7 py-3 rounded-full font-heading font-bold text-sm transition-opacity hover:opacity-90"
                style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: BRAND }}
              >
                أضيفي رأيك الآن
              </button>
            </div>
          </motion.div>

        ) : (

          /* CSS masonry columns — no JavaScript layout needed */
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-5">
            {reviews.map((review, i) => (
              <ReviewCard
                key={review.id}
                review={review}
                index={i}
                onImageClick={setLightbox}
              />
            ))}
          </div>

        )}
      </div>

      {/* ── Lightbox ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setLightbox(null)}
            role="dialog"
            aria-modal="true"
            aria-label="عرض الصورة"
          >
            <motion.img
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              src={lightbox}
              alt=""
              className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl"
              onClick={e => e.stopPropagation()}
            />
            <button
              type="button"
              className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.1)' }}
              onClick={() => setLightbox(null)}
              aria-label="إغلاق"
            >
              <X size={18} className="text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

    </section>
  )
}
