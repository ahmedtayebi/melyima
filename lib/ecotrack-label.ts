const MAX_LABEL_BYTES = 5 * 1024 * 1024

export async function fetchEcotrackLabel(tracking: string): Promise<Uint8Array> {
  const base = process.env.ECOTRACK_API_URL
  const token = process.env.ECOTRACK_API_TOKEN
  if (!base || !token) throw new Error('ربط Ecotrack غير مكتمل في إعدادات الخادم.')
  const url = new URL('/api/v1/get/order/label', base)
  url.searchParams.set('tracking', tracking)
  // Keep the credential in the header, never in a URL exposed to the browser.
  const signal = AbortSignal.timeout(20_000)
  let target = url
  let response: Response
  for (let redirects = 0; ; redirects++) {
    response = await fetch(target, {
      headers: { Accept: 'application/pdf', ...(target.origin === url.origin ? { Authorization: `Bearer ${token}` } : {}) },
      cache: 'no-store', redirect: 'manual', signal,
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get('location')
    await response.body?.cancel()
    if (!location || redirects >= 2) throw new Error('تعذّر الوصول إلى ملف البوليصة في Ecotrack.')
    const next = new URL(location, target)
    if (next.protocol !== 'https:' || next.username || next.password ||
      ![url.origin, 'https://storage.ecotrack.dz'].includes(next.origin)) {
      throw new Error('أعاد Ecotrack رابط تخزين غير مدعوم للبوليصة.')
    }
    target = next
  }
  if (!response.ok || !response.body) throw new Error('تعذّر جلب البوليصة من Ecotrack. تحققي من رقم التتبع وصلاحية الربط ثم أعيدي المحاولة.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > MAX_LABEL_BYTES) throw new Error('حجم البوليصة المستلمة أكبر من الحد المسموح.')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const pdf = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { pdf.set(chunk, offset); offset += chunk.length }
  if (new TextDecoder().decode(pdf.slice(0, 5)) !== '%PDF-') {
    throw new Error('لم يُرجع Ecotrack ملف PDF صالحًا لهذه البوليصة.')
  }
  return pdf
}
