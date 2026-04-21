'use client'

import { useMemo, useState } from 'react'
import { TrendingUp, ShoppingBag, Package, DollarSign, ArrowUp, ArrowDown, BarChart2 } from 'lucide-react'
import {
  LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts'
import { cn } from '@/lib/utils'

type Period = '30d' | '90d' | 'all'

type StatsOrder = {
  id: string
  status: string
  total_price: number
  products_total: number | null
  delivery_price: number | null
  wilaya_name: string | null
  wilaya: string | null
  created_at: string
  order_items?: { product_name: string; quantity: number }[] | null
}

const fmt = (n: number) => Math.round(n).toLocaleString('ar-DZ')

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

function LineTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-bold shadow-lg">
      <p className="opacity-70 mb-0.5">{label}</p>
      <p style={{ color: '#B8872E' }}>{payload[0].value} طلب</p>
    </div>
  )
}

function BarTooltipContent({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-brand text-white px-3 py-2 rounded-lg text-xs font-bold shadow-lg">
      <p style={{ color: '#B8872E' }} className="mb-0.5">{label}</p>
      <p>{payload[0].value} طلب</p>
    </div>
  )
}

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
    const cancelled  = filtered.filter(o => o.status === 'cancelled')
    const terminal   = delivered.length + cancelled.length
    return {
      totalSales:   delivered.reduce((s, o) => s + (o.total_price ?? 0), 0),
      totalOrders:  filtered.length,
      deliveryRate: terminal > 0 ? (delivered.length / terminal) * 100 : 0,
      avgOrder:     filtered.length > 0
        ? filtered.reduce((s, o) => s + (o.total_price ?? 0), 0) / filtered.length
        : 0,
    }
  }, [filtered])

  const financial = useMemo(() => {
    const now             = new Date()
    const thisMonthStart  = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastMonthStart  = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const thisMonth = orders
      .filter(o => new Date(o.created_at) >= thisMonthStart)
      .reduce((s, o) => s + (o.total_price ?? 0), 0)
    const lastMonth = orders
      .filter(o => { const d = new Date(o.created_at); return d >= lastMonthStart && d < thisMonthStart })
      .reduce((s, o) => s + (o.total_price ?? 0), 0)
    const monthChange = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null
    const delivered = filtered.filter(o => o.status === 'delivered')
    return {
      thisMonth,
      lastMonth,
      monthChange,
      totalDelivery: delivered.reduce((s, o) => s + (o.delivery_price ?? 0), 0),
      actualRevenue: delivered.reduce((s, o) => s + (o.products_total ?? 0), 0),
    }
  }, [orders, filtered])

  const dailyData = useMemo(() => {
    const days: Record<string, number> = {}
    const now = new Date()
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      days[`${d.getDate()}/${d.getMonth() + 1}`] = 0
    }
    orders.forEach(o => {
      const d   = new Date(o.created_at)
      const key = `${d.getDate()}/${d.getMonth() + 1}`
      if (key in days) days[key]++
    })
    return Object.entries(days).map(([date, count]) => ({ date, count }))
  }, [orders])

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {}
    filtered.forEach(o => { counts[o.status] = (counts[o.status] ?? 0) + 1 })
    return Object.entries(counts)
      .map(([status, value]) => ({ name: STATUS_LABELS[status] ?? status, value, status }))
      .sort((a, b) => b.value - a.value)
  }, [filtered])

  const topWilayasByCount = useMemo(() => {
    const counts: Record<string, number> = {}
    filtered.forEach(o => {
      const name = o.wilaya_name ?? o.wilaya ?? 'غير محدد'
      counts[name] = (counts[name] ?? 0) + 1
    })
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }))
  }, [filtered])

  const topProducts = useMemo(() => {
    const qty: Record<string, number> = {}
    filtered.forEach(o =>
      (o.order_items ?? []).forEach(item => {
        qty[item.product_name] = (qty[item.product_name] ?? 0) + item.quantity
      })
    )
    return Object.entries(qty)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count], i) => ({ rank: i + 1, name, count }))
  }, [filtered])

  const topWilayasByRevenue = useMemo(() => {
    const rev: Record<string, number> = {}
    filtered.forEach(o => {
      const name = o.wilaya_name ?? o.wilaya ?? 'غير محدد'
      rev[name] = (rev[name] ?? 0) + (o.total_price ?? 0)
    })
    return Object.entries(rev)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, revenue], i) => ({ rank: i + 1, name, revenue }))
  }, [filtered])

  const returnRates = useMemo(() => {
    const data: Record<string, { total: number; cancelled: number }> = {}
    filtered.forEach(o => {
      const name = o.wilaya_name ?? o.wilaya ?? 'غير محدد'
      if (!data[name]) data[name] = { total: 0, cancelled: 0 }
      data[name].total++
      if (o.status === 'cancelled') data[name].cancelled++
    })
    return Object.entries(data)
      .filter(([, d]) => d.total >= 3)
      .map(([name, d]) => ({
        name,
        total:     d.total,
        cancelled: d.cancelled,
        rate:      (d.cancelled / d.total) * 100,
      }))
      .sort((a, b) => b.rate - a.rate)
  }, [filtered])

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-center">
        <BarChart2 size={56} className="text-muted opacity-20" />
        <p className="font-heading font-black text-xl text-brand">لا توجد بيانات</p>
        <p className="font-body text-sm text-muted">ستظهر الإحصاءات بمجرد ورود الطلبات</p>
      </div>
    )
  }

  const rankBadge = (rank: number) => cn(
    'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-heading font-black flex-shrink-0',
    rank === 1 ? 'bg-accent text-white' :
    rank === 2 ? 'bg-surface text-brand border border-accent/40' :
                 'bg-surface text-muted'
  )

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-heading font-black text-2xl text-brand">الإحصاءات</h1>
        <div className="flex gap-1 bg-white border border-border rounded-xl p-1">
          {([
            { key: '30d' as Period, label: 'آخر 30 يوم'  },
            { key: '90d' as Period, label: 'آخر 3 أشهر' },
            { key: 'all' as Period, label: 'كل الوقت'    },
          ]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={cn(
                'px-4 py-1.5 rounded-lg text-xs font-heading font-bold whitespace-nowrap transition-all',
                period === key ? 'bg-brand text-white shadow-sm' : 'text-muted hover:text-brand'
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI Cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي المبيعات',   value: `${fmt(kpis.totalSales)} دج`,       icon: TrendingUp, iconCls: 'text-emerald-600', bgCls: 'bg-emerald-50' },
          { label: 'عدد الطلبات',        value: fmt(kpis.totalOrders),               icon: ShoppingBag, iconCls: 'text-blue-600',    bgCls: 'bg-blue-50'    },
          { label: 'نسبة التسليم',       value: `${kpis.deliveryRate.toFixed(1)}٪`,  icon: Package,     iconCls: 'text-amber-700',   bgCls: 'bg-amber-50'   },
          { label: 'متوسط قيمة الطلب',  value: `${fmt(kpis.avgOrder)} دج`,          icon: DollarSign,  iconCls: 'text-violet-600',  bgCls: 'bg-violet-50'  },
        ].map(({ label, value, icon: Icon, iconCls, bgCls }) => (
          <div key={label} className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-heading font-bold text-muted leading-snug">{label}</span>
              <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', bgCls)}>
                <Icon size={16} className={iconCls} />
              </div>
            </div>
            <p className="font-heading font-black text-xl text-brand leading-none tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* ── Financial Summary ───────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Month comparison */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
          <p className="text-xs font-heading font-bold text-muted">هذا الشهر مقابل الشهر الماضي</p>
          <p className="font-heading font-black text-xl text-brand tabular-nums">{fmt(financial.thisMonth)} دج</p>
          <div className="flex items-center gap-2 flex-wrap">
            {financial.monthChange !== null ? (
              <>
                {financial.monthChange >= 0 ? (
                  <span className="flex items-center gap-1 text-xs font-heading font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                    <ArrowUp size={10} />{Math.abs(financial.monthChange).toFixed(1)}٪
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs font-heading font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                    <ArrowDown size={10} />{Math.abs(financial.monthChange).toFixed(1)}٪
                  </span>
                )}
                <span className="text-xs text-muted font-body">مقارنة بـ {fmt(financial.lastMonth)} دج</span>
              </>
            ) : (
              <span className="text-xs text-muted font-body">لا توجد بيانات للشهر الماضي</span>
            )}
          </div>
        </div>

        {/* Delivery revenue */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
          <p className="text-xs font-heading font-bold text-muted">إجمالي التوصيل المحصّل</p>
          <p className="font-heading font-black text-xl text-brand tabular-nums">{fmt(financial.totalDelivery)} دج</p>
          <p className="text-xs text-muted font-body">للطلبات المُسلَّمة فقط</p>
        </div>

        {/* Actual revenue */}
        <div className="bg-white rounded-2xl border border-border p-5 space-y-2">
          <p className="text-xs font-heading font-bold text-muted">الإيراد الفعلي</p>
          <p className="font-heading font-black text-xl text-accent tabular-nums">{fmt(financial.actualRevenue)} دج</p>
          <p className="text-xs text-muted font-body">صافي المنتجات للطلبات المُسلَّمة</p>
        </div>
      </div>

      {/* ── Charts ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Line chart — daily orders */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="font-heading font-bold text-sm text-brand mb-5">الطلبات اليومية — آخر 30 يوم</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dailyData} margin={{ top: 4, right: 8, bottom: 0, left: -24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" vertical={false} />
              <XAxis
                dataKey="date"
                interval={6}
                tick={{ fill: '#7A6A58', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#7A6A58', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<LineTooltip />} />
              <Line
                type="monotone"
                dataKey="count"
                stroke="#B8872E"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#B8872E', strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart — status distribution */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="font-heading font-bold text-sm text-brand mb-5">توزيع الطلبات حسب الحالة</p>
          {statusData.length === 0 ? (
            <div className="h-[180px] flex items-center justify-center text-xs text-muted">لا توجد بيانات</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={68}
                    paddingAngle={3}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {statusData.map(entry => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#94A3B8'} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-3">
                {statusData.map(entry => (
                  <div key={entry.status} className="flex items-center gap-2 text-xs font-body">
                    <span
                      className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: STATUS_COLORS[entry.status] ?? '#94A3B8' }}
                    />
                    <span className="text-muted truncate">{entry.name}</span>
                    <span className="font-heading font-bold text-brand mr-auto tabular-nums">{entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Horizontal bar — top wilayas by count */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="font-heading font-bold text-sm text-brand mb-5">أكثر 10 ولايات طلباً</p>
          {topWilayasByCount.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-xs text-muted">لا توجد بيانات</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={topWilayasByCount}
                layout="vertical"
                margin={{ top: 0, right: 28, bottom: 0, left: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DDD0" horizontal={false} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fill: '#7A6A58', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={68}
                  tick={{ fill: '#1A1410', fontSize: 10, fontFamily: 'sans-serif' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip content={<BarTooltipContent />} />
                <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Rankings ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Top 5 products */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="font-heading font-bold text-sm text-brand mb-4">أفضل 5 منتجات مبيعاً</p>
          {topProducts.length === 0 ? (
            <p className="text-xs text-muted font-body text-center py-6">لا توجد بيانات</p>
          ) : (
            <div className="divide-y divide-border">
              {topProducts.map(({ rank, name, count }) => (
                <div key={name} className="flex items-center gap-3 py-2.5">
                  <span className={rankBadge(rank)}>{rank}</span>
                  <span className="font-heading font-bold text-sm text-brand flex-1 truncate">{name}</span>
                  <span className="text-xs font-heading font-bold text-muted tabular-nums flex-shrink-0">{fmt(count)} قطعة</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top 10 wilayas by revenue */}
        <div className="bg-white rounded-2xl border border-border p-5">
          <p className="font-heading font-bold text-sm text-brand mb-4">أعلى 10 ولايات إيراداً</p>
          {topWilayasByRevenue.length === 0 ? (
            <p className="text-xs text-muted font-body text-center py-6">لا توجد بيانات</p>
          ) : (
            <div className="divide-y divide-border">
              {topWilayasByRevenue.map(({ rank, name, revenue }) => (
                <div key={name} className="flex items-center gap-3 py-2.5">
                  <span className={rankBadge(rank)}>{rank}</span>
                  <span className="font-heading font-bold text-sm text-brand flex-1 truncate">{name}</span>
                  <span className="text-xs font-heading font-bold text-accent tabular-nums flex-shrink-0">{fmt(revenue)} دج</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Return Rate Table ────────────────────────────────── */}
      {returnRates.length > 0 && (
        <div className="bg-white rounded-2xl border border-border overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <p className="font-heading font-bold text-sm text-brand">نسبة الإرجاع حسب الولاية</p>
            <p className="text-xs text-muted font-body mt-0.5">الولايات التي لديها 3 طلبات على الأقل — مرتبة تنازلياً</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface/50 border-b border-border">
                <tr>
                  {['الولاية', 'الطلبات', 'الملغي', 'نسبة الإرجاع'].map(h => (
                    <th key={h} className="text-right px-5 py-3 font-heading font-bold text-xs text-muted whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {returnRates.map(row => (
                  <tr key={row.name} className={cn('transition-colors', row.rate > 30 ? 'bg-amber-50/50' : 'hover:bg-surface/30')}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-bold text-brand">{row.name}</span>
                        {row.rate > 30 && (
                          <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold leading-none">
                            تنبيه
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3 font-body text-brand tabular-nums">{row.total}</td>
                    <td className="px-5 py-3 font-body text-muted tabular-nums">{row.cancelled}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        'inline-flex font-heading font-bold text-xs px-2.5 py-1 rounded-full',
                        row.rate > 30  ? 'bg-amber-100 text-amber-800' :
                        row.rate > 15  ? 'bg-blue-50 text-blue-700'   :
                                         'bg-emerald-50 text-emerald-700'
                      )}>
                        {row.rate.toFixed(1)}٪
                      </span>
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
