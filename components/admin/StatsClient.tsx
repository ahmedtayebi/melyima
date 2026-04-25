'use client'

import { useMemo, useState } from 'react'
import type { Order, OrderItem } from '@/lib/types'
import { TrendingUp, ShoppingBag, Package, Wallet, ArrowUp, ArrowDown, BarChart2, Award, MapPin, Truck } from 'lucide-react'
import {
  AreaChart, Area, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────
type Period = '30d' | '90d' | 'all'

// Tied to Order fields so renames are caught at compile time
type StatsOrder = {
  id:             Order['id']
  status:         Order['status']
  total_price:    Order['total_price']
  products_total: Order['products_total'] | null
  delivery_price: Order['delivery_price'] | null
  wilaya_name:    Order['wilaya_name']
  wilaya:         Order['wilaya']
  created_at:     Order['created_at']
  order_items?:   Pick<OrderItem, 'product_name' | 'quantity'>[] | null
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GOLD   = '#B8872E'
const GOLD2  = '#D4A94C'

const STATUS_COLORS: Record<string, string> = {
  delivered: '#10B981',
  confirmed: '#3B82F6',
  pending:   '#F59E0B',
  cancelled: '#94A3B8',
}
const STATUS_LABELS: Record<string, string> = {
  pending:   'قيد الانتظار',
  confirmed: 'مؤكد',
  delivered: 'مُسلَّم',
  cancelled: 'ملغي',
}
const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) => Math.round(n).toLocaleString('ar-DZ')

function buildChartData(orders: StatsOrder[], period: Period) {
  const now = new Date()

  if (period === '30d') {
    const map = new Map<string, number>()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      map.set(`${d.getDate()}/${d.getMonth() + 1}`, 0)
    }
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 30)
    orders.filter(o => new Date(o.created_at) >= cutoff).forEach(o => {
      const d = new Date(o.created_at)
      const k = `${d.getDate()}/${d.getMonth() + 1}`
      map.set(k, (map.get(k) ?? 0) + 1)
    })
    return Array.from(map, ([label, count]) => ({ label, count }))
  }

  if (period === '90d') {
    // Use ISO date as unique key to avoid year collisions; display label is d/m only
    const map = new Map<string, { count: number; label: string }>()
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 91)
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i * 7)
      const ws = new Date(d); ws.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key   = `${ws.getFullYear()}-${ws.getMonth()}-${ws.getDate()}`
      const label = `${ws.getDate()}/${ws.getMonth() + 1}`
      if (!map.has(key)) map.set(key, { count: 0, label })
    }
    orders.filter(o => new Date(o.created_at) >= cutoff).forEach(o => {
      const d = new Date(o.created_at)
      const ws = new Date(d); ws.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const key = `${ws.getFullYear()}-${ws.getMonth()}-${ws.getDate()}`
      const entry = map.get(key)
      if (entry) entry.count++
    })
    return Array.from(map.values()).map(({ count, label }) => ({ label, count }))
  }

  // all time — monthly
  const map = new Map<string, { count: number; sort: number }>()
  orders.forEach(o => {
    const d = new Date(o.created_at)
    const sort = d.getFullYear() * 100 + d.getMonth()
    const k = `${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
    const prev = map.get(k)
    map.set(k, { count: (prev?.count ?? 0) + 1, sort })
  })
  return Array.from(map, ([label, { count, sort }]) => ({ label, count, sort }))
    .sort((a, b) => a.sort - b.sort)
    .slice(-18)
    .map(({ label, count }) => ({ label, count }))
}

// ─── Custom Tooltips ──────────────────────────────────────────────────────────
function AreaTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1A1410', border: `1px solid ${GOLD}33` }} className="px-4 py-2.5 rounded-xl shadow-xl">
      <p className="text-[11px] font-body mb-1" style={{ color: '#7A6A58' }}>{label}</p>
      <p className="font-heading font-black text-sm" style={{ color: GOLD2 }}>{payload[0].value} طلب</p>
    </div>
  )
}
function BarTip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: '#1A1410', border: `1px solid ${GOLD}33` }} className="px-3 py-2 rounded-xl shadow-xl">
      <p className="text-[11px] font-body mb-0.5" style={{ color: GOLD2 }}>{label}</p>
      <p className="font-heading font-bold text-xs text-white">{payload[0].value} طلب</p>
    </div>
  )
}

// ─── Rank Badge (outside component to avoid re-creation on every render) ──────
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      className={cn(
        'w-7 h-7 rounded-full flex items-center justify-center text-xs font-heading font-black flex-shrink-0',
        rank === 1 ? 'text-white' : rank === 2 ? 'bg-surface text-brand border border-border' : 'bg-surface text-muted'
      )}
      style={rank === 1 ? { background: `linear-gradient(135deg, ${GOLD}, ${GOLD2})` } : {}}
    >
      {rank}
    </span>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function StatsClient({ orders }: { orders: StatsOrder[] }) {
  const [period, setPeriod] = useState<Period>('30d')

  const filtered = useMemo(() => {
    if (period === 'all') return orders
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - (period === '30d' ? 30 : 90))
    return orders.filter(o => new Date(o.created_at) >= cutoff)
  }, [orders, period])

  const kpis = useMemo(() => {
    const delivered = filtered.filter(o => o.status === 'delivered')
    const cancelled = filtered.filter(o => o.status === 'cancelled')
    const terminal  = delivered.length + cancelled.length
    return {
      totalSales:   delivered.reduce((s, o) => s + (o.total_price ?? 0), 0),
      totalOrders:  filtered.length,
      deliveryRate: terminal > 0 ? (delivered.length / terminal) * 100 : 0,
      avgOrder:     filtered.length > 0
        ? filtered.reduce((s, o) => s + (o.total_price ?? 0), 0) / filtered.length : 0,
    }
  }, [filtered])

  const financial = useMemo(() => {
    const now            = new Date()
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const thisMonth = orders
      .filter(o => new Date(o.created_at) >= thisMonthStart)
      .reduce((s, o) => s + (o.total_price ?? 0), 0)
    const lastMonth = orders
      .filter(o => { const d = new Date(o.created_at); return d >= lastMonthStart && d < thisMonthStart })
      .reduce((s, o) => s + (o.total_price ?? 0), 0)
    const delivered = filtered.filter(o => o.status === 'delivered')
    return {
      thisMonth,
      lastMonth,
      monthChange: lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null,
      totalDelivery: delivered.reduce((s, o) => s + (o.delivery_price ?? 0), 0),
      actualRevenue: delivered.reduce((s, o) => s + (o.products_total ?? 0), 0),
    }
  }, [orders, filtered])

  const chartData   = useMemo(() => buildChartData(orders, period), [orders, period])

  const statusData  = useMemo(() => {
    const counts: Record<string, number> = {}
    filtered.forEach(o => { counts[o.status] = (counts[o.status] ?? 0) + 1 })
    return Object.entries(counts)
      .map(([status, value]) => ({ name: STATUS_LABELS[status] ?? status, value, status }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  const topWilayas  = useMemo(() => {
    const counts: Record<string, number> = {}
    filtered.forEach(o => {
      const n = o.wilaya_name ?? o.wilaya ?? 'غير محدد'
      counts[n] = (counts[n] ?? 0) + 1
    })
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([name, count]) => ({ name, count }))
  }, [filtered])

  const topProducts = useMemo(() => {
    const qty: Record<string, number> = {}
    filtered.forEach(o => (o.order_items ?? []).forEach(i => {
      qty[i.product_name] = (qty[i.product_name] ?? 0) + i.quantity
    }))
    const entries = Object.entries(qty).sort((a, b) => b[1] - a[1]).slice(0, 5)
    const max = entries[0]?.[1] ?? 1
    return entries.map(([name, count], i) => ({ rank: i + 1, name, count, pct: (count / max) * 100 }))
  }, [filtered])

  const topRevWilayas = useMemo(() => {
    const rev: Record<string, number> = {}
    filtered.forEach(o => {
      const n = o.wilaya_name ?? o.wilaya ?? 'غير محدد'
      rev[n] = (rev[n] ?? 0) + (o.total_price ?? 0)
    })
    const entries = Object.entries(rev).sort((a, b) => b[1] - a[1]).slice(0, 8)
    const max = entries[0]?.[1] ?? 1
    return entries.map(([name, revenue], i) => ({ rank: i + 1, name, revenue, pct: (revenue / max) * 100 }))
  }, [filtered])

  const returnRates = useMemo(() => {
    const data: Record<string, { total: number; cancelled: number }> = {}
    filtered.forEach(o => {
      const n = o.wilaya_name ?? o.wilaya ?? 'غير محدد'
      if (!data[n]) data[n] = { total: 0, cancelled: 0 }
      data[n].total++
      if (o.status === 'cancelled') data[n].cancelled++
    })
    return Object.entries(data)
      .filter(([, d]) => d.total >= 3)
      .map(([name, d]) => ({ name, total: d.total, cancelled: d.cancelled, rate: (d.cancelled / d.total) * 100 }))
      .sort((a, b) => b.rate - a.rate)
  }, [filtered])

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[420px] gap-5 text-center">
        <div className="w-20 h-20 rounded-full bg-surface flex items-center justify-center">
          <BarChart2 size={36} className="text-accent opacity-50" />
        </div>
        <div>
          <p className="font-heading font-black text-xl text-brand">لا توجد بيانات بعد</p>
          <p className="font-body text-sm text-muted mt-1">ستظهر الإحصاءات فور ورود أول طلب</p>
        </div>
      </div>
    )
  }

  const periodLabel = period === '30d' ? 'آخر 30 يوم' : period === '90d' ? 'آخر 3 أشهر' : 'كل الوقت'

  return (
    <div className="space-y-7">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading font-black text-2xl text-brand">الإحصاءات</h1>
          {/* Gold accent underline */}
          <div className="mt-1.5 h-[3px] w-16 rounded-full" style={{ background: `linear-gradient(to left, ${GOLD}, ${GOLD2}33)` }} />
        </div>
        {/* Period filter */}
        <div className="flex gap-1 p-1 rounded-xl border border-border bg-white shadow-sm">
          {(['30d', '90d', 'all'] as Period[]).map((k) => {
            const l = k === '30d' ? 'آخر 30 يوم' : k === '90d' ? 'آخر 3 أشهر' : 'كل الوقت'
            return (
              <button
                key={k}
                onClick={() => setPeriod(k)}
                className={cn(
                  'px-4 py-1.5 rounded-lg text-xs font-heading font-bold whitespace-nowrap transition-all duration-200',
                  period === k ? 'text-white shadow-sm' : 'text-muted hover:text-brand'
                )}
                style={period === k ? { background: '#1A1410' } : {}}
              >
                {l}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: 'إجمالي المبيعات', sub: 'للطلبات المُسلَّمة',
            value: `${fmt(kpis.totalSales)} دج`,
            icon: TrendingUp, accent: GOLD, iconBg: '#FDF6E8', iconColor: GOLD,
          },
          {
            label: 'عدد الطلبات', sub: periodLabel,
            value: fmt(kpis.totalOrders),
            icon: ShoppingBag, accent: '#3B82F6', iconBg: '#EFF6FF', iconColor: '#3B82F6',
          },
          {
            label: 'نسبة التسليم', sub: 'من الطلبات المنتهية',
            value: `${kpis.deliveryRate.toFixed(1)}٪`,
            icon: Package, accent: '#10B981', iconBg: '#ECFDF5', iconColor: '#10B981',
          },
          {
            label: 'متوسط الطلب', sub: 'إجمالي شامل التوصيل',
            value: `${fmt(kpis.avgOrder)} دج`,
            icon: Wallet, accent: '#8B5CF6', iconBg: '#F5F3FF', iconColor: '#8B5CF6',
          },
        ].map(({ label, sub, value, icon: Icon, accent, iconBg, iconColor }) => (
          <div
            key={label}
            className="bg-white rounded-2xl border border-border p-5 flex flex-col gap-4 hover:shadow-lg transition-all duration-200 group"
            style={{ borderTop: `3px solid ${accent}` }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-heading font-bold text-muted leading-snug truncate">{label}</span>
                <span className="text-[10px] font-body text-muted/60 truncate">{sub}</span>
              </div>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110" style={{ background: iconBg }}>
                <Icon size={16} style={{ color: iconColor }} />
              </div>
            </div>
            <p className="font-heading font-black text-xl text-brand leading-none tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Dark Spotlight — Revenue ─────────────────────────────────────────── */}
      <div
        className="relative rounded-3xl overflow-hidden p-6 lg:p-8"
        style={{ background: '#1A1410' }}
      >
        {/* Glow orbs */}
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none" style={{ background: GOLD }} />
        <div className="absolute -bottom-12 left-8 w-40 h-40 rounded-full opacity-10 blur-3xl pointer-events-none" style={{ background: GOLD2 }} />

        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-6 lg:gap-10">
          {/* Primary — Actual revenue */}
          <div className="sm:border-l border-white/10 sm:pl-8">
            <p className="text-xs font-heading font-bold mb-3" style={{ color: GOLD }}>الإيراد الفعلي</p>
            <p className="font-heading font-black text-4xl tabular-nums leading-none" style={{ color: GOLD2 }}>
              {fmt(financial.actualRevenue)}
            </p>
            <p className="text-white/30 text-sm font-body mt-1">دج</p>
          </div>

          {/* Month comparison */}
          <div>
            <p className="text-xs font-heading font-bold text-white/40 mb-3">هذا الشهر</p>
            <p className="font-heading font-black text-2xl text-white tabular-nums leading-none">
              {fmt(financial.thisMonth)} <span className="text-white/30 text-sm font-body">دج</span>
            </p>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {financial.monthChange !== null ? (
                <>
                  {financial.monthChange >= 0 ? (
                    <span className="flex items-center gap-1 text-xs font-heading font-bold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full">
                      <ArrowUp size={10} />{Math.abs(financial.monthChange).toFixed(1)}٪
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs font-heading font-bold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
                      <ArrowDown size={10} />{Math.abs(financial.monthChange).toFixed(1)}٪
                    </span>
                  )}
                  <span className="text-xs text-white/30 font-body">{fmt(financial.lastMonth)} دج الشهر الماضي</span>
                </>
              ) : (
                <span className="text-xs text-white/30">لا توجد بيانات للشهر الماضي</span>
              )}
            </div>
          </div>

          {/* Delivery collected */}
          <div>
            <p className="text-xs font-heading font-bold text-white/40 mb-3">التوصيل المحصّل</p>
            <p className="font-heading font-black text-2xl text-white tabular-nums leading-none">
              {fmt(financial.totalDelivery)} <span className="text-white/30 text-sm font-body">دج</span>
            </p>
            <p className="text-xs text-white/30 font-body mt-2">للطلبات المُسلَّمة فقط</p>
          </div>
        </div>
      </div>

      {/* ── Area Chart — Orders Over Time ────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-border p-5 lg:p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-heading font-bold text-sm text-brand">حركة الطلبات</p>
            <p className="text-xs text-muted font-body mt-0.5">{periodLabel}</p>
          </div>
          <div className="w-2 h-2 rounded-full" style={{ background: GOLD }} />
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={GOLD} stopOpacity={0.2} />
                <stop offset="100%" stopColor={GOLD} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" vertical={false} />
            <XAxis
              dataKey="label"
              interval={period === '30d' ? 6 : period === '90d' ? 2 : 'preserveStartEnd'}
              tick={{ fill: '#7A6A58', fontSize: 10, fontFamily: 'sans-serif' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: '#7A6A58', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<AreaTooltip />} />
            <Area
              type="monotone"
              dataKey="count"
              stroke={GOLD}
              strokeWidth={2.5}
              fill="url(#goldGrad)"
              dot={false}
              activeDot={{ r: 5, fill: GOLD, strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* ── Pie + Bar Charts ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Pie — status */}
        <div className="bg-white rounded-2xl border border-border p-5 lg:col-span-2">
          <p className="font-heading font-bold text-sm text-brand mb-1">توزيع الطلبات</p>
          <p className="text-xs text-muted font-body mb-4">حسب الحالة</p>
          {statusData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-muted">لا توجد بيانات</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%" cy="50%"
                    innerRadius={48} outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    startAngle={90} endAngle={-270}
                  >
                    {statusData.map(e => (
                      <Cell key={e.status} fill={STATUS_COLORS[e.status] ?? '#94A3B8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-3">
                {statusData.map(e => (
                  <div key={e.status} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: STATUS_COLORS[e.status] ?? '#94A3B8' }} />
                    <span className="text-xs font-body text-muted flex-1">{e.name}</span>
                    <span className="text-xs font-heading font-bold text-brand tabular-nums">{e.value}</span>
                    <span className="text-[10px] text-muted font-body tabular-nums w-10 text-left">
                      {filtered.length > 0 ? `${((e.value / filtered.length) * 100).toFixed(0)}٪` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bar — top wilayas */}
        <div className="bg-white rounded-2xl border border-border p-5 lg:col-span-3">
          <p className="font-heading font-bold text-sm text-brand mb-1">أبرز الولايات</p>
          <p className="text-xs text-muted font-body mb-4">حسب عدد الطلبات</p>
          {topWilayas.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-xs text-muted">لا توجد بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart
                data={topWilayas}
                layout="vertical"
                margin={{ top: 0, right: 32, bottom: 0, left: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fill: '#7A6A58', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  dataKey="name" type="category"
                  orientation="right" width={72}
                  tick={{ fill: '#1A1410', fontSize: 10, fontFamily: 'sans-serif' }}
                  axisLine={false} tickLine={false}
                />
                <Tooltip content={<BarTip />} />
                <Bar dataKey="count" radius={[4, 0, 0, 4]} maxBarSize={18}>
                  {topWilayas.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? GOLD : i === 1 ? GOLD2 : '#D4A94C55'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Rankings with Progress Bars ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top 5 products */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#FDF6E8' }}>
              <Award size={14} style={{ color: GOLD }} />
            </div>
            <div>
              <p className="font-heading font-bold text-sm text-brand">أفضل المنتجات</p>
              <p className="text-[10px] text-muted font-body">حسب الكمية المباعة</p>
            </div>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-xs text-muted font-body text-center py-6">لا توجد بيانات</p>
          ) : (
            <div className="space-y-4">
              {topProducts.map(({ rank, name, count, pct }) => (
                <div key={name} className="flex items-center gap-3">
                  <RankBadge rank={rank} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-heading font-bold text-xs text-brand truncate">{name}</span>
                      <span className="font-heading font-bold text-xs text-muted tabular-nums flex-shrink-0 mr-2">{fmt(count)} ق</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: rank === 1
                            ? `linear-gradient(to left, ${GOLD2}, ${GOLD})`
                            : rank === 2 ? '#3B82F6' : '#94A3B8',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top wilayas by revenue */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: '#EFF6FF' }}>
              <MapPin size={14} className="text-blue-500" />
            </div>
            <div>
              <p className="font-heading font-bold text-sm text-brand">أعلى الولايات</p>
              <p className="text-[10px] text-muted font-body">حسب الإيراد</p>
            </div>
          </div>
          {topRevWilayas.length === 0 ? (
            <p className="text-xs text-muted font-body text-center py-6">لا توجد بيانات</p>
          ) : (
            <div className="space-y-4">
              {topRevWilayas.map(({ rank, name, revenue, pct }) => (
                <div key={name} className="flex items-center gap-3">
                  <RankBadge rank={rank} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-heading font-bold text-xs text-brand truncate">{name}</span>
                      <span className="font-heading font-bold text-xs tabular-nums flex-shrink-0 mr-2" style={{ color: GOLD }}>{fmt(revenue)} دج</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: rank === 1
                            ? `linear-gradient(to left, ${GOLD2}, ${GOLD})`
                            : rank === 2 ? '#3B82F6' : '#94A3B8',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Return Rate Table ────────────────────────────────────────────────── */}
      {returnRates.length > 0 && (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-50">
              <Truck size={14} className="text-amber-600" />
            </div>
            <div>
              <p className="font-heading font-bold text-sm text-brand">نسبة الإرجاع حسب الولاية</p>
              <p className="text-[10px] text-muted font-body">ولايات بـ 3 طلبات على الأقل · مرتبة تنازلياً</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border" style={{ background: '#FDFAF5' }}>
                <tr>
                  {['الولاية', 'الطلبات', 'الملغي', 'نسبة الإرجاع'].map(h => (
                    <th key={h} className="text-right px-5 py-3 font-heading font-bold text-xs text-muted whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {returnRates.map(row => (
                  <tr
                    key={row.name}
                    className="transition-colors hover:bg-surface/30"
                    style={row.rate > 30 ? { background: '#FFFBEB' } : {}}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-brand">{row.name}</span>
                        {row.rate > 30 && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">تنبيه</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-body text-brand tabular-nums">{row.total}</td>
                    <td className="px-5 py-3 font-body text-muted tabular-nums">{row.cancelled}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-16 h-1.5 rounded-full bg-surface overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(row.rate, 100)}%`,
                              background: row.rate > 30 ? '#F59E0B' : row.rate > 15 ? '#3B82F6' : '#10B981',
                            }}
                          />
                        </div>
                        <span className={cn(
                          'font-heading font-bold text-xs px-2.5 py-1 rounded-full whitespace-nowrap',
                          row.rate > 30  ? 'bg-amber-100 text-amber-800' :
                          row.rate > 15  ? 'bg-blue-50 text-blue-700'   :
                                           'bg-emerald-50 text-emerald-700'
                        )}>
                          {row.rate.toFixed(1)}٪
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  )
}
