import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ecotrackUpdateOrder, WILAYA_CODE_BY_NUMBER } from '@/lib/ecotrack'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log('Update route received:', body)
    const { tracking, order_id, adresse, commune, montant, tel, tel2, remarque } = body
    if (!tracking) return NextResponse.json({ success: false, error: 'tracking required' }, { status: 400 })

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
      remarque,
    })

    if (!result.success) return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
