import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '../../_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireOrderOperation, orderBusyResponse } from '@/lib/order-operation'
import { canPrintLabel } from '@/lib/order-labels'
import { fetchEcotrackLabel } from '@/lib/ecotrack-label'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  const { id } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: 'معرّف الطلب غير صحيح.' }, { status: 400 })
  }
  let release: (() => Promise<void>) | null = null
  try {
    const db = createAdminClient()
    release = await acquireOrderOperation(db, id)
    if (!release) return orderBusyResponse()
    const { data: order, error } = await db.from('orders')
      .select('status,deleted_at,ecotrack_status,ecotrack_tracking').eq('id', id).maybeSingle()
    if (error) return NextResponse.json({ error: 'تعذّر التحقق من حالة الطلب.' }, { status: 500 })
    if (!order) return NextResponse.json({ error: 'الطلب غير موجود.' }, { status: 404 })
    if (!canPrintLabel(order)) return NextResponse.json({ error: 'لم يعد الطلب ضمن البوالص الجاهزة للشحن. حدّثي القائمة.' }, { status: 409 })
    const pdf = await fetchEcotrackLabel(order.ecotrack_tracking!)
    return new NextResponse(new Uint8Array(pdf), { headers: {
      'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="label-${id}.pdf"`,
      'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff',
    } })
  } catch (error) {
    // Do not forward upstream bodies or URLs that could contain credentials/PII.
    const message = error instanceof Error && /[\u0600-\u06ff]/.test(error.message)
      ? error.message : 'تعذّر الاتصال بـEcotrack لجلب البوليصة. أعيدي المحاولة.'
    return NextResponse.json({ error: message }, { status: 502 })
  } finally { await release?.() }
}
