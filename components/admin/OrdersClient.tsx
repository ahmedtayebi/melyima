'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { Search, ChevronDown, ChevronUp, Truck, Send, Trash2, ExternalLink, Loader2, Pencil, X, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { Order } from '@/lib/types'

type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled'
type FilterType = 'all' | OrderStatus

const STATUS_CONFIG: Record<OrderStatus, { label: string; badge: string; select: string }> = {
  pending:   { label: 'قيد الانتظار', badge: 'bg-amber-100 text-amber-800',  select: 'قيد الانتظار' },
  confirmed: { label: 'مؤكد',         badge: 'bg-blue-100 text-blue-800',    select: 'مؤكد' },
  delivered: { label: 'مُسلَّم',      badge: 'bg-green-100 text-green-800',  select: 'مُسلَّم' },
  cancelled: { label: 'ملغي',         badge: 'bg-red-100 text-red-800',      select: 'ملغي' },
}

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: 'all',       label: 'الكل' },
  { key: 'pending',   label: 'قيد الانتظار' },
  { key: 'confirmed', label: 'مؤكدة' },
  { key: 'delivered', label: 'مُسلَّمة' },
  { key: 'cancelled', label: 'ملغاة' },
]

const PER_PAGE = 20

interface Props { initialOrders: Order[] }

