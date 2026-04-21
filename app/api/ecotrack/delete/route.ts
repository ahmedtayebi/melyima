import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ecotrackDeleteOrder } from '@/lib/ecotrack'

export async function DELETE(req: NextRequest) {
  try {
    const { order_id, tracking } = await req.json()
    const result = await ecotrackDeleteOrder(tracking)
    console.log('Ecotrack delete response:', result)

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.message }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
    )

    await supabase
      .from('orders')
      .update({ ecotrack_tracking: null, ecotrack_status: 'none' })
      .eq('id', order_id)

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
