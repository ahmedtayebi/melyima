import { NextRequest, NextResponse } from 'next/server'
import { ensureEcotrackDraft } from '@/lib/order-ecotrack'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../_auth'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const { order_id } = await req.json()
    if (!UUID_PATTERN.test(String(order_id ?? ''))) {
      return NextResponse.json({ success: false, error: 'معرّف الطلب غير صحيح' }, { status: 400 })
    }
    const supabase = createAdminClient()
    const result = await ensureEcotrackDraft(supabase, order_id)

    return NextResponse.json(
      {
        success: result.success,
        tracking: result.tracking,
        already_exists: result.alreadyExists,
        error: result.error,
      },
      { status: result.success ? 200 : result.status ?? 500 }
    )
  } catch (error) {
    console.error('Unexpected Ecotrack draft creation error:', error)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
