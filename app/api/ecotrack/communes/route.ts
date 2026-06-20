import { NextRequest, NextResponse } from 'next/server'
import { ecotrackGetCommunes } from '@/lib/ecotrack'

function parseWilayaId(value: string | null) {
  const wilayaId = Number(value)
  if (!Number.isInteger(wilayaId) || wilayaId < 1 || wilayaId > 58) return null
  return wilayaId
}

export async function GET(req: NextRequest) {
  const wilayaId = parseWilayaId(req.nextUrl.searchParams.get('wilaya_id'))
  if (!wilayaId) {
    return NextResponse.json(
      { success: false, error: 'الولاية غير صحيحة' },
      { status: 400 }
    )
  }

  const onlyStopDesk = req.nextUrl.searchParams.get('stop_desk') === '1'
  const result = await ecotrackGetCommunes(wilayaId)
  if (!result.success || !result.communes) {
    return NextResponse.json(
      { success: false, error: 'تعذّر جلب مكاتب التوصيل' },
      { status: 502 }
    )
  }

  const communes = onlyStopDesk
    ? result.communes.filter(commune => commune.has_stop_desk)
    : result.communes

  return NextResponse.json(
    { success: true, communes },
    {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      },
    }
  )
}