export default function OrdersClient({ initialOrders }: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [ecotrackLoading, setEcotrackLoading] = useState<Record<string, boolean>>({})
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [editForm, setEditForm] = useState({
    adresse: '', commune: '', tel: '', tel2: '', remarque: '',
  })
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    if (!confirmDialog) return
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirmDialog(null) }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [confirmDialog])

  // ── Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => ({
    all:       orders.length,
    pending:   orders.filter(o => o.status === 'pending').length,
    confirmed: orders.filter(o => o.status === 'confirmed').length,
    delivered: orders.filter(o => o.status === 'delivered').length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  }), [orders])

  // ── Filtered + searched + paginated ───────────────────────
  const filtered = useMemo(() => {
    let r = orders
    if (filter !== 'all') r = r.filter(o => o.status === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(o =>
        o.customer_name.toLowerCase().includes(q) || o.phone.includes(q)
      )
    }
    return r
  }, [orders, filter, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  const handleFilter = (f: FilterType) => { setFilter(f); setPage(1) }
  const handleSearch = (v: string) => { setSearch(v); setPage(1) }

  // ── Ecotrack helpers ──────────────────────────────────────
  const setLoading = (id: string, action: string, val: boolean) =>
    setEcotrackLoading(prev => ({ ...prev, [`${id}-${action}`]: val }))

  const createDraft = async (orderId: string) => {
    setLoading(orderId, 'create', true)
    try {
      const res = await fetch('/api/ecotrack/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      })
      const data = await res.json()
      if (data.success) {
        setOrders(prev => prev.map(o =>
          o.id === orderId
            ? { ...o, ecotrack_tracking: data.tracking, ecotrack_status: 'draft' as const }
            : o
        ))
      } else {
        showToast('خطأ: ' + (data.error ?? 'Unknown'), 'error')
      }
    } finally {
      setLoading(orderId, 'create', false)
    }
  }

  const shipOrder = (orderId: string, tracking: string) => {
    setConfirmDialog({
      message: 'هل أنت متأكد؟ لا يمكن التراجع بعد الإرسال للشحن.',
      onConfirm: async () => {
        setConfirmDialog(null)
        setLoading(orderId, 'ship', true)
        try {
          const res = await fetch('/api/ecotrack/ship', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, tracking }),
          })
          const data = await res.json()
          if (data.success || data.success === undefined) {
            setOrders(prev => prev.map(o =>
              o.id === orderId ? { ...o, ecotrack_status: 'shipped' as const } : o
            ))
          } else {
            showToast('خطأ: ' + (data.error ?? 'Unknown'), 'error')
          }
        } finally {
          setLoading(orderId, 'ship', false)
        }
      },
    })
  }

  const deleteFromEcotrack = (orderId: string, tracking: string) => {
    setConfirmDialog({
      message: 'حذف البوليصة من Ecotrack؟',
      onConfirm: async () => {
        setConfirmDialog(null)
        setLoading(orderId, 'delete', true)
        try {
          const res = await fetch('/api/ecotrack/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId, tracking }),
          })
          const data = await res.json()
          if (data.success || data.success === undefined) {
            setOrders(prev => prev.map(o =>
              o.id === orderId
                ? { ...o, ecotrack_tracking: null, ecotrack_status: 'none' as const }
                : o
            ))
          } else {
            showToast('خطأ: ' + (data.error ?? 'Unknown'), 'error')
          }
        } finally {
          setLoading(orderId, 'delete', false)
        }
      },
    })
  }

  const updateEcotrackOrder = async () => {
    if (!editingOrder?.ecotrack_tracking) return
    setLoading(editingOrder.id, 'update', true)
    try {
      const res = await fetch('/api/ecotrack/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tracking: editingOrder.ecotrack_tracking,
          order_id: editingOrder.id,
          adresse: editForm.adresse || undefined,
          commune: editForm.commune || undefined,
          montant: editingOrder.total_price,
          tel: editForm.tel || undefined,
          tel2: editForm.tel2 || undefined,
          remarque: editForm.remarque || undefined,
        }),
      })
      const data = await res.json()
      if (data.success || data.success === undefined) {
        setEditingOrder(null)
        showToast('تم التعديل بنجاح ✓', 'success')
      } else {
        showToast('خطأ: ' + (data.error ?? 'Unknown'), 'error')
      }
    } finally {
      setLoading(editingOrder.id, 'update', false)
    }
  }

  // ── Status update ─────────────────────────────────────────
  const updateStatus = async (orderId: string, status: OrderStatus) => {
    const supabase = createClient()
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
    if (!error) {
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o))
      // Auto-create Ecotrack draft when confirmed
      const order = orders.find(o => o.id === orderId)
      if (status === 'confirmed' && !order?.ecotrack_tracking) {
        await createDraft(orderId)
      }
    }
  }

  const formatDate = (d: string) => {
    const dt = new Date(d)
    return `${dt.getDate()}/${dt.getMonth() + 1}/${dt.getFullYear()}`
  }

  // ── Ecotrack section (shared between desktop + mobile) ────
  const renderEcotrackSection = (order: Order) => (
    <div className="mt-3 pt-3 border-t border-border">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Truck size={14} className="text-muted" />
          <span className="text-xs font-heading font-bold text-brand">Ecotrack</span>
          {order.ecotrack_status === 'draft' && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
              مسودة
            </span>
          )}
          {order.ecotrack_status === 'shipped' && (
            <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
              تم الإرسال
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* No tracking yet — show create button */}
          {!order.ecotrack_tracking && order.status === 'confirmed' && (
            <button
              onClick={() => createDraft(order.id)}
              disabled={ecotrackLoading[`${order.id}-create`]}
              className="flex items-center gap-1 text-xs font-heading font-bold text-white px-3 py-1.5 rounded-lg"
              style={{ backgroundColor: '#1a1a1a' }}
            >
              {ecotrackLoading[`${order.id}-create`]
                ? <Loader2 size={12} className="animate-spin" />
                : <Truck size={12} />}
              إنشاء بوليصة
            </button>
          )}

          {/* Draft — show tracking + ship + delete + edit */}
          {order.ecotrack_tracking && order.ecotrack_status === 'draft' && (
            <>
              <span className="text-xs font-body text-muted" dir="ltr">
                {order.ecotrack_tracking}
              </span>
              <button
                onClick={() => shipOrder(order.id, order.ecotrack_tracking!)}
                disabled={ecotrackLoading[`${order.id}-ship`]}
                className="flex items-center gap-1 text-xs font-heading font-bold text-white px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: '#8B1A2E' }}
              >
                {ecotrackLoading[`${order.id}-ship`]
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Send size={12} />}
                إرسال للشحن
              </button>
              <button
                onClick={() => deleteFromEcotrack(order.id, order.ecotrack_tracking!)}
                disabled={ecotrackLoading[`${order.id}-delete`]}
                className="flex items-center gap-1 text-xs font-heading font-bold text-red-600 px-3 py-1.5 rounded-lg border border-red-200"
              >
                {ecotrackLoading[`${order.id}-delete`]
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Trash2 size={12} />}
                حذف
              </button>
              <button
                onClick={() => {
                  setEditingOrder(order)
                  setEditForm({
                    adresse: order.address ?? '',
                    commune: order.commune ?? '',
                    tel: order.phone ?? '',
                    tel2: order.phone2 ?? '',
                    remarque: order.notes ?? '',
                  })
                }}
                className="flex items-center gap-1 text-xs font-heading font-bold text-brand px-3 py-1.5 rounded-lg border border-border"
              >
                <Pencil size={12} />
                تعديل
              </button>
            </>
          )}

          {/* Shipped — show tracking + link */}
          {order.ecotrack_tracking && order.ecotrack_status === 'shipped' && (
            <>
              <span className="text-xs font-body text-brand font-bold" dir="ltr">
                {order.ecotrack_tracking}
              </span>
              <a
                href={`https://www.ecotrack.dz/tracking/${order.ecotrack_tracking}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                تتبع <ExternalLink size={10} />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  )

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="font-heading font-black text-2xl text-brand">الطلبات</h1>
        <span className="bg-brand text-white text-xs font-bold font-heading px-2.5 py-1 rounded-full">
          {orders.length}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { key: 'pending' as FilterType,   label: 'قيد الانتظار', count: stats.pending },
          { key: 'confirmed' as FilterType, label: 'مؤكدة',        count: stats.confirmed },
          { key: 'delivered' as FilterType, label: 'مُسلَّمة',     count: stats.delivered },
          { key: 'cancelled' as FilterType, label: 'ملغاة',        count: stats.cancelled },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => handleFilter(key)}
            className={cn(
              'rounded-xl border-2 p-4 text-right transition-all',
              filter === key
                ? 'bg-accent border-accent shadow-sm'
                : 'bg-white border-border hover:border-brand'
            )}
          >
            <p className={cn('font-heading font-black text-2xl', filter === key ? 'text-white' : 'text-brand')}>
              {count}
            </p>
            <p className={cn('text-xs font-body mt-0.5', filter === key ? 'text-white/80' : 'text-muted')}>
              {label}
            </p>
          </button>
        ))}
      </div>

      {/* Filter tabs + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-white border border-border rounded-xl p-1 overflow-x-auto">
          {FILTER_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleFilter(key)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-heading font-bold whitespace-nowrap transition-colors',
                filter === key ? 'bg-brand text-white' : 'text-muted hover:text-brand'
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={search}
            onChange={e => handleSearch(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف..."
            className="w-full bg-white border border-border rounded-xl pr-9 pl-4 py-2.5 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
          />
        </div>
      </div>

      {/* Table — desktop */}
      <div className="hidden lg:block bg-white rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-surface">
            <tr>
              {['#', 'الاسم', 'الهاتف', 'الولاية', 'المنتجات', 'الحالة', 'التاريخ', 'إجراءات'].map(h => (
                <th key={h} className="text-right px-4 py-3 font-heading font-bold text-xs text-muted">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted font-body text-sm">
                  لا توجد طلبات
                </td>
              </tr>
            ) : paginated.map((order) => (
              <React.Fragment key={order.id}>
                <tr className="hover:bg-surface/50 transition-colors">
                  <td className="px-4 py-3 font-body text-xs text-muted tabular-nums">
                    #{order.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 font-heading font-bold text-brand">
                    {order.customer_name}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-muted" dir="ltr">
                    {order.phone}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-brand">
                    {order.wilaya_name ?? order.wilaya}
                    {order.commune && (
                      <span className="block text-xs text-muted">{order.commune}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-body text-xs text-muted">
                    {order.order_items?.length ?? 0} قطعة
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold font-heading',
                      STATUS_CONFIG[order.status as OrderStatus]?.badge ?? 'bg-gray-100 text-gray-700'
                    )}>
                      {STATUS_CONFIG[order.status as OrderStatus]?.label ?? order.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-body text-xs text-muted tabular-nums">
                    {formatDate(order.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                        className="p-1.5 rounded-lg text-muted hover:text-brand hover:bg-surface transition-colors"
                        aria-label="عرض التفاصيل"
                      >
                        {expandedId === order.id
                          ? <ChevronUp size={15} />
                          : <ChevronDown size={15} />}
                      </button>
                      {/* Status select */}
                      <select
                        value={order.status}
                        onChange={e => updateStatus(order.id, e.target.value as OrderStatus)}
                        className="text-xs border border-border rounded-lg px-2 py-1 bg-white font-body text-brand focus:outline-none focus:border-brand"
                      >
                        <option value="pending">قيد الانتظار</option>
                        <option value="confirmed">مؤكد</option>
                        <option value="delivered">مُسلَّم</option>
                        <option value="cancelled">ملغي</option>
                      </select>
                    </div>
                  </td>
                </tr>
                {/* Expanded items */}
                {expandedId === order.id && (
                  <tr key={`${order.id}-expanded`}>
                    <td colSpan={8} className="bg-surface/60 px-6 py-4">
                      <div className="space-y-2">
                        {(order.order_items ?? []).map(item => (
                          <div key={item.id} className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 border border-border">
                            {/* Image */}
                            <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0">
                              {item.color_image_url
                                ? <img src={item.color_image_url} alt={item.product_name} className="w-full h-full object-cover" />
                                : <div className="w-full h-full" style={{ backgroundColor: item.color_hex }} />}
                            </div>
                            {/* Name */}
                            <span className="font-heading font-bold text-sm text-brand flex-1">{item.product_name}</span>
                            {/* Color */}
                            <div className="flex items-center gap-1.5">
                              <span className="w-3 h-3 rounded-full border border-black/10" style={{ backgroundColor: item.color_hex }} />
                              <span className="text-xs text-muted font-body">{item.color_name}</span>
                            </div>
                            {/* Size */}
                            <span className="text-xs font-heading font-bold text-brand border border-border rounded-full px-2 py-0.5">
                              {item.size_label}
                            </span>
                            {/* Qty */}
                            <span className="text-xs text-muted font-body tabular-nums">×{item.quantity}</span>
                          </div>
                        ))}
                        {order.notes && (
                          <p className="text-xs text-muted font-body pr-1">
                            ملاحظة: {order.notes}
                          </p>
                        )}
                        {/* Delivery info */}
                        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted font-body">نوع التوصيل:</span>
                            <span className="text-xs font-heading font-bold text-brand">
                              {order.delivery_type === 'home' ? 'توصيل للمنزل' : 'استلام من المكتب'}
                            </span>
                          </div>
                          {order.commune && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted font-body">البلدية:</span>
                              <span className="text-xs font-heading font-bold text-brand">{order.commune}</span>
                            </div>
                          )}
                          {order.address && (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted font-body">العنوان:</span>
                              <span className="text-xs font-heading font-bold text-brand">{order.address}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mr-auto">
                            <span className="text-xs text-muted font-body">المنتجات:</span>
                            <span className="text-xs font-heading font-bold text-brand">
                              {order.products_total?.toLocaleString('ar-DZ')} دج
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted font-body">التوصيل:</span>
                            <span className="text-xs font-heading font-bold text-brand">
                              {order.delivery_price?.toLocaleString('ar-DZ')} دج
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted font-body">الإجمالي:</span>
                            <span className="text-xs font-heading font-black text-accent">
                              {order.total_price?.toLocaleString('ar-DZ')} دج
                            </span>
                          </div>
                        </div>
                        {/* Ecotrack Section */}
                        {renderEcotrackSection(order)}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards — mobile */}
      <div className="lg:hidden space-y-3">
        {paginated.length === 0 ? (
          <p className="text-center py-12 text-muted font-body text-sm">لا توجد طلبات</p>
        ) : paginated.map(order => (
          <div key={order.id} className="bg-white rounded-xl border border-border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-heading font-bold text-base text-brand">{order.customer_name}</p>
                <p className="text-sm text-muted font-body" dir="ltr">{order.phone}</p>
              </div>
              <span className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-bold font-heading flex-shrink-0',
                STATUS_CONFIG[order.status as OrderStatus]?.badge
              )}>
                {STATUS_CONFIG[order.status as OrderStatus]?.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted font-body">
              <span>{order.wilaya_name ?? order.wilaya}{order.commune && ` · ${order.commune}`}</span>
              <span>·</span>
              <span>{order.order_items?.length ?? 0} قطعة</span>
              <span>·</span>
              <span className="tabular-nums">{formatDate(order.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border">
              <button
                onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                className="flex items-center gap-1 text-xs text-muted hover:text-brand font-body transition-colors"
              >
                {expandedId === order.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                التفاصيل
              </button>
              <select
                value={order.status}
                onChange={e => updateStatus(order.id, e.target.value as OrderStatus)}
                className="mr-auto text-xs border border-border rounded-lg px-2 py-1 bg-white font-body text-brand focus:outline-none"
              >
                <option value="pending">قيد الانتظار</option>
                <option value="confirmed">مؤكد</option>
                <option value="delivered">مُسلَّم</option>
                <option value="cancelled">ملغي</option>
              </select>
            </div>
            {expandedId === order.id && (
              <div className="space-y-2 pt-1">
                {(order.order_items ?? []).map(item => (
                  <div key={item.id} className="flex items-center gap-2 bg-surface rounded-xl px-3 py-2">
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                      {item.color_image_url
                        ? <img src={item.color_image_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full" style={{ backgroundColor: item.color_hex }} />}
                    </div>
                    <span className="font-heading font-bold text-xs text-brand flex-1 truncate">{item.product_name}</span>
                    <span className="text-[10px] text-muted font-body">{item.color_name} / {item.size_label} ×{item.quantity}</span>
                  </div>
                ))}
                {/* Ecotrack Section — mobile */}
                {renderEcotrackSection(order)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm font-heading font-bold border border-border rounded-lg disabled:opacity-40 hover:border-brand transition-colors"
          >
            السابق
          </button>
          <span className="text-sm font-body text-muted tabular-nums">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm font-heading font-bold border border-border rounded-lg disabled:opacity-40 hover:border-brand transition-colors"
          >
            التالي
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
                تأكيد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-full text-sm font-heading font-bold text-white shadow-lg pointer-events-none',
          toast.type === 'error' ? 'bg-red-600' : 'bg-green-600'
        )}>
          {toast.message}
        </div>
      )}

      {/* Edit modal */}
      {editingOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setEditingOrder(null)}
        >
          <div
            className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <button onClick={() => setEditingOrder(null)}>
                <X size={20} className="text-muted" />
              </button>
              <h3 className="font-heading font-black text-lg text-brand">تعديل البوليصة</h3>
            </div>
            <p className="text-xs text-muted font-body text-right" dir="ltr">
              {editingOrder.ecotrack_tracking}
            </p>
            <div className="space-y-3">
              {[
                { label: 'الهاتف', key: 'tel', placeholder: '0600000000' },
                { label: 'الهاتف 2', key: 'tel2', placeholder: '0600000000' },
                { label: 'العنوان', key: 'adresse', placeholder: 'العنوان الكامل' },
                { label: 'البلدية', key: 'commune', placeholder: 'البلدية' },
                { label: 'ملاحظات', key: 'remarque', placeholder: 'ملاحظات إضافية' },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-xs font-heading font-bold text-brand mb-1 text-right">
                    {label}
                  </label>
                  <input
                    value={editForm[key as keyof typeof editForm]}
                    onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand text-right"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditingOrder(null)}
                className="flex-1 py-2.5 rounded-xl font-heading font-bold text-sm border border-border text-muted"
              >
                إلغاء
              </button>
              <button
                onClick={updateEcotrackOrder}
                disabled={ecotrackLoading[`${editingOrder.id}-update`]}
                className="flex-1 py-2.5 rounded-xl font-heading font-bold text-sm text-white"
                style={{ backgroundColor: '#8B1A2E' }}
              >
                {ecotrackLoading[`${editingOrder.id}-update`] ? 'جارٍ الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
