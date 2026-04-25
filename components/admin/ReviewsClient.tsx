'use client'

import { useState } from 'react'
import { Star, Check, X, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Review } from '@/lib/types'

const STATUS_CONFIG = {
  pending:  { label: 'قيد المراجعة', badge: 'bg-amber-100 text-amber-800' },
  approved: { label: 'معتمد',        badge: 'bg-green-100 text-green-700' },
  rejected: { label: 'مرفوض',        badge: 'bg-red-100 text-red-700'    },
}

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(s => (
        <Star
          key={s}
          size={14}
          fill={rating >= s ? '#8B1A2E' : 'none'}
          stroke={rating >= s ? '#8B1A2E' : '#E8E4DF'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  )
}

export default function ReviewsClient({ initialReviews }: { initialReviews: Review[] }) {
  const [reviews, setReviews] = useState<Review[]>(initialReviews)
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)

  const supabase = createClient()

  const updateStatus = async (id: string, status: 'approved' | 'rejected') => {
    const { error } = await supabase
      .from('reviews')
      .update({ status })
      .eq('id', id)
    if (!error) {
      setReviews(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    }
  }

  const deleteReview = (id: string) => {
    setConfirmDialog({
      message: 'هل أنت متأكد من حذف هذا التقييم؟',
      onConfirm: async () => {
        setConfirmDialog(null)
        const { error } = await supabase.from('reviews').delete().eq('id', id)
        if (!error) setReviews(prev => prev.filter(r => r.id !== id))
      },
    })
  }

  const filtered = filter === 'all' ? reviews : reviews.filter(r => r.status === filter)

  const stats = {
    all:      reviews.length,
    pending:  reviews.filter(r => r.status === 'pending').length,
    approved: reviews.filter(r => r.status === 'approved').length,
    rejected: reviews.filter(r => r.status === 'rejected').length,
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('ar-DZ', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="font-heading font-black text-2xl text-brand">التقييمات</h1>
        <span className="bg-brand text-white text-xs font-bold font-heading px-2.5 py-1 rounded-full">
          {reviews.length}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          { key: 'pending',  label: 'قيد المراجعة', count: stats.pending  },
          { key: 'approved', label: 'معتمدة',        count: stats.approved },
          { key: 'rejected', label: 'مرفوضة',        count: stats.rejected },
          { key: 'all',      label: 'الكل',          count: stats.all      },
        ] as const).map(({ key, label, count }) => {
          const isActive = filter === key
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className="rounded-xl border-2 p-4 text-right transition-all"
              style={{
                backgroundColor: isActive ? '#8B1A2E' : '#ffffff',
                borderColor: isActive ? '#8B1A2E' : '#E8E4DF',
              }}
            >
              <p
                className="font-heading font-black text-2xl"
                style={{ color: isActive ? '#ffffff' : '#1a1a1a' }}
              >
                {count}
              </p>
              <p
                className="text-xs font-body mt-0.5"
                style={{ color: isActive ? 'rgba(255,255,255,0.7)' : '#6B6B6B' }}
              >
                {label}
              </p>
            </button>
          )
        })}
      </div>

      {/* Reviews list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-border py-12 text-center">
            <p className="text-muted font-body text-sm">لا توجد تقييمات</p>
          </div>
        ) : filtered.map(review => (
          <div key={review.id} className="bg-white rounded-xl border border-border p-4 space-y-3">

            {/* Header row */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                {review.status !== 'approved' && (
                  <button
                    onClick={() => updateStatus(review.id, 'approved')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-heading font-bold text-xs"
                  >
                    <Check size={13} />
                    اعتماد
                  </button>
                )}
                {review.status !== 'rejected' && (
                  <button
                    onClick={() => updateStatus(review.id, 'rejected')}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition-colors font-heading font-bold text-xs"
                  >
                    <X size={13} />
                    رفض
                  </button>
                )}
                <button
                  onClick={() => deleteReview(review.id)}
                  className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="flex items-center gap-3 text-right">
                <div>
                  <p className="font-heading font-bold text-sm text-brand">{review.customer_name}</p>
                  <p className="font-body text-xs text-muted">{formatDate(review.created_at)}</p>
                </div>
                <span className={cn(
                  'px-2.5 py-1 rounded-full text-[11px] font-bold font-heading',
                  STATUS_CONFIG[review.status]?.badge
                )}>
                  {STATUS_CONFIG[review.status]?.label}
                </span>
              </div>
            </div>

            {/* Stars + comment */}
            <div className="flex justify-end">
              <StarDisplay rating={review.rating} />
            </div>
            <p className="font-body text-sm text-muted text-right leading-relaxed">
              "{review.comment}"
            </p>

            {/* Images */}
            {review.images && review.images.length > 0 && (
              <div className="flex gap-2 justify-end flex-wrap">
                {review.images.filter(Boolean).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={url}
                    alt=""
                    onClick={() => setLightbox(url)}
                    className="w-16 h-16 rounded-lg object-cover cursor-pointer border border-border hover:opacity-90 transition-opacity duration-150 flex-shrink-0"
                  />
                ))}
              </div>
            )}

          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightbox(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt=""
            className="max-w-lg max-h-[80vh] object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X size={18} className="text-white" />
          </button>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setConfirmDialog(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-sm space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
                <AlertTriangle size={24} className="text-red-500" />
              </div>
              <p className="font-body text-sm text-brand">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDialog(null)}
                className="flex-1 py-2.5 rounded-xl font-heading font-bold text-sm border border-border text-muted hover:bg-surface transition-colors"
              >
                إلغاء
              </button>
              <button
                onClick={confirmDialog.onConfirm}
                className="flex-1 py-2.5 rounded-xl font-heading font-bold text-sm text-white bg-red-600 hover:bg-red-700 transition-colors"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
