'use client'

import { useEffect, useState } from 'react'
import type { Order } from '@/lib/types'
import type { OrderRepair, RestoreIssue } from '@/lib/order-restoration'

type ProductChoice = {
  id: string; name: string
  product_colors: { id: string; name: string; is_visible: boolean }[]
  product_sizes: { id: string; label: string; is_visible: boolean }[]
}

export default function OrderRestoreForm({ order, initialIssues, onRestored, onCancel }: {
  order: Order; initialIssues: RestoreIssue[]
  onRestored: (order: Order, alreadyRestored: boolean) => void
  onCancel: () => void
}) {
  const [products, setProducts] = useState<ProductChoice[]>([])
  const [issues, setIssues] = useState(initialIssues)
  const [repairs, setRepairs] = useState<Record<string, OrderRepair>>({})
  const [version, setVersion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/orders/${order.id}?restore_options=1`, { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json()
        if (!response.ok || !result.success) throw new Error(result.error || 'تعذّر تحميل الخيارات')
        if (controller.signal.aborted) return
        setProducts(result.products ?? [])
        setVersion(result.order.updated_at)
      })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'تعذّر تحميل الخيارات') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [order.id])

  const selection = (issue: RestoreIssue): OrderRepair => {
    const selected = repairs[issue.item_id] ?? issue
    const product = products.find(p => p.id === selected.product_id)
    return {
      item_id: issue.item_id, product_id: product?.id ?? '',
      color_id: product?.product_colors.some(c => c.id === selected.color_id) ? selected.color_id ?? '' : '',
      size_id: product?.product_sizes.some(s => s.id === selected.size_id) ? selected.size_id ?? '' : '',
    }
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving || loading || !version) return
    const next = { ...repairs }
    for (const issue of issues) next[issue.item_id] = selection(issue)
    const values = Object.values(next)
    if (values.some(item => !item.product_id || !item.color_id || !item.size_id)) {
      setError('اختاري المنتج واللون والمقاس لكل عنصر قبل الاسترجاع.')
      return
    }
    setSaving(true)
    setError('')
    setRepairs(next)
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', repairs: values, expected_updated_at: version }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        setError(result.error || 'تعذّر استرجاع الطلب')
        if (Array.isArray(result.issues)) setIssues(result.issues)
        if (result.expected_updated_at) setVersion(result.expected_updated_at)
        return
      }
      onRestored(result.order, Boolean(result.already_restored))
    } catch {
      setError('تعذّر الاتصال بالخادم. يمكنك إعادة المحاولة؛ لن يُحجز المخزون مرتين.')
    } finally { setSaving(false) }
  }

  return (
    <form onSubmit={save} className="space-y-5">
      <h2 className="font-heading font-bold text-xl text-brand">مراجعة خيارات الطلب قبل الاسترجاع</h2>
      <p className="text-sm text-muted">لم يكتمل الاسترجاع. راجعي العناصر أدناه واختاري بدائلها عند الحاجة. ستبقى الكميات والإجمالي المتفق عليه كما هما، ويُحجز المخزون عند نجاح العملية كاملة.</p>
      {loading && <p role="status">جارٍ تحميل الخيارات الحالية…</p>}
      {issues.map(issue => {
        const value = selection(issue)
        const product = products.find(p => p.id === value.product_id)
        const change = (patch: Partial<OrderRepair>) => setRepairs(prev => ({ ...prev, [issue.item_id]: { ...value, ...patch } }))
        return <fieldset key={issue.item_id} disabled={loading || saving} className="border border-border rounded-xl p-4 space-y-3">
          <legend className="font-bold px-2">{issue.product_name} — {issue.color_name} — {issue.size_label} × {issue.quantity}</legend>
          <p className="text-sm text-red-700">{issue.reason === 'insufficient_stock'
            ? `المتاح ${issue.available_stock ?? 0}، والمطلوب لهذه التركيبة ${issue.required_stock ?? issue.quantity}. اختاري بديلاً أو صحّحي المخزون ثم أعيدي المحاولة.`
            : 'أحد الخيارات الأصلية مفقود أو لا يمكن تحديد مطابقه بشكل وحيد.'}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="space-y-1"><span>المنتج</span>
              <select className="w-full border border-border rounded-lg p-2" value={value.product_id}
                onChange={e => change({ product_id: e.target.value, color_id: '', size_id: '' })}>
                <option value="">اختاري المنتج</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span>اللون</span>
              <select className="w-full border border-border rounded-lg p-2" value={value.color_id} onChange={e => change({ color_id: e.target.value })}>
                <option value="">اختاري اللون</option>
                {product?.product_colors.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_visible ? '' : ' (مخفي)'}</option>)}
              </select>
            </label>
            <label className="space-y-1"><span>المقاس</span>
              <select className="w-full border border-border rounded-lg p-2" value={value.size_id} onChange={e => change({ size_id: e.target.value })}>
                <option value="">اختاري المقاس</option>
                {product?.product_sizes.map(s => <option key={s.id} value={s.id}>{s.label}{s.is_visible ? '' : ' (مخفي)'}</option>)}
              </select>
            </label>
          </div>
        </fieldset>
      })}
      {error && <p role="alert" className="text-red-700 bg-red-50 rounded-lg p-3">{error}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={loading || saving || !version} className="bg-accent text-white rounded-lg px-4 py-3 font-bold disabled:opacity-50">{saving ? 'جارٍ الاسترجاع…' : 'تأكيد الخيارات واسترجاع الطلب'}</button>
        <button type="button" disabled={saving} onClick={onCancel} className="border border-border rounded-lg px-4 py-3">إلغاء</button>
      </div>
    </form>
  )
}
