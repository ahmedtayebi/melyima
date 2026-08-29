'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Minus, Plus, Save, Trash2 } from 'lucide-react'
import { DELIVERY_PRICES } from '@/lib/delivery-prices'
import type { Order, Product } from '@/lib/types'

type EditableItem = {
  key: string
  product_id: string
  color_id: string
  size_id: string
  quantity: number
}

type CommuneOption = {
  name: string
  has_stop_desk: boolean
}

interface Props {
  order: Order
  products: Product[]
  onCancel: () => void
  onSaved: () => void | Promise<void>
}

function initialItems(order: Order): EditableItem[] {
  const items = (order.order_items ?? []).map(item => ({
    key: item.id,
    product_id: item.product_id ?? '',
    color_id: item.color_id ?? '',
    size_id: item.size_id ?? '',
    quantity: item.quantity,
  }))

  return items.length > 0
    ? items
    : [{ key: crypto.randomUUID(), product_id: '', color_id: '', size_id: '', quantity: 1 }]
}

function makeItem(product?: Product): EditableItem {
  const colors = product?.product_colors ?? []
  const sizes = product?.product_sizes ?? []

  return {
    key: crypto.randomUUID(),
    product_id: product?.id ?? '',
    color_id: colors[0]?.id ?? '',
    size_id: sizes[0]?.id ?? '',
    quantity: 1,
  }
}

