import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { DELIVERY_PRICES } from '@/lib/delivery-prices'
import { requireAdmin } from '../_auth'

const BASE_URL = process.env.ECOTRACK_API_URL
const TOKEN = process.env.ECOTRACK_API_TOKEN
const PER_PAGE = 40

type EcotrackOrder = {
  tracking: string
  status: string
  client: string
  phone: string
  phone_2?: string | null
  wilaya_id: number
  stop_desk: number
  montant: string | number
  adresse?: string | null
  created_at?: string | null
}

function mapStatus(ecotrackStatus: string): { status: 'delivered' | 'cancelled' | 'confirmed'; ecotrack_status: 'draft' | 'shipped' } {
  const s = ecotrackStatus.toLowerCase().trim()
  const delivered = ['livre_non_encaisse', 'livré_non_encaissé', 'encaisse_non_paye', 'encaissé_non_payé', 'paye_et_archive', 'payé_et_archivé']
  const cancelled = ['retour_recu', 'retour_reçu', 'retour_archive', 'retour_archivé', 'retour_en_traitement', 'annule', 'annulé']
  if (delivered.includes(s)) return { status: 'delivered', ecotrack_status: 'shipped' }
  if (cancelled.includes(s)) return { status: 'cancelled', ecotrack_status: 'shipped' }
  if (s === 'prete_a_expedier' || s === 'prête_à_expédier') return { status: 'confirmed', ecotrack_status: 'draft' }
  return { status: 'confirmed', ecotrack_status: 'shipped' }
}

async function fetchAllPages(url: string, label: string): Promise<EcotrackOrder[]> {
  const results: EcotrackOrder[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const pageUrl = new URL(url)
    pageUrl.searchParams.set('page', String(page))
    const res = await fetch(pageUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    })
    const body = await res.json()
    const rows: EcotrackOrder[] = body.data ?? body.orders ?? []

    if (!Array.isArray(rows) || rows.length === 0) {
      hasMore = false
    } else {
      results.push(...rows)
      const lastPage: number = body.last_page ?? body.meta?.last_page ?? page
      if (page >= lastPage || page >= 200) hasMore = false
      else page++
    }
  }

  return results
}

export async function POST() {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    // ── Fetch all orders from Ecotrack ────────────────────────
    const allOrders = await fetchAllPages(
      `${BASE_URL}/api/v1/get/orders?per_page=${PER_PAGE}`,
      'ecotrack'
    )

    if (allOrders.length === 0) {
      return NextResponse.json({ success: true, updated: 0, imported: 0, total: 0 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
    )

    const trackingNumbers = allOrders.map(o => o.tracking).filter(Boolean)
    const { data: dbOrders, error: dbQueryError } = await supabase
      .from('orders')
      .select('id, ecotrack_tracking')
      .in('ecotrack_tracking', trackingNumbers)

    if (dbQueryError) {
      return NextResponse.json({ success: false, error: 'DB query failed' }, { status: 500 })
    }

    // ── Phase 1: update existing orders ──────────────────────
    let updated = 0
    if (dbOrders && dbOrders.length > 0) {
      const ecotrackMap = new Map(allOrders.map(o => [o.tracking, o.status]))
      // Group IDs by compound key "status|ecotrack_status" for batch updates
      const byKey = new Map<string, { status: string; ecotrack_status: string; ids: string[] }>()

      for (const order of dbOrders) {
        if (!order.ecotrack_tracking) continue
        const rawStatus = ecotrackMap.get(order.ecotrack_tracking)
        if (!rawStatus) continue
        const mapped = mapStatus(rawStatus)
        const key = `${mapped.status}|${mapped.ecotrack_status}`
        const group = byKey.get(key)
        if (group) group.ids.push(order.id)
        else byKey.set(key, { ...mapped, ids: [order.id] })
      }

      for (const { status, ecotrack_status, ids } of byKey.values()) {
        const { error } = await supabase
          .from('orders')
          .update({ status, ecotrack_status })
          .in('id', ids)
        if (!error) updated += ids.length
      }
    }

    // ── Phase 2: import new orders ────────────────────────────
    const existingTrackings = new Set((dbOrders ?? []).map(o => o.ecotrack_tracking))
    const newOrders = allOrders.filter(o => o.tracking && !existingTrackings.has(o.tracking))

    let imported = 0
    if (newOrders.length > 0) {
      const rows = newOrders.map(item => {
        const deliveryEntry = DELIVERY_PRICES.find(e => parseInt(e.code) === item.wilaya_id)
        const isOffice = item.stop_desk === 1
        const delivery_price = deliveryEntry ? (isOffice ? deliveryEntry.office : deliveryEntry.home) : 0
        const total_price = Number(item.montant)
        const products_total = Math.max(0, total_price - delivery_price)

        return {
          customer_name: item.client,
          phone: item.phone,
          phone2: item.phone_2 ?? null,
          wilaya: String(item.wilaya_id).padStart(2, '0'),
          wilaya_name: deliveryEntry?.name ?? null,
          commune: null,
          delivery_type: isOffice ? 'office' : 'home',
          delivery_price,
          products_total,
          total_price,
          address: item.adresse ?? null,
          notes: null,
          created_at: item.created_at ? new Date(item.created_at).toISOString() : undefined,
          ...mapStatus(item.status),
          ecotrack_tracking: item.tracking,
        }
      })

      const { error } = await supabase.from('orders').upsert(rows, { onConflict: 'ecotrack_tracking', ignoreDuplicates: true })
      if (error) console.error('Sync upsert error:', error.message)
      else imported = rows.length
    }

    return NextResponse.json({ success: true, updated, imported, total: allOrders.length })
  } catch (err) {
    console.error('Ecotrack sync error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
