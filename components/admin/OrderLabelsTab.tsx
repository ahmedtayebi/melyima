'use client'

import { useEffect, useRef, useState } from 'react'
import { Printer, RefreshCw, Loader2 } from 'lucide-react'
import type { LabelOrder } from '@/lib/order-labels'
import { buildLabelsPdf, type LabelFailure } from '@/lib/build-labels-pdf'

const PER_PAGE = 50

export default function OrderLabelsTab() {
  const [orders, setOrders] = useState<LabelOrder[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(0)
  const [total, setTotal] = useState(0)
  const [failures, setFailures] = useState<LabelFailure[]>([])
  const [output, setOutput] = useState<{ url: string; count: number; cancelled: boolean } | null>(null)
  const mounted = useRef(false)
  const request = useRef<AbortController | null>(null)
  const outputUrl = useRef<string | null>(null)
  const preparing = useRef(false)

  const refresh = async () => {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/ecotrack/labels', { cache: 'no-store', signal: controller.signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'تعذّر تحميل البوالص.')
      if (controller.signal.aborted) return
      setOrders(result.orders)
      setSelected(previous => new Set([...previous].filter(id => result.orders.some((order: LabelOrder) => order.id === id))))
      setPage(1)
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : 'تعذّر تحميل البوالص.')
    } finally { if (!controller.signal.aborted) setLoading(false) }
  }

  useEffect(() => {
    mounted.current = true
    void refresh()
    return () => {
      mounted.current = false
      request.current?.abort()
      if (outputUrl.current) URL.revokeObjectURL(outputUrl.current)
    }
  }, [])

  const filtered = orders.filter(order => `${order.customer_name} ${order.wilaya_name} ${order.ecotrack_tracking}`.toLowerCase().includes(search.trim().toLowerCase()))
  const allSelected = filtered.length > 0 && filtered.every(order => selected.has(order.id))
  const pages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const toggle = (ids: string[], checked: boolean) => setSelected(previous => {
    const next = new Set(previous)
    for (const id of ids) { if (checked) next.add(id); else next.delete(id) }
    return next
  })

  const prepare = async () => {
    if (preparing.current || !selected.size) return
    preparing.current = true
    const controller = new AbortController()
    request.current = controller
    const batch = orders.filter(order => selected.has(order.id))
    setBusy(true); setError(''); setDone(0); setTotal(batch.length); setFailures([]); setOutput(null)
    if (outputUrl.current) { URL.revokeObjectURL(outputUrl.current); outputUrl.current = null }
    try {
      const result = await buildLabelsPdf(batch, controller.signal, value => { if (mounted.current) setDone(value) })
      if (!mounted.current) return
      setFailures(result.failures)
      if (result.bytes) {
        const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' }))
        outputUrl.current = url
        setOutput({ url, count: result.included.length, cancelled: result.cancelled })
      } else setError(result.cancelled ? 'أُلغي التجهيز قبل جلب أي بوليصة.' : 'لم يتم تجهيز أي بوليصة. راجعي الأخطاء أدناه.')
      // Keep failed/unprocessed orders selected for a targeted retry.
      setSelected(new Set(batch.filter(order => !result.included.includes(order.id)).map(order => order.id)))
    } catch {
      if (mounted.current) setError('تعذّر تجهيز ملف الطباعة. أعيدي المحاولة.')
    } finally {
      preparing.current = false
      if (mounted.current) setBusy(false)
    }
  }

  return <section className="space-y-4" aria-label="طباعة البوالص">
    <div className="rounded-xl border border-border bg-white p-4 space-y-3">
      <h2 className="font-heading font-bold text-lg text-brand flex items-center gap-2"><Printer size={20} />طباعة البوالص الجاهزة للشحن</h2>
      <p className="text-sm text-muted">الطلبات المؤكدة التي لديها بوليصة ولم تُرسل للشحن بعد. تُجمع البوالص المحددة في ملف PDF واحد. الطباعة لا ترسل الطلبات للشحن.</p>
      <div className="flex flex-wrap gap-3 items-center">
        <button onClick={() => void refresh()} disabled={busy || loading} className="flex gap-2 items-center border border-border rounded-lg px-3 py-2 disabled:opacity-50"><RefreshCw size={16} />تحديث القائمة</button>
        <span className="text-sm">{orders.length} بوليصة متاحة · {selected.size} محددة</span>
        <button onClick={() => void prepare()} disabled={busy || loading || !selected.size} className="flex gap-2 items-center bg-accent text-white font-bold rounded-lg px-4 py-2 disabled:opacity-50">{busy ? <Loader2 className="animate-spin" size={16} /> : <Printer size={16} />}تجهيز البوالص المحددة للطباعة</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-lg bg-red-50 text-red-700 p-3">{error}</p>}
    {busy && <div role="status" className="flex items-center gap-4"><span>جارٍ تجهيز البوالص: {done} / {total}</span><button className="underline" onClick={() => request.current?.abort()}>إيقاف التجهيز</button></div>}
    {output && <div className="rounded-xl border border-border bg-surface p-4 space-y-3" role="status">
      <p className="font-bold">{output.count === total && !output.cancelled ? 'اكتمل التجهيز' : 'اكتمل التجهيز جزئيًا'}: يحتوي الملف على بوالص {output.count} طلبات من أصل {total}.</p>
      <div className="flex flex-wrap gap-4">
        <a href={output.url} target="_blank" rel="noopener noreferrer" className="font-bold text-accent underline">فتح الملف وطباعته</a>
        <a href={output.url} download="ecotrack-labels.pdf" className="underline">تنزيل PDF</a>
      </div>
      <p className="text-sm text-muted">افتحي الملف ثم اختاري الطباعة من عارض PDF. الطلبات التي لم تُجهّز بقيت محددة لإعادة المحاولة.</p>
    </div>}
    {failures.length > 0 && <div role="alert" className="rounded-lg border border-red-200 p-3 text-red-700">
      <p className="font-bold">تعذّر تجهيز {failures.length} بوليصة:</p>
      <ul className="list-disc pr-5 mt-2">{failures.map(f => <li key={f.id}>{f.name} (…{f.id.slice(-8)}): {f.error}</li>)}</ul>
    </div>}
    <input aria-label="بحث في البوالص" placeholder="بحث بالاسم أو الولاية أو رقم التتبع…" value={search} disabled={busy}
      onChange={event => { setSearch(event.target.value); setPage(1) }} className="w-full rounded-xl border border-border bg-white p-3" />
    {loading ? <p role="status">جارٍ تحميل البوالص…</p> : <>
      <label className="flex gap-2 items-center"><input type="checkbox" checked={allSelected} disabled={busy || !filtered.length}
        onChange={event => toggle(filtered.map(order => order.id), event.target.checked)} />تحديد كل النتائج ({filtered.length})، بما فيها الصفحات الأخرى</label>
      <div className="overflow-x-auto rounded-xl border border-border bg-white">
        <table className="w-full text-sm text-right">
          <thead className="bg-surface"><tr>{['تحديد', 'الزبون', 'الولاية', 'رقم التتبع', 'تاريخ الطلب'].map(label => <th key={label} className="p-3">{label}</th>)}</tr></thead>
          <tbody>{filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(order => <tr key={order.id} className="border-t border-border">
            <td className="p-3"><input type="checkbox" aria-label={`تحديد بوليصة ${order.customer_name}`} checked={selected.has(order.id)} disabled={busy} onChange={event => toggle([order.id], event.target.checked)} /></td>
            <td className="p-3">{order.customer_name}</td><td className="p-3">{order.wilaya_name}</td><td className="p-3" dir="ltr">{order.ecotrack_tracking}</td>
            <td className="p-3 whitespace-nowrap">{new Date(order.created_at).toLocaleDateString('ar-DZ')}</td>
          </tr>)}</tbody>
        </table>
        {!filtered.length && <p className="p-6 text-center text-muted">لا توجد بوالص مطابقة جاهزة للشحن.</p>}
      </div>
      {pages > 1 && <div className="flex justify-center items-center gap-4">
        <button disabled={page === 1} onClick={() => setPage(value => value - 1)}>السابق</button><span>{page} / {pages}</span>
        <button disabled={page === pages} onClick={() => setPage(value => value + 1)}>التالي</button>
      </div>}
    </>}
  </section>
}
