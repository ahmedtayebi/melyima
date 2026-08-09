import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '../_auth'

const BASE_URL = process.env.ECOTRACK_API_URL
const TOKEN = process.env.ECOTRACK_API_TOKEN
const PER_PAGE = 40

export const runtime = 'nodejs'
export const maxDuration = 30

type EcotrackOrder = {
  tracking: string
  reference?: string | null
  status: string
  client?: string | null
  nom_client?: string | null
  phone?: string | null
  telephone?: string | null
  phone_2?: string | null
  telephone_2?: string | null
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

type LocalOrderCandidate = {
  id: string
  customer_name: string
  phone: string
  phone2: string | null
  wilaya: string
  total_price: number
  ecotrack_tracking: string | null
}

function normalizePhone(value: string | null | undefined) {
  return String(value ?? '').replace(/\D/g, '').replace(/^213/, '0')
}

function normalizeName(value: string | null | undefined) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function getEcotrackClient(order: EcotrackOrder) {
  return order.client ?? order.nom_client ?? ''
}

function getEcotrackPhone(order: EcotrackOrder) {
  return normalizePhone(order.phone ?? order.telephone)
}

function getEcotrackSecondPhone(order: EcotrackOrder) {
  return normalizePhone(order.phone_2 ?? order.telephone_2)
}

function getEcotrackAmount(order: EcotrackOrder) {
  const amount = Number(String(order.montant).replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) ? amount : null
}

function namesLookRelated(a: string, b: string) {
  const left = normalizeName(a)
  const right = normalizeName(b)
  if (!left || !right) return false
  if (left === right || left.includes(right) || right.includes(left)) return true

  const leftWords = new Set(left.split(/\s+/).filter(word => word.length >= 3))
  const rightWords = right.split(/\s+/).filter(word => word.length >= 3)
  return rightWords.some(word => leftWords.has(word))
}

function isFallbackMatch(ecotrackOrder: EcotrackOrder, localOrder: LocalOrderCandidate) {
  const ecoPhone = getEcotrackPhone(ecotrackOrder)
  const ecoSecondPhone = getEcotrackSecondPhone(ecotrackOrder)
  const localPhone = normalizePhone(localOrder.phone)
  const localSecondPhone = normalizePhone(localOrder.phone2)
  const phoneMatches =
    (!!ecoPhone && (ecoPhone === localPhone || ecoPhone === localSecondPhone)) ||
    (!!ecoSecondPhone && (ecoSecondPhone === localPhone || ecoSecondPhone === localSecondPhone))

  if (!phoneMatches) return false
  if (Number(ecotrackOrder.wilaya_id) !== Number(localOrder.wilaya)) return false

  const ecoAmount = getEcotrackAmount(ecotrackOrder)
  if (ecoAmount === null || Math.abs(ecoAmount - Number(localOrder.total_price)) > 1) return false

  return namesLookRelated(getEcotrackClient(ecotrackOrder), localOrder.customer_name)
}

async function fetchAllPages(url: string): Promise<EcotrackOrder[]> {
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

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const url = new URL(req.url)
  return req.headers.get('authorization') === `Bearer ${cronSecret}` ||
    url.searchParams.get('secret') === cronSecret
}

async function syncEcotrackOrders() {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json(
      { success: false, error: 'Ecotrack config missing' },
      { status: 500 }
    )
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return NextResponse.json(
      { success: false, error: 'Supabase service role missing' },
      { status: 500 }
    )
  }

  // ── Fetch all orders from Ecotrack ────────────────────────
  const allOrders = await fetchAllPages(
    `${BASE_URL}/api/v1/get/orders?per_page=${PER_PAGE}`
  )

  if (allOrders.length === 0) {
    return NextResponse.json({ success: true, updated: 0, imported: 0, total: 0 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )

  const trackingNumbers = allOrders.map(o => o.tracking).filter(Boolean)
  const { data: dbOrders, error: dbQueryError } = await supabase
    .from('orders')
    .select('id, ecotrack_tracking, order_items!inner(id)')
    .in('ecotrack_tracking', trackingNumbers)

  if (dbQueryError) {
    return NextResponse.json({ success: false, error: 'DB query failed' }, { status: 500 })
  }

  // ── Phase 1: update existing orders ──────────────────────
  let updated = 0
  const linkedTrackings = new Set((dbOrders ?? []).map(order => order.ecotrack_tracking).filter(Boolean))
  if (dbOrders && dbOrders.length > 0) {
    const ecotrackMap = new Map(allOrders.map(o => [o.tracking, o.status]))
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

  // ── Phase 2: safely link Ecotrack orders whose reference was edited ────────
  let linked = 0
  const unlinkedEcotrackOrders = allOrders.filter(order =>
    order.tracking && !linkedTrackings.has(order.tracking)
  )

  if (unlinkedEcotrackOrders.length > 0) {
    const { data: candidates, error: candidatesError } = await supabase
      .from('orders')
      .select('id, customer_name, phone, phone2, wilaya, total_price, ecotrack_tracking')
      .is('ecotrack_tracking', null)

    if (candidatesError) {
      return NextResponse.json({ success: false, error: 'DB fallback query failed' }, { status: 500 })
    }

    const remainingCandidates = [...((candidates ?? []) as LocalOrderCandidate[])]

    for (const ecotrackOrder of unlinkedEcotrackOrders) {
      const matches = remainingCandidates.filter(candidate =>
        isFallbackMatch(ecotrackOrder, candidate)
      )

      if (matches.length !== 1) continue

      const matchedOrder = matches[0]
      const mapped = mapStatus(ecotrackOrder.status)
      const { error } = await supabase
        .from('orders')
        .update({
          ecotrack_tracking: ecotrackOrder.tracking,
          ecotrack_status: mapped.ecotrack_status,
          status: mapped.status,
        })
        .eq('id', matchedOrder.id)
        .is('ecotrack_tracking', null)

      if (!error) {
        linked += 1
        linkedTrackings.add(ecotrackOrder.tracking)
        const index = remainingCandidates.findIndex(candidate => candidate.id === matchedOrder.id)
        if (index !== -1) remainingCandidates.splice(index, 1)
      }
    }
  }

  return NextResponse.json({ success: true, updated, linked, imported: 0, total: allOrders.length })
}

export async function GET(req: Request) {
  try {
    if (!isAuthorizedCron(req)) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    return await syncEcotrackOrders()
  } catch (err) {
    console.error('Ecotrack cron sync error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth
    return await syncEcotrackOrders()
  } catch (err) {
    console.error('Ecotrack sync error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
