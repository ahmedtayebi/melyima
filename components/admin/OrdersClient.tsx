'use client'

import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Search, ChevronDown, ChevronUp, Truck, Send, Trash2, ExternalLink, Loader2, Pencil, AlertTriangle, RotateCcw, ArchiveRestore } from 'lucide-react'
import { cn } from '@/lib/utils'
import Modal from '@/components/ui/Modal'
import OrderEditForm from '@/components/admin/OrderEditForm'
import type { Order, Product } from '@/lib/types'

type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled'
type DisplayOrderStatus = OrderStatus | 'shipping'
type FilterType = 'all' | 'deleted' | DisplayOrderStatus

const STATUS_CONFIG: Record<DisplayOrderStatus, { label: string; badge: string; select: string }> = {
  pending:   { label: 'قيد الانتظار', badge: 'bg-amber-100 text-amber-800',  select: 'قيد الانتظار' },
  confirmed: { label: 'مؤكد',         badge: 'bg-blue-100 text-blue-800',    select: 'مؤكد' },
  shipping:  { label: 'قيد التوصيل',  badge: 'bg-cyan-100 text-cyan-800',    select: 'قيد التوصيل' },
  delivered: { label: 'مُسلَّم',      badge: 'bg-green-100 text-green-800',  select: 'مُسلَّم' },
  cancelled: { label: 'ملغي',         badge: 'bg-red-100 text-red-800',      select: 'ملغي' },
}

function displayStatus(order: Order): DisplayOrderStatus {
  if (order.status === 'confirmed' && order.ecotrack_status === 'shipped') return 'shipping'
  return order.status
}

const FILTER_TABS: { key: FilterType; label: string }[] = [
  { key: 'all',       label: 'الكل' },
  { key: 'pending',   label: 'قيد الانتظار' },
  { key: 'confirmed', label: 'مؤكدة' },
  { key: 'shipping',  label: 'قيد التوصيل' },
  { key: 'delivered', label: 'مُسلَّمة' },
  { key: 'cancelled', label: 'ملغاة' },
  { key: 'deleted',   label: 'المحذوفة' },
]

const PER_PAGE = 20
const ADMIN_ORDERS_REFRESH_MS = 300_000

interface Props {
  initialOrders: Order[]
  products: Product[]
}