export default function OrderEditForm({ order, products, onCancel, onSaved }: Props) {
  const locked =
    order.status === 'delivered' ||
    order.status === 'cancelled' ||
    order.ecotrack_status === 'shipped'
  const lockedLabel = order.status === 'cancelled'
    ? 'الطلب ملغي'
    : order.status === 'delivered'
      ? 'الطلب مُسلَّم'
      : 'الطلب أُرسل للشحن'
  const [customerName, setCustomerName] = useState(order.customer_name)
  const [phone, setPhone] = useState(order.phone)
  const [phone2, setPhone2] = useState(order.phone2 ?? '')
  const [wilaya, setWilaya] = useState(order.wilaya.padStart(2, '0'))
  const [deliveryType, setDeliveryType] = useState<'home' | 'office'>(order.delivery_type)
  const [commune, setCommune] = useState(order.commune ?? '')
  const [address, setAddress] = useState(order.address ?? '')
  const [notes, setNotes] = useState(order.notes ?? '')
  const [items, setItems] = useState<EditableItem[]>(() => initialItems(order))
  const [communes, setCommunes] = useState<CommuneOption[]>([])
  const [communesLoading, setCommunesLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  )

  useEffect(() => {
    if (!wilaya || locked) return
    const controller = new AbortController()
    const stopDesk = deliveryType === 'office' ? '&stop_desk=1' : ''
    setCommunesLoading(true)

    fetch(`/api/ecotrack/communes?wilaya_id=${Number(wilaya)}${stopDesk}`, {
      signal: controller.signal,
    })
      .then(response => response.json())
      .then(data => {
        if (data.success && Array.isArray(data.communes)) setCommunes(data.communes)
      })
      .catch(() => undefined)
      .finally(() => setCommunesLoading(false))

    return () => controller.abort()
  }, [deliveryType, locked, wilaya])

  const deliveryEntry = DELIVERY_PRICES.find(entry => entry.code === wilaya)
  const deliveryPrice = deliveryEntry
    ? (deliveryType === 'home' ? deliveryEntry.home : deliveryEntry.office)
    : 0
  const productsTotal = items.reduce((total, item) => {
    const product = products.find(entry => entry.id === item.product_id)
    return total + (product?.price ?? 0) * item.quantity
  }, 0)

  const updateItem = (key: string, values: Partial<EditableItem>) => {
    setItems(current => current.map(item => item.key === key ? { ...item, ...values } : item))
  }

  const selectProduct = (key: string, productId: string) => {
    const product = products.find(entry => entry.id === productId)
    const replacement = makeItem(product)
    updateItem(key, {
      product_id: productId,
      color_id: replacement.color_id,
      size_id: replacement.size_id,
      quantity: 1,
    })
  }

  const addItem = () => setItems(current => [...current, makeItem(sortedProducts[0])])
  const removeItem = (key: string) => {
    setItems(current => current.length === 1 ? current : current.filter(item => item.key !== key))
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)

    const normalizedItems = items.map(item => ({
      product_id: item.product_id,
      color_id: item.color_id,
      size_id: item.size_id,
      quantity: item.quantity,
    }))
    const combinations = normalizedItems.map(item => `${item.product_id}:${item.color_id}:${item.size_id}`)

    if (!locked && normalizedItems.some(item => !item.product_id || !item.color_id || !item.size_id)) {
      setError('اختاري المنتج واللون والمقاس لكل سطر')
      return
    }
    if (!locked && new Set(combinations).size !== combinations.length) {
      setError('نفس المنتج واللون والمقاس مكرر داخل الطلب')
      return
    }

    setSaving(true)
    try {
      const response = await fetch(`/api/orders/${order.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: customerName,
          phone,
          phone2,
          wilaya,
          delivery_type: deliveryType,
          commune,
          address,
          notes,
          items: normalizedItems,
        }),
      })
      const data = await response.json()

      if (!response.ok || !data.success) {
        setError(data.error ?? 'تعذّر حفظ التعديلات')
        return
      }

      await onSaved()
    } catch {
      setError('تعذّر الاتصال بالخادم')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="w-full space-y-6 pb-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading font-black text-2xl text-brand">تعديل الطلب</h1>
          <p className="text-xs text-muted font-body mt-1" dir="ltr">
            #{order.id.slice(-8).toUpperCase()}
          </p>
        </div>
      </div>

      {locked && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 rounded-lg">
          <p className="font-heading font-bold text-sm text-amber-900">{lockedLabel}</p>
          <p className="font-body text-xs text-amber-800 mt-1">
            يمكن تعديل ملاحظة الزبون الداخلية فقط. بقية البيانات مقفلة حتى لا تختلف عن شركة التوصيل.
          </p>
        </div>
      )}

      {!locked && order.status === 'confirmed' && (
        <div className="border border-blue-200 bg-blue-50 px-4 py-3 rounded-lg text-sm text-blue-900 font-body">
          سيبقى الطلب مؤكدًا، وستُحدَّث مسودة Ecotrack تلقائيًا عند الحفظ.
        </div>
      )}

      <section className="bg-white border border-border rounded-lg p-4 sm:p-6 space-y-4">
        <h2 className="font-heading font-black text-lg text-brand">بيانات الزبون</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="الاسم">
            <input value={customerName} onChange={event => setCustomerName(event.target.value)} disabled={locked} />
          </Field>
          <Field label="رقم الهاتف">
            <input value={phone} onChange={event => setPhone(event.target.value)} disabled={locked} dir="ltr" inputMode="numeric" />
          </Field>
          <Field label="رقم الهاتف الثاني">
            <input value={phone2} onChange={event => setPhone2(event.target.value)} disabled={locked} dir="ltr" inputMode="numeric" />
          </Field>
        </div>
      </section>

      <section className="bg-white border border-border rounded-lg p-4 sm:p-6 space-y-4">
        <h2 className="font-heading font-black text-lg text-brand">التوصيل</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="الولاية">
            <select
              value={wilaya}
              disabled={locked}
              onChange={event => {
                setWilaya(event.target.value)
                setCommune('')
              }}
            >
              {DELIVERY_PRICES.map(entry => (
                <option key={entry.code} value={entry.code}>{entry.code} - {entry.name}</option>
              ))}
            </select>
          </Field>
          <div>
            <p className="font-heading font-bold text-sm text-brand mb-2">نوع التوصيل</p>
            <div className="grid grid-cols-2 border border-border rounded-lg overflow-hidden h-12">
              {([
                ['home', 'للمنزل'],
                ['office', 'للمكتب'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    setDeliveryType(value)
                    setCommune('')
                  }}
                  className={deliveryType === value ? 'bg-brand text-white font-bold' : 'bg-white text-muted'}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Field label={deliveryType === 'office' ? 'مكتب الاستلام' : 'البلدية'}>
            <select value={commune} onChange={event => setCommune(event.target.value)} disabled={locked || communesLoading}>
              <option value="">{communesLoading ? 'جارٍ التحميل...' : 'اختاري البلدية'}</option>
              {commune && !communes.some(entry => entry.name === commune) && (
                <option value={commune}>{commune}</option>
              )}
              {communes.map(entry => <option key={entry.name} value={entry.name}>{entry.name}</option>)}
            </select>
          </Field>
          {deliveryType === 'home' && (
            <Field label="العنوان الكامل">
              <input value={address} onChange={event => setAddress(event.target.value)} disabled={locked} />
            </Field>
          )}
        </div>
      </section>

      {!locked && (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-heading font-black text-lg text-brand">المنتجات</h2>
            <button
              type="button"
              onClick={addItem}
              className="inline-flex items-center gap-1.5 bg-brand text-white px-3 py-2 rounded-lg text-sm font-heading font-bold"
            >
              <Plus size={15} />
              إضافة منتج
            </button>
          </div>

          <div className="grid gap-3">
            {items.map(item => {
              const product = products.find(entry => entry.id === item.product_id)
              const colors = (product?.product_colors ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)
              const sizes = (product?.product_sizes ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)

              return (
                <div key={item.key} className="bg-white border border-border rounded-lg p-4 grid sm:grid-cols-[2fr_1fr_1fr_auto_auto] gap-3 items-end">
                  <Field label="المنتج">
                    <select value={item.product_id} onChange={event => selectProduct(item.key, event.target.value)}>
                      <option value="">اختاري المنتج</option>
                      {sortedProducts.map(entry => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}{entry.is_visible ? '' : ' (مخفي)'}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="اللون">
                    <select value={item.color_id} onChange={event => updateItem(item.key, { color_id: event.target.value })}>
                      <option value="">اللون</option>
                      {colors.map(color => <option key={color.id} value={color.id}>{color.name}</option>)}
                    </select>
                  </Field>
                  <Field label="المقاس">
                    <select value={item.size_id} onChange={event => updateItem(item.key, { size_id: event.target.value })}>
                      <option value="">المقاس</option>
                      {sizes.map(size => <option key={size.id} value={size.id}>{size.label}</option>)}
                    </select>
                  </Field>
                  <div>
                    <p className="font-heading font-bold text-sm text-brand mb-2">الكمية</p>
                    <div className="flex items-center border border-border rounded-lg h-12 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => updateItem(item.key, { quantity: Math.max(1, item.quantity - 1) })}
                        className="w-10 h-full grid place-items-center"
                        aria-label="إنقاص الكمية"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center font-bold tabular-nums">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateItem(item.key, { quantity: Math.min(20, item.quantity + 1) })}
                        className="w-10 h-full grid place-items-center"
                        aria-label="زيادة الكمية"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    disabled={items.length === 1}
                    className="w-12 h-12 grid place-items-center border border-red-200 text-red-600 rounded-lg disabled:opacity-30"
                    aria-label="حذف المنتج"
                  >
                    <Trash2 size={17} />
                  </button>
                </div>
              )
            })}
          </div>
        </section>
      )}

      <section className="bg-white border border-border rounded-lg p-4 sm:p-6 space-y-3">
        <label htmlFor="order-notes" className="font-heading font-black text-lg text-brand block">
          ملاحظة الزبون الداخلية
        </label>
        <textarea
          id="order-notes"
          value={notes}
          onChange={event => setNotes(event.target.value)}
          rows={4}
          maxLength={1000}
          className="w-full border border-border rounded-lg px-4 py-3 text-right resize-y focus:outline-none focus:border-brand"
        />
        <p className="text-xs text-muted font-body">لا تُرسل هذه الملاحظة إلى شركة التوصيل.</p>
      </section>

      {!locked && (
        <div className="bg-surface border-y border-border px-4 py-4 grid grid-cols-3 gap-3 text-center">
          <Price label="المنتجات" value={productsTotal} />
          <Price label="التوصيل" value={deliveryPrice} />
          <Price label="الإجمالي" value={productsTotal + deliveryPrice} accent />
        </div>
      )}

      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm font-body">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-5 py-3 border border-border rounded-lg font-heading font-bold text-sm text-muted disabled:opacity-50"
        >
          إلغاء
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 min-w-40 bg-accent text-white px-5 py-3 rounded-lg font-heading font-bold text-sm disabled:opacity-60"
        >
          {saving ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
          {locked ? 'حفظ الملاحظة' : 'حفظ التعديلات'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactElement<{ className?: string }> }) {
  return (
    <label className="block">
      <span className="font-heading font-bold text-sm text-brand mb-2 block">{label}</span>
      <span className="block [&>input]:w-full [&>input]:h-12 [&>input]:border [&>input]:border-border [&>input]:rounded-lg [&>input]:px-4 [&>input]:bg-white [&>input]:text-right [&>input]:focus:outline-none [&>input]:focus:border-brand [&>input]:disabled:bg-surface [&>select]:w-full [&>select]:h-12 [&>select]:border [&>select]:border-border [&>select]:rounded-lg [&>select]:px-3 [&>select]:bg-white [&>select]:text-right [&>select]:focus:outline-none [&>select]:focus:border-brand [&>select]:disabled:bg-surface">
        {children}
      </span>
    </label>
  )
}

function Price({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted font-body">{label}</p>
      <p className={accent ? 'font-heading font-black text-accent mt-1' : 'font-heading font-bold text-brand mt-1'}>
        {value.toLocaleString('ar-DZ')} دج
      </p>
    </div>
  )
}
