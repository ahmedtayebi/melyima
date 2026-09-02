import { NextResponse } from 'next/server'
import {
  ecotrackMatchKind,
  fetchAllEcotrackOrders,
  mapEcotrackStatus,
  type LocalOrderCandidate,
} from '@/lib/ecotrack-sync'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '../_auth'

const SYNC_COOLDOWN_SECONDS = 60 * 60
const SYNC_COOLDOWN_KEY = 'ecotrack_sync'

export const runtime = 'nodejs'
export const maxDuration = 30

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

function isAuthorizedCron(req: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false
  const url = new URL(req.url)
  return req.headers.get('authorization') === `Bearer ${cronSecret}` ||
    url.searchParams.get('secret') === cronSecret
}

async function syncEcotrackOrders(supabase: ReturnType<typeof createAdminClient>) {
  // ── Fetch all orders from Ecotrack ────────────────────────
  const allOrders = await fetchAllEcotrackOrders()

  if (allOrders.length === 0) {
    return NextResponse.json({ success: true, updated: 0, imported: 0, total: 0 })
  }

  const { data: dbOrders, error: dbQueryError } = await supabase
    .from('orders')
    .select('id, status, ecotrack_tracking, ecotrack_status')
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
      const mapped = mapEcotrackStatus(rawStatus)
      if (order.status === 'cancelled') continue
      if (order.status === 'delivered' && mapped.status === 'confirmed') continue
      if (order.status === mapped.status && order.ecotrack_status === mapped.ecotrack_status) continue
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
      .select('id, customer_name, phone, phone2, wilaya, total_price, ecotrack_tracking, created_at')
      .is('ecotrack_tracking', null)
      .is('deleted_at', null)
      .eq('status', 'confirmed')

    if (candidatesError) {
      return NextResponse.json({ success: false, error: 'DB fallback query failed' }, { status: 500 })
    }

    const remainingCandidates = [...((candidates ?? []) as LocalOrderCandidate[])]

    const linkUniqueMatches = async (kind: 'reference' | 'fallback') => {
      const matchSets = unlinkedEcotrackOrders.flatMap(ecotrackOrder => {
        if (linkedTrackings.has(ecotrackOrder.tracking)) return []

        const referenceMatches = remainingCandidates.filter(candidate =>
          ecotrackMatchKind(ecotrackOrder, candidate) === 'reference'
        )
        if (kind === 'fallback' && referenceMatches.length > 0) return []

        const matches = kind === 'reference'
          ? referenceMatches
          : remainingCandidates.filter(candidate =>
              ecotrackMatchKind(ecotrackOrder, candidate) === 'fallback'
            )
        return matches.length > 0 ? [{ ecotrackOrder, matches }] : []
      })

      const candidateUseCount = new Map<string, number>()
      for (const matchSet of matchSets) {
        for (const candidate of matchSet.matches) {
          candidateUseCount.set(candidate.id, (candidateUseCount.get(candidate.id) ?? 0) + 1)
        }
      }

      for (const { ecotrackOrder, matches } of matchSets) {
        if (matches.length !== 1) continue
        const matchedCandidate = matches[0]
        if (candidateUseCount.get(matchedCandidate.id) !== 1) continue
        if (linkedTrackings.has(ecotrackOrder.tracking)) continue
        if (!remainingCandidates.some(candidate => candidate.id === matchedCandidate.id)) continue

        const mapped = mapEcotrackStatus(ecotrackOrder.status)
        const { data: linkedOrder, error } = await supabase
          .from('orders')
          .update({
            ecotrack_tracking: ecotrackOrder.tracking,
            ecotrack_status: mapped.ecotrack_status,
            status: mapped.status,
          })
          .eq('id', matchedCandidate.id)
          .eq('status', 'confirmed')
          .is('ecotrack_tracking', null)
          .select('id')
          .maybeSingle()

        if (error) {
          throw new Error(`Failed to link synchronized Ecotrack order: ${error.message}`)
        }

        if (linkedOrder) {
          linked += 1
          linkedTrackings.add(ecotrackOrder.tracking)
          const index = remainingCandidates.findIndex(candidate => candidate.id === matchedCandidate.id)
          if (index !== -1) remainingCandidates.splice(index, 1)
        }
      }
    }

    await linkUniqueMatches('reference')
    await linkUniqueMatches('fallback')
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
