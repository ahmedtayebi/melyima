import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../_auth'

const BASE_URL = process.env.ECOTRACK_API_URL
const TOKEN = process.env.ECOTRACK_API_TOKEN
const PER_PAGE = 40
const SYNC_REQUEST_TIMEOUT_MS = 20_000
const SYNC_COOLDOWN_SECONDS = 60 * 60
const SYNC_COOLDOWN_KEY = 'ecotrack_sync'

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

type JobLockResult = {
  allowed: boolean
  retry_after: number
}

async function reserveSyncWindow(
  supabase: ReturnType<typeof createAdminClient>,
  force: boolean
) {
  if (force) return { allowed: true, skipped: false, retryAfter: 0 }

  try {
    const { data, error } = await supabase
      .rpc('try_reserve_job_lock', {
        p_key: SYNC_COOLDOWN_KEY,
        p_cooldown_seconds: SYNC_COOLDOWN_SECONDS,
        p_force: false,
      })
      .single()

    if (error) throw error
    const result = data as JobLockResult | null
    if (result?.allowed) return { allowed: true, skipped: false, retryAfter: 0 }
    return {
      allowed: false,
      skipped: true,
      retryAfter: Math.max(1, Number(result?.retry_after) || SYNC_COOLDOWN_SECONDS),
    }
  } catch (err) {
    console.error('Ecotrack sync DB cooldown error:', err)
    return { allowed: false, skipped: true, retryAfter: SYNC_COOLDOWN_SECONDS }
  }
}

function mapStatus(ecotrackStatus: string): { status: 'delivered' | 'cancelled' | 'confirmed'; ecotrack_status: 'draft' | 'shipped' } {
  const s = ecotrackStatus.toLowerCase().trim()
  const delivered = [
    'livre_non_encaisse',
    'livré_non_encaissé',
    'encaisse_non_paye',
    'encaissé_non_payé',
    'paiements_prets',
    'paiements_prêts',
    'paye_et_archive',
    'payé_et_archivé',
  ]
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
      cache: 'no-store',
      signal: AbortSignal.timeout(SYNC_REQUEST_TIMEOUT_MS),
    })
    const body = await res.json().catch(() => null) as {
      success?: boolean
      message?: string
      data?: unknown
      orders?: unknown
      last_page?: unknown
      meta?: { last_page?: unknown }
    } | null

    if (!res.ok || !body || body.success === false) {
      const detail = body?.message ? `: ${body.message}` : ''
      throw new Error(`Ecotrack orders request failed (${res.status})${detail}`)
    }

    const rawRows = body.data ?? body.orders
    if (rawRows !== undefined && !Array.isArray(rawRows)) {
      throw new Error('Ecotrack orders response has an invalid data shape')
    }
    const rows = (rawRows ?? []) as EcotrackOrder[]

    if (!Array.isArray(rows) || rows.length === 0) {
      hasMore = false
    } else {
      results.push(...rows)
      const lastPage = Number(body.last_page ?? body.meta?.last_page ?? page)
      if (!Number.isFinite(lastPage) || lastPage < page) {
        throw new Error('Ecotrack orders response has invalid pagination')
      }
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

async function syncEcotrackOrders(supabase: ReturnType<typeof createAdminClient>) {
  if (!BASE_URL || !TOKEN) {
    return NextResponse.json(
      { success: false, error: 'Ecotrack config missing' },
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

  const { data: dbOrders, error: dbQueryError } = await supabase
    .from('orders')
    .select('id, ecotrack_tracking')
    .not('ecotrack_tracking', 'is', null)
    .is('deleted_at', null)

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
      const { data: changedOrders, error } = await supabase
        .from('orders')
        .update({ status, ecotrack_status })
        .in('id', ids)
        .select('id')

      if (error) {
        throw new Error(`Failed to save synchronized order statuses: ${error.message}`)
      }
      updated += changedOrders?.length ?? 0
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
      .is('deleted_at', null)

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
      const { data: linkedOrder, error } = await supabase
        .from('orders')
        .update({
          ecotrack_tracking: ecotrackOrder.tracking,
          ecotrack_status: mapped.ecotrack_status,
          status: mapped.status,
        })
        .eq('id', matchedOrder.id)
        .is('ecotrack_tracking', null)
        .select('id')
        .maybeSingle()

      if (error) {
        throw new Error(`Failed to link synchronized Ecotrack order: ${error.message}`)
      }

      if (linkedOrder) {
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

    const supabase = createAdminClient()

    const url = new URL(req.url)
    const window = await reserveSyncWindow(supabase, url.searchParams.get('force') === '1')
    if (!window.allowed) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'sync_cooldown',
        retry_after: window.retryAfter,
      })
    }

    return await syncEcotrackOrders(supabase)
  } catch (err) {
    console.error('Ecotrack cron sync error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth

    const supabase = createAdminClient()

    const window = await reserveSyncWindow(supabase, false)
    if (!window.allowed) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'sync_cooldown',
        retry_after: window.retryAfter,
      })
    }

    return await syncEcotrackOrders(supabase)
  } catch (err) {
    console.error('Ecotrack sync error:', err)
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}