export default function OrdersClient({ initialOrders, products }: Props) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [filter, setFilter] = useState<FilterType>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingOrder, setEditingOrder] = useState<Order | null>(null)
  const [ecotrackLoading, setEcotrackLoading] = useState<Record<string, boolean>>({})
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const lastRefreshAt = useRef(0)
  const ecotrackLoadingRef = useRef(ecotrackLoading)

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

  useEffect(() => {
    ecotrackLoadingRef.current = ecotrackLoading
  }, [ecotrackLoading])

  useEffect(() => {
    let ignore = false

    const refreshOrders = async (force = false) => {
      if (document.hidden || confirmDialog) return
      if (Object.values(ecotrackLoadingRef.current).some(Boolean)) return

      const now = Date.now()
      if (!force && now - lastRefreshAt.current < ADMIN_ORDERS_REFRESH_MS) return
      lastRefreshAt.current = now

      try {
        const res = await fetch('/api/admin/orders', { cache: 'no-store' })
        const data = await res.json()
        if (!ignore && res.ok && data.success && Array.isArray(data.orders)) {
          setOrders(data.orders)
        }
      } catch {
        // Silent refresh keeps the page calm; manual actions still show errors.
      }
    }

    void refreshOrders(true)

    const refreshInterval = window.setInterval(() => { void refreshOrders() }, ADMIN_ORDERS_REFRESH_MS)
    const handleFocus = () => { void refreshOrders() }
    const handleVisibilityChange = () => {
      if (!document.hidden) void refreshOrders()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      ignore = true
      window.clearInterval(refreshInterval)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [confirmDialog])

  // ── Stats ─────────────────────────────────────────────────
  const stats = useMemo(() => ({
    all:       orders.filter(o => !o.deleted_at).length,
    pending:   orders.filter(o => !o.deleted_at && o.status === 'pending').length,
    confirmed: orders.filter(o => !o.deleted_at && displayStatus(o) === 'confirmed').length,
    shipping:  orders.filter(o => !o.deleted_at && displayStatus(o) === 'shipping').length,
    delivered: orders.filter(o => !o.deleted_at && o.status === 'delivered').length,
    cancelled: orders.filter(o => !o.deleted_at && o.status === 'cancelled').length,
    deleted:   orders.filter(o => Boolean(o.deleted_at)).length,
  }), [orders])

  // ── Filtered + searched + paginated ───────────────────────
  const filtered = useMemo(() => {
    let r = filter === 'deleted'
      ? orders.filter(o => Boolean(o.deleted_at))
      : orders.filter(o => !o.deleted_at)
    if (filter !== 'all' && filter !== 'deleted') r = r.filter(o => displayStatus(o) === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      r = r.filter(o =>
        o.customer_name.toLowerCase().includes(q) ||
        o.phone.includes(q) ||
        o.phone2?.includes(q)
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
  const isOrderBusy = (id: string) => Object.entries(ecotrackLoading).some(
    ([key, value]) => value && key.startsWith(`${id}-`)
  )

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
    } catch {
      showToast('تعذّر الاتصال بالخادم أثناء إنشاء البوليصة', 'error')
    } finally {
      setLoading(orderId, 'create', false)
    }
  }

  const shipOrder = (orderId: string) => {
    setConfirmDialog({
      message: 'هل أنت متأكد؟ لا يمكن التراجع بعد الإرسال للشحن.',
      onConfirm: async () => {
        setConfirmDialog(null)
        setLoading(orderId, 'ship', true)
        try {
          const res = await fetch('/api/ecotrack/ship', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: orderId }),
          })
          const data = await res.json()
          if (data.success) {
            setOrders(prev => prev.map(o =>
              o.id === orderId
                ? {
                    ...o,
                    status: data.status ?? o.status,
                    ecotrack_tracking: data.tracking ?? o.ecotrack_tracking,
                    ecotrack_status: 'shipped' as const,
                  }
                : o
            ))
            if (data.recreated) {
              showToast('أُعيد إنشاء البوليصة القديمة وتم إرسال الطلب', 'success')
            } else if (data.relinked) {
              showToast('تم ربط رقم التتبع الجديد وتحديث حالة الطلب', 'success')
            }
          } else {
            if (data.recreated && data.tracking) {
              setOrders(prev => prev.map(o =>
                o.id === orderId
                  ? { ...o, ecotrack_tracking: data.tracking, ecotrack_status: 'draft' as const }
                  : o
              ))
            }
            showToast('خطأ: ' + (data.error ?? 'Unknown'), 'error')
          }
        } catch {
          showToast('تعذّر الاتصال بالخادم أثناء إرسال الطلب', 'error')
        } finally {
          setLoading(orderId, 'ship', false)
        }
      },
    })
  }

  // ── Status update ─────────────────────────────────────────
  const confirmOrder = async (orderId: string) => {
    setLoading(orderId, 'confirm', true)
    try {
      const response = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm' }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        showToast('خطأ: ' + (data.error ?? 'تعذّر تأكيد الطلب'), 'error')
        return
      }

      setOrders(current => current.map(order =>
        order.id === orderId ? { ...order, status: 'confirmed' } : order
      ))
      await createDraft(orderId)
    } catch {
      showToast('تعذّر الاتصال بالخادم أثناء تأكيد الطلب', 'error')
    } finally {
      setLoading(orderId, 'confirm', false)
    }
  }

  const deleteOrder = (order: Order) => {
    setConfirmDialog({
      message: `نقل طلب ${order.customer_name} إلى المحذوفات؟ ستُحذف مسودة التوصيل إن وجدت ويعود المخزون، ويمكن استرجاع الطلب لاحقًا.`,
      onConfirm: async () => {
        setConfirmDialog(null)
        setLoading(order.id, 'delete-order', true)

        try {
          const res = await fetch(`/api/orders/${order.id}`, {
            method: 'DELETE',
          })
          const data = await res.json()

          if (data.success) {
            const deletedAt = new Date().toISOString()
            setOrders(prev => prev.map(item => item.id === order.id
              ? {
                  ...item,
                  deleted_at: deletedAt,
                  deleted_from_status: item.status,
                  ecotrack_tracking: null,
                  ecotrack_status: 'none' as const,
                }
              : item
            ))
            if (expandedId === order.id) setExpandedId(null)
            showToast('نُقل الطلب إلى المحذوفات وعاد المخزون', 'success')
          } else {
            showToast('خطأ: ' + (data.error ?? 'تعذّر حذف الطلب'), 'error')
          }
        } catch {
          showToast('تعذّر الاتصال بالخادم أثناء حذف الطلب', 'error')
        } finally {
          setLoading(order.id, 'delete-order', false)
        }
      },
    })
  }

  const revertToPending = (order: Order) => {
    setConfirmDialog({
      message: `إرجاع طلب ${order.customer_name} إلى قيد الانتظار؟ ستُحذف مسودة Ecotrack الحالية.`,
      onConfirm: async () => {
        setConfirmDialog(null)
        setLoading(order.id, 'pending', true)
        try {
          const res = await fetch(`/api/orders/${order.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'pending' }),
          })
          const data = await res.json()
          if (data.success) {
            setOrders(prev => prev.map(item => item.id === order.id
              ? { ...item, status: 'pending', ecotrack_tracking: null, ecotrack_status: 'none' as const }
              : item
            ))
            showToast('عاد الطلب إلى قيد الانتظار', 'success')
          } else {
            showToast('خطأ: ' + (data.error ?? 'تعذّر إرجاع الطلب'), 'error')
          }
        } catch {
          showToast('تعذّر الاتصال بالخادم أثناء إرجاع الطلب', 'error')
        } finally {
          setLoading(order.id, 'pending', false)
        }
      },
    })
  }

  const restoreOrder = async (order: Order) => {
    setLoading(order.id, 'restore', true)
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore' }),
      })
      const data = await res.json()
      if (data.success) {
        setOrders(prev => prev.map(item => item.id === order.id
          ? {
              ...item,
              status: 'pending',
              deleted_at: null,
              deleted_from_status: null,
              ecotrack_tracking: null,
              ecotrack_status: 'none' as const,
            }
          : item
        ))
        showToast('تم استرجاع الطلب وحجز المخزون', 'success')
      } else {
        showToast('خطأ: ' + (data.error ?? 'تعذّر استرجاع الطلب'), 'error')
      }
    } catch {
      showToast('تعذّر الاتصال بالخادم أثناء استرجاع الطلب', 'error')
    } finally {
      setLoading(order.id, 'restore', false)
    }
  }

  const permanentlyDeleteOrder = (order: Order) => {
    setConfirmDialog({
      message: `حذف طلب ${order.customer_name} نهائيًا؟ لن يمكن استرجاعه بعد ذلك.`,
      onConfirm: async () => {
        setConfirmDialog(null)
        setLoading(order.id, 'permanent-delete', true)
        try {
          const res = await fetch(`/api/orders/${order.id}?permanent=1`, { method: 'DELETE' })
          const data = await res.json()
          if (data.success) {
            setOrders(prev => prev.filter(item => item.id !== order.id))
            if (expandedId === order.id) setExpandedId(null)
            showToast('تم حذف الطلب نهائيًا', 'success')
          } else {
            showToast('خطأ: ' + (data.error ?? 'تعذّر حذف الطلب'), 'error')
          }
        } catch {
          showToast('تعذّر الاتصال بالخادم أثناء الحذف النهائي', 'error')
        } finally {
          setLoading(order.id, 'permanent-delete', false)
        }
      },
    })
  }

  const handleOrderSaved = async (warning?: string) => {
    setEditingOrder(null)

    try {
      const response = await fetch('/api/admin/orders', { cache: 'no-store' })
      const data = await response.json()
      if (response.ok && data.success && Array.isArray(data.orders)) {
        setOrders(data.orders)
      }
    } catch {
      // The edit is already saved; the regular refresh will reconcile the list.
    } finally {
      showToast(
        warning ? `تم حفظ التعديلات. ${warning}` : 'تم حفظ تعديلات الطلب',
        warning ? 'error' : 'success'
      )
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
              disabled={isOrderBusy(order.id)}
              className="flex items-center gap-1 text-xs font-heading font-bold text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ backgroundColor: '#1a1a1a' }}
            >
              {ecotrackLoading[`${order.id}-create`]
                ? <Loader2 size={12} className="animate-spin" />
                : <Truck size={12} />}
              إنشاء بوليصة
            </button>
          )}

          {/* Draft — show tracking + ship */}
          {order.ecotrack_tracking && order.ecotrack_status === 'draft' && (
            <>
              <span className="text-xs font-body text-muted" dir="ltr">
                {order.ecotrack_tracking}
              </span>
              <button
                onClick={() => shipOrder(order.id)}
                disabled={isOrderBusy(order.id)}
                className="flex items-center gap-1 text-xs font-heading font-bold text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                style={{ backgroundColor: '#8B1A2E' }}
              >
                {ecotrackLoading[`${order.id}-ship`]
                  ? <Loader2 size={12} className="animate-spin" />
                  : <Send size={12} />}
                إرسال للشحن
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
          {stats.all}
        </span>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { key: 'pending' as FilterType,   label: 'قيد الانتظار', count: stats.pending },
          { key: 'confirmed' as FilterType, label: 'مؤكدة',        count: stats.confirmed },
          { key: 'shipping' as FilterType,  label: 'قيد التوصيل',  count: stats.shipping },
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
                <tr className={cn('hover:bg-surface/50 transition-colors', order.deleted_at && 'opacity-70')}>
                  <td className="px-4 py-3 font-body text-xs text-muted tabular-nums">
                    #{order.id.slice(-6).toUpperCase()}
                  </td>
                  <td className="px-4 py-3 font-heading font-bold text-brand">
                    {order.customer_name}
                  </td>
                  <td className="px-4 py-3 font-body text-sm text-muted" dir="ltr">
                    <span className="block">{order.phone}</span>
                    {order.phone2 && (
                      <span className="block text-xs text-brand mt-0.5">{order.phone2}</span>
                    )}
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
                      order.deleted_at
                        ? 'bg-gray-200 text-gray-700'
                        : STATUS_CONFIG[displayStatus(order)]?.badge ?? 'bg-gray-100 text-gray-700'
                    )}>
                      {order.deleted_at ? 'محذوف' : STATUS_CONFIG[displayStatus(order)]?.label ?? order.status}
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
                      {order.deleted_at ? (
                        <>
                          <button
                            onClick={() => restoreOrder(order)}
                            disabled={isOrderBusy(order.id)}
                            className="p-1.5 rounded-lg text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
                            aria-label="استرجاع الطلب"
                            title="استرجاع الطلب"
                          >
                            {ecotrackLoading[`${order.id}-restore`]
                              ? <Loader2 size={15} className="animate-spin" />
                              : <ArchiveRestore size={15} />}
                          </button>
                          <button
                            onClick={() => permanentlyDeleteOrder(order)}
                            disabled={isOrderBusy(order.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                            aria-label="حذف الطلب نهائيًا"
                            title="حذف الطلب نهائيًا"
                          >
                            {ecotrackLoading[`${order.id}-permanent-delete`]
                              ? <Loader2 size={15} className="animate-spin" />
                              : <Trash2 size={15} />}
                          </button>
                        </>
                      ) : order.status === 'pending' ? (
                        <button
                          onClick={() => confirmOrder(order.id)}
                          disabled={isOrderBusy(order.id)}
                          className="inline-flex items-center gap-1 text-xs font-heading font-bold text-white px-3 py-1.5 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: '#1A1410' }}
                        >
                          {ecotrackLoading[`${order.id}-confirm`] && <Loader2 size={13} className="animate-spin" />}
                          تأكيد الطلب
                        </button>
                      ) : order.status === 'confirmed' && order.ecotrack_status !== 'shipped' ? (
                        <button
                          onClick={() => revertToPending(order)}
                          disabled={isOrderBusy(order.id)}
                          className="flex items-center gap-1 text-xs font-heading font-bold text-brand px-2.5 py-1.5 rounded-lg border border-border disabled:opacity-50"
                        >
                          {ecotrackLoading[`${order.id}-pending`]
                            ? <Loader2 size={13} className="animate-spin" />
                            : <RotateCcw size={13} />}
                          إرجاع
                        </button>
                      ) : null}
                      {!order.deleted_at && (
                        <button
                          onClick={() => setEditingOrder(order)}
                          disabled={isOrderBusy(order.id)}
                          className="p-1.5 rounded-lg text-muted hover:text-brand hover:bg-surface transition-colors disabled:opacity-50"
                          aria-label="تعديل الطلب"
                          title="تعديل الطلب"
                        >
                          <Pencil size={15} />
                        </button>
                      )}
                      {!order.deleted_at && order.status !== 'delivered' && order.ecotrack_status !== 'shipped' && (
                        <button
                          onClick={() => deleteOrder(order)}
                          disabled={isOrderBusy(order.id)}
                          className="p-1.5 rounded-lg text-muted hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          aria-label="نقل الطلب إلى المحذوفات"
                          title="نقل إلى المحذوفات"
                        >
                          {ecotrackLoading[`${order.id}-delete-order`]
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>
                      )}
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
                          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                            <p className="text-xs font-heading font-bold text-amber-900 mb-1">ملاحظة الزبون</p>
                            <p className="text-sm text-brand font-body whitespace-pre-wrap break-words">
                              {order.notes}
                            </p>
                          </div>
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
                        {!order.deleted_at && renderEcotrackSection(order)}
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
                {order.phone2 && (
                  <p className="text-sm text-brand font-body" dir="ltr">{order.phone2}</p>
                )}
              </div>
              <span className={cn(
                'px-2.5 py-1 rounded-full text-[11px] font-bold font-heading flex-shrink-0',
                order.deleted_at
                  ? 'bg-gray-200 text-gray-700'
                  : STATUS_CONFIG[displayStatus(order)]?.badge
              )}>
                {order.deleted_at ? 'محذوف' : STATUS_CONFIG[displayStatus(order)]?.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted font-body">
              <span>{order.wilaya_name ?? order.wilaya}{order.commune && ` · ${order.commune}`}</span>
              <span>·</span>
              <span>{order.order_items?.length ?? 0} قطعة</span>
              <span>·</span>
              <span className="tabular-nums">{formatDate(order.created_at)}</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-border flex-wrap">
              <button
                onClick={() => setExpandedId(expandedId === order.id ? null : order.id)}
                className="flex items-center gap-1 text-xs text-muted hover:text-brand font-body transition-colors"
              >
                {expandedId === order.id ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                التفاصيل
              </button>
              {order.deleted_at ? (
                <>
                  <button
                    onClick={() => restoreOrder(order)}
                    disabled={isOrderBusy(order.id)}
                    className="mr-auto flex items-center gap-1 text-xs font-heading font-bold text-green-700 px-3 py-1.5 rounded-lg border border-green-200 disabled:opacity-50"
                  >
                    {ecotrackLoading[`${order.id}-restore`]
                      ? <Loader2 size={12} className="animate-spin" />
                      : <ArchiveRestore size={12} />}
                    استرجاع
                  </button>
                  <button
                    onClick={() => permanentlyDeleteOrder(order)}
                    disabled={isOrderBusy(order.id)}
                    className="flex items-center gap-1 text-xs font-heading font-bold text-red-600 px-3 py-1.5 rounded-lg border border-red-200 disabled:opacity-50"
                  >
                    {ecotrackLoading[`${order.id}-permanent-delete`]
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Trash2 size={12} />}
                    حذف نهائي
                  </button>
                </>
              ) : order.status === 'pending' ? (
                <button
                  onClick={() => confirmOrder(order.id)}
                  disabled={isOrderBusy(order.id)}
                  className="mr-auto inline-flex items-center gap-1 text-xs font-heading font-bold text-white px-3 py-1.5 rounded-lg transition-colors hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: '#1A1410' }}
                >
                  {ecotrackLoading[`${order.id}-confirm`] && <Loader2 size={12} className="animate-spin" />}
                  تأكيد الطلب
                </button>
              ) : order.status === 'confirmed' && order.ecotrack_status !== 'shipped' ? (
                <button
                  onClick={() => revertToPending(order)}
                  disabled={isOrderBusy(order.id)}
                  className="mr-auto flex items-center gap-1 text-xs font-heading font-bold text-brand px-3 py-1.5 rounded-lg border border-border disabled:opacity-50"
                >
                  {ecotrackLoading[`${order.id}-pending`]
                    ? <Loader2 size={12} className="animate-spin" />
                    : <RotateCcw size={12} />}
                  إرجاع
                </button>
              ) : <span className="mr-auto" />}
              {!order.deleted_at && (
                <button
                  onClick={() => setEditingOrder(order)}
                  disabled={isOrderBusy(order.id)}
                  className="flex items-center gap-1 text-xs font-heading font-bold text-brand px-3 py-1.5 rounded-lg border border-border disabled:opacity-50"
                >
                  <Pencil size={12} />
                  تعديل
                </button>
              )}
              {!order.deleted_at && order.status !== 'delivered' && order.ecotrack_status !== 'shipped' && (
                <button
                  onClick={() => deleteOrder(order)}
                  disabled={isOrderBusy(order.id)}
                  className="flex items-center gap-1 text-xs font-heading font-bold text-red-600 px-3 py-1.5 rounded-lg border border-red-200 disabled:opacity-50"
                >
                  {ecotrackLoading[`${order.id}-delete-order`]
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Trash2 size={12} />}
                  حذف
                </button>
              )}
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
                {order.notes && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs font-heading font-bold text-amber-900 mb-1">ملاحظة الزبون</p>
                    <p className="text-sm leading-6 text-brand font-body whitespace-pre-wrap break-words">
                      {order.notes}
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-surface p-3 text-xs">
                  <div className="col-span-2">
                    <span className="text-muted font-body">نوع التوصيل: </span>
                    <span className="font-heading font-bold text-brand">
                      {order.delivery_type === 'home' ? 'توصيل للمنزل' : 'استلام من المكتب'}
                    </span>
                  </div>
                  {order.address && (
                    <div className="col-span-2">
                      <span className="text-muted font-body">العنوان: </span>
                      <span className="font-heading font-bold text-brand break-words">{order.address}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-muted font-body">التوصيل: </span>
                    <span className="font-heading font-bold text-brand">
                      {order.delivery_price?.toLocaleString('ar-DZ')} دج
                    </span>
                  </div>
                  <div>
                    <span className="text-muted font-body">الإجمالي: </span>
                    <span className="font-heading font-black text-accent">
                      {order.total_price?.toLocaleString('ar-DZ')} دج
                    </span>
                  </div>
                </div>
                {/* Ecotrack Section — mobile */}
                {!order.deleted_at && renderEcotrackSection(order)}
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

      <Modal
        isOpen={Boolean(editingOrder)}
        onClose={() => setEditingOrder(null)}
        size="wide"
      >
        {editingOrder && (
          <OrderEditForm
            key={editingOrder.id}
            order={editingOrder}
            products={products}
            onCancel={() => setEditingOrder(null)}
            onSaved={handleOrderSaved}
          />
        )}
      </Modal>

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

    </div>
  )
}
