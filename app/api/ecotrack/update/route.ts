import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ecotrackUpdateOrder, WILAYA_CODE_BY_NUMBER } from '@/lib/ecotrack'
import { requireAdmin } from '../_auth'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const body = await req.json()
    const { tracking, order_id, adresse, commune, montant, tel, tel2 } = body
    if (!tracking || !order_id) return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
    )

    const { data: order } = await supabase
      .from('orders')
      .select('customer_name, wilaya_name, wilaya')
      .eq('id', order_id)
      .single()

    const result = await ecotrackUpdateOrder(tracking, {
      client: order?.customer_name,
      adresse,
      commune,
      wilaya: order ? (WILAYA_CODE_BY_NUMBER[order.wilaya ?? ''] ?? undefined) : undefined,
      montant,
      tel,
      tel2,
    })

    if (!result.success) return NextResponse.json({ success: false, error: result.message }, { status: 400 })

    const dbFields: Record<string, string | undefined> = {}
    if (adresse)  dbFields.address = adresse
    if (commune)  dbFields.commune = commune
    if (tel)      dbFields.phone   = tel
    if (tel2)     dbFields.phone2  = tel2

    if (Object.keys(dbFields).length > 0) {
      const { error: dbError } = await supabase.from('orders').update(dbFields).eq('id', order_id)
      if (dbError) return NextResponse.json({ success: false, error: 'DB update failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
