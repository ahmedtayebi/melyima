'use client'

import { useEffect, useState, useMemo } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { useCartStore } from '@/lib/cart-store'
import { DELIVERY_PRICES } from '@/lib/delivery-prices'
import { getCommunesByWilaya } from '@/lib/communes'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'

interface OrderFormProps {
  onSuccess: () => void
}

type OfficeCommune = {
  name: string
  code_postal: string | null
  has_stop_desk: boolean
}

export default function OrderForm({ onSuccess }: OrderFormProps) {
  const items = useCartStore((state) => state.items)
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0)

  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    phone2: '',
    wilaya: '',
    commune: '',
    delivery_type: 'home' as 'home' | 'office',
    address: '',
    notes: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [officeCommunes, setOfficeCommunes] = useState<OfficeCommune[]>([])
  const [loadingOffices, setLoadingOffices] = useState(false)
  const [officeError, setOfficeError] = useState<string | null>(null)
  const [officesLoadedForWilaya, setOfficesLoadedForWilaya] = useState<string | null>(null)

  const selectedWilaya = useMemo(
    () => DELIVERY_PRICES.find(w => w.code === formData.wilaya),
    [formData.wilaya]
  )

  const deliveryPrice = selectedWilaya
    ? formData.delivery_type === 'home' ? selectedWilaya.home : selectedWilaya.office
    : 0

  const productsTotal = items.reduce((sum, item) => sum + (item.price ?? 0) * item.quantity, 0)
  const totalPrice = productsTotal + deliveryPrice

  useEffect(() => {
    if (!formData.wilaya || formData.delivery_type !== 'office') {
      setOfficeCommunes([])
      setOfficeError(null)
      setLoadingOffices(false)
      setOfficesLoadedForWilaya(null)
      return
    }

    const controller = new AbortController()
    setLoadingOffices(true)
    setOfficeError(null)
    setOfficeCommunes([])
    setOfficesLoadedForWilaya(null)

    fetch(`/api/ecotrack/communes?wilaya_id=${Number(formData.wilaya)}&stop_desk=1`, {
      signal: controller.signal,
    })
      .then(async res => {
        const data = await res.json()
        if (!res.ok || !data.success) throw new Error(data.error || 'تعذّر جلب مكاتب الاستلام')
        setOfficeCommunes(Array.isArray(data.communes) ? data.communes : [])
        setOfficesLoadedForWilaya(formData.wilaya)
      })
      .catch(err => {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setOfficeError(err instanceof Error ? err.message : 'تعذّر جلب مكاتب الاستلام')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingOffices(false)
      })

    return () => controller.abort()
  }, [formData.delivery_type, formData.wilaya])

  const officesLoaded = officesLoadedForWilaya === formData.wilaya
  const officesPending = formData.delivery_type === 'office' && !!formData.wilaya && !officesLoaded && !officeError

  const validate = () => {
    const next: Record<string, string> = {}
    if (!formData.customer_name.trim()) next.customer_name = 'الاسم الكامل مطلوب'
    const phone = formData.phone.replace(/\s+/g, '')
    if (!phone) next.phone = 'رقم الهاتف مطلوب'
    else if (!/^0[567]\d{8}$/.test(phone)) next.phone = 'رقم غير صحيح — يبدأ بـ 05، 06 أو 07 ويحتوي 10 أرقام'
    if (formData.phone2) {
      const phone2 = formData.phone2.replace(/\s+/g, '')
      if (!/^0[567]\d{8}$/.test(phone2)) next.phone2 = 'رقم غير صحيح'
    }
    if (!formData.wilaya) next.wilaya = 'يرجى اختيار الولاية'
    if (formData.delivery_type === 'home' && formData.wilaya && !formData.commune) {
      next.commune = 'يرجى اختيار البلدية'
    }
    if (formData.delivery_type === 'office' && formData.wilaya && !formData.commune) {
      next.commune = 'يرجى اختيار مكتب الاستلام'
    }
    if (formData.delivery_type === 'home' && !formData.address.trim()) {
      next.address = 'العنوان مطلوب للتوصيل للمنزل'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_name: formData.customer_name.trim(),
          phone: formData.phone.replace(/\s+/g, ''),
          phone2: formData.phone2.trim() || null,
          wilaya: formData.wilaya,
          wilaya_name: selectedWilaya?.name ?? '',
          delivery_type: formData.delivery_type,
          delivery_price: deliveryPrice,
          products_total: productsTotal,
          total_price: totalPrice,
          address: formData.delivery_type === 'home' ? formData.address.trim() : null,
          commune: formData.commune || null,
          notes: formData.notes.trim() || null,
          items,
        }),
      })
      const result = await res.json()
      if (!res.ok || !result.success) throw new Error(result.error || 'حدث خطأ، حاولي مجدداً')
      setOrderId(result.order_id)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'حدث خطأ في الاتصال، حاولي مجدداً')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Success screen ──────────────────────────────────────────
  if (orderId) {
    return (
      <div className="flex flex-col items-center text-center gap-5 py-2">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 220, damping: 18 }}
          className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center"
        >
          <Check size={30} className="text-green-600" strokeWidth={2.5} />
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h3 className="font-heading font-black text-xl text-brand mb-1.5">تم استلام طلبك بنجاح!</h3>
          <p className="text-muted font-body text-sm">سنتصل بكِ قريباً على الرقم المُدخل</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-surface rounded-xl px-8 py-3 border border-border"
        >
          <p className="text-xs text-muted font-body mb-1">رقم الطلب</p>
          <p className="font-heading font-black text-lg text-accent tracking-widest">
            #{orderId.slice(-8).toUpperCase()}
          </p>
        </motion.div>
        <motion.div className="w-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
          <Button fullWidth size="lg" onClick={onSuccess}>العودة للمتجر</Button>
        </motion.div>
      </div>
    )
  }

  // ── Order form ──────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-muted font-body -mt-1 mb-1">سنتواصل معكِ في أقرب وقت</p>

      {/* Order summary */}
      <div>
        <button
          type="button"
          onClick={() => setSummaryOpen(o => !o)}
          className="w-full flex items-center justify-between py-2.5 px-3 rounded-xl bg-surface border border-border font-heading font-bold text-sm text-brand hover:border-brand transition-colors"
        >
          <span>ملخص الطلب ({totalItems} قطعة)</span>
          <ChevronDown
            size={16}
            className={cn('text-muted transition-transform duration-200 flex-shrink-0', summaryOpen && 'rotate-180')}
          />
        </button>
        {summaryOpen && (
          <div className="mt-2 rounded-xl bg-surface border border-border divide-y divide-border">
            {items.map((item) => (
              <div key={`${item.product_id}-${item.color_id}-${item.size_id}`}
                className="py-2 px-3 flex items-center gap-2">
                <span className="font-heading font-bold text-sm text-brand flex-1 truncate">{item.product_name}</span>
                <span className="text-xs text-muted font-body flex-shrink-0">{item.color_name} / {item.size_label}</span>
                <span className="text-xs text-muted font-body flex-shrink-0 tabular-nums">×{item.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Name */}
      <Input
        label="الاسم "
        placeholder="فاطمة"
        value={formData.customer_name}
        onChange={e => setFormData(d => ({ ...d, customer_name: e.target.value }))}
        error={errors.customer_name}
        autoComplete="name"
      />

      {/* Phone */}
      <Input
        label="رقم الهاتف"
        type="tel"
        placeholder="0699596108"
        value={formData.phone}
        onChange={e => setFormData(d => ({ ...d, phone: e.target.value }))}
        error={errors.phone}
        dir="ltr"
        inputMode="numeric"
        autoComplete="tel"
      />

      {/* Phone 2 */}
      <Input
        label="رقم هاتف ثاني (اختياري)"
        type="tel"
        placeholder="0555123456"
        value={formData.phone2}
        onChange={e => setFormData(d => ({ ...d, phone2: e.target.value }))}
        error={errors.phone2}
        dir="ltr"
        inputMode="numeric"
      />

      {/* Wilaya */}
      <Select
        label="الولاية"
        options={DELIVERY_PRICES.map(w => ({ value: w.code, label: `${w.code} - ${w.name}` }))}
        placeholder="اختاري الولاية"
        value={formData.wilaya}
        onChange={e => setFormData(d => ({ ...d, wilaya: e.target.value, commune: '' }))}
        error={errors.wilaya}
      />

      
      {/* Delivery type — only after wilaya selected */}
      {formData.wilaya && (
        <div>
          <p className="font-heading font-bold text-sm text-brand mb-2 text-right">نوع التوصيل</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'home',   label: 'توصيل للمنزل',       price: selectedWilaya?.home ?? 0 },
              { value: 'office', label: 'استلام من المكتب',   price: selectedWilaya?.office ?? 0 },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormData(d => ({
                  ...d,
                  delivery_type: opt.value as 'home' | 'office',
                  commune: '',
                  address: opt.value === 'office' ? '' : d.address,
                }))}
                style={{
                  backgroundColor: formData.delivery_type === opt.value ? '#1a1a1a' : '#ffffff',
                  color: formData.delivery_type === opt.value ? '#ffffff' : '#1a1a1a',
                  borderColor: formData.delivery_type === opt.value ? '#1a1a1a' : '#E8E4DF',
                }}
                className="border-2 rounded-xl p-3 text-center transition-all duration-200"
              >
                <p className="font-heading font-bold text-sm">{opt.label}</p>
                <p
                  className="font-heading font-black text-base mt-1"
                  style={{ color: formData.delivery_type === opt.value ? '#ffffff' : '#8B1A2E' }}
                >
                  {opt.price.toLocaleString('ar-DZ')} دج
                </p>
              </button>
            ))}
          </div>
        </div>
      )}
{/* Commune — only for home delivery after wilaya selected */}
      {formData.delivery_type === 'home' && formData.wilaya && (
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            البلدية
          </label>
          <select
            value={formData.commune}
            onChange={e => setFormData(d => ({ ...d, commune: e.target.value }))}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-brand focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 text-right"
          >
            <option value="">اختاري البلدية</option>
            {getCommunesByWilaya(formData.wilaya).map(commune => (
              <option key={commune} value={commune}>{commune}</option>
            ))}
          </select>
          {errors.commune && (
            <p className="text-xs text-red-500 mt-1 text-right">{errors.commune}</p>
          )}
        </div>
      )}

      {/* Stop desk office — only for office delivery after wilaya selected */}
      {formData.delivery_type === 'office' && formData.wilaya && (
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            مكتب الاستلام
          </label>
          <select
            value={formData.commune}
            onChange={e => setFormData(d => ({ ...d, commune: e.target.value }))}
            disabled={loadingOffices || officesPending || !!officeError || (officesLoaded && officeCommunes.length === 0)}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-brand focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 text-right disabled:bg-surface disabled:text-muted"
          >
            <option value="">
              {loadingOffices || officesPending ? 'جارٍ تحميل المكاتب...' : 'اختاري مكتب الاستلام'}
            </option>
            {officeCommunes.map(commune => (
              <option key={`${commune.name}-${commune.code_postal ?? ''}`} value={commune.name}>
                {commune.name}
              </option>
            ))}
          </select>
          {officeError && (
            <p className="text-xs text-red-500 mt-1 text-right">{officeError}</p>
          )}
          {officesLoaded && !loadingOffices && !officeError && officeCommunes.length === 0 && (
            <p className="text-xs text-red-500 mt-1 text-right">لا توجد مكاتب استلام متاحة لهذه الولاية حالياً</p>
          )}
          {errors.commune && (
            <p className="text-xs text-red-500 mt-1 text-right">{errors.commune}</p>
          )}
        </div>
      )}

      {/* Address — only for home delivery */}
      {formData.delivery_type === 'home' && formData.wilaya && (
        <div>
          <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
            العنوان الكامل
          </label>
          <textarea
            value={formData.address}
            onChange={e => setFormData(d => ({ ...d, address: e.target.value }))}
            placeholder="حي ..., شارع ..., البلدية ..."
            rows={3}
            className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 text-right resize-none"
          />
          {errors.address && (
            <p className="text-xs text-red-500 mt-1 text-right">{errors.address}</p>
          )}
        </div>
      )}

      {/* Notes — optional */}
      <div>
        <label className="block font-heading font-bold text-sm text-brand mb-2 text-right">
          ملاحظات إضافية <span className="text-muted font-body">(اختياري)</span>
        </label>
        <textarea
          value={formData.notes}
          onChange={e => setFormData(d => ({ ...d, notes: e.target.value }))}
          placeholder="أي تعليمات خاصة للطلب..."
          rows={2}
          className="w-full bg-white border border-border rounded-xl px-4 py-3 text-sm text-brand placeholder:text-muted focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/10 text-right resize-none"
        />
      </div>

      {/* Price summary */}
      {formData.wilaya && (
        <div className="bg-surface rounded-xl border border-border p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-sm text-brand">
              {productsTotal.toLocaleString('ar-DZ')} دج
            </span>
            <span className="text-sm text-muted font-body">سعر المنتجات</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-heading font-bold text-sm text-brand">
              {deliveryPrice.toLocaleString('ar-DZ')} دج
            </span>
            <span className="text-sm text-muted font-body">سعر التوصيل</span>
          </div>
          <div className="border-t border-border pt-2 flex items-center justify-between">
            <span className="font-heading font-black text-lg text-accent">
              {totalPrice.toLocaleString('ar-DZ')} دج
            </span>
            <span className="text-sm font-heading font-bold text-brand">الإجمالي</span>
          </div>
        </div>
      )}

      {submitError && (
        <p className="text-sm text-red-500 font-body bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-right">
          {submitError}
        </p>
      )}

      <Button
        type="submit"
        fullWidth
        size="lg"
        loading={submitting}
        disabled={submitting || (formData.delivery_type === 'office' && (loadingOffices || officesPending || !!officeError))}
      >
        {submitting ? 'جارٍ الإرسال...' : 'إرسال الطلب'}
      </Button>
    </form>
  )
}
