import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ecotrackCreateOrder, ecotrackGetStopDeskCommune, WILAYA_CODES, WILAYA_CODE_BY_NUMBER } from '@/lib/ecotrack'
import { requireAdmin } from '../_auth'

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const { order_id } = await req.json()
    if (!order_id) return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
    )

    const { data: order } = await supabase
      .from('orders')
      .select('*, order_items(product_name, quantity)')
      .eq('id', order_id)
      .single()

    if (!order) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 })
    if (order.ecotrack_tracking) return NextResponse.json({ success: true, tracking: order.ecotrack_tracking, already_exists: true })

    const code_wilaya =
      WILAYA_CODES[order.wilaya] ??
      WILAYA_CODE_BY_NUMBER[order.wilaya] ??
      WILAYA_CODE_BY_NUMBER[String(parseInt(order.wilaya))] ??
      0
    if (!code_wilaya) return NextResponse.json({ success: false, error: `Wilaya not found: ${order.wilaya}` }, { status: 400 })

    const produit = (order.order_items ?? [])
      .map((i: { product_name: string; quantity: number }) => `${i.product_name} x${i.quantity}`)
      .join(', ')
      .substring(0, 255)
    const fallbackCommune = order.commune ?? order.wilaya_name ?? order.wilaya
    const stopDesk = order.delivery_type === 'office' ? 1 : 0
    let ecotrackCommune = fallbackCommune

    if (stopDesk === 1 && !order.commune) {
      const stopDeskCommune = await ecotrackGetStopDeskCommune(code_wilaya)
      if (!stopDeskCommune.success || !stopDeskCommune.commune) {
        return NextResponse.json(
          { success: false, error: 'لا توجد بلدية مكتب متاحة لهذه الولاية في Ecotrack' },
          { status: 400 }
        )
      }
      ecotrackCommune = stopDeskCommune.commune
    }

    const result = await ecotrackCreateOrder({
      nom_client: order.customer_name,
      telephone: order.phone,
      telephone_2: order.phone2 ?? undefined,
      adresse: order.address ?? fallbackCommune,
      commune: ecotrackCommune,
      code_wilaya,
      montant: order.total_price,
      stop_desk: stopDesk,
      produit,
      remarque: order.notes ?? undefined,
      reference: order.id.slice(-8).toUpperCase(),
    })

    if (!result.success || !result.tracking) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    }

    const { error: dbError } = await supabase
      .from('orders')
      .update({ ecotrack_tracking: result.tracking, ecotrack_status: 'draft' })
      .eq('id', order_id)

    if (dbError) return NextResponse.json({ success: false, error: 'DB update failed' }, { status: 500 })

    return NextResponse.json({ success: true, tracking: result.tracking })
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
