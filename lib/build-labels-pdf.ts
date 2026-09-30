import type { LabelOrder } from './order-labels'

export type LabelFailure = { id: string; name: string; error: string }

export async function buildLabelsPdf(
  orders: LabelOrder[], signal: AbortSignal, progress: (done: number) => void,
) {
  const { PDFDocument } = await import('pdf-lib')
  const merged = await PDFDocument.create()
  const failures: LabelFailure[] = []
  const included: string[] = []
  let bytesRead = 0
  for (const order of orders) {
    if (signal.aborted) break
    try {
      if (bytesRead >= 100 * 1024 * 1024) throw new Error('بلغ الملف حد الحجم. جهّزي هذه البوليصة في دفعة أخرى.')
      const response = await fetch(`/api/ecotrack/labels/${order.id}`, { cache: 'no-store', signal })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || 'تعذّر جلب البوليصة.')
      }
      const bytes = await response.arrayBuffer()
      bytesRead += bytes.byteLength
      const source = await PDFDocument.load(bytes)
      if (!source.getPageCount()) throw new Error('البوليصة المستلمة لا تحتوي على صفحات.')
      const pages = await merged.copyPages(source, source.getPageIndices())
      for (const page of pages) merged.addPage(page)
      included.push(order.id)
    } catch (error) {
      if (signal.aborted) break
      failures.push({ id: order.id, name: order.customer_name, error: error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
        ? error.message : 'تعذّر قراءة البوليصة. أعيدي المحاولة أو راجعي ملفها في Ecotrack.' })
    }
    progress(included.length + failures.length)
  }
  return {
    bytes: included.length ? await merged.save() : null,
    included, failures, cancelled: signal.aborted,
  }
}
