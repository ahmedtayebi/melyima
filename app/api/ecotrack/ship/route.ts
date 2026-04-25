import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ecotrackShipOrder } from '@/lib/ecotrack'
import { requireAdmin } from '../_auth'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const { order_id, tracking } = await req.json()
    if (!order_id || !tracking) return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })

    const result = await ecotrackShipOrder(tracking)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
    )

    const { error: dbError } = await supabase
      .from('orders')
      .update({ ecotrack_status: 'shipped' })
      .eq('id', order_id)

    if (dbError) return NextResponse.json({ success: false, error: 'DB update failed' }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
