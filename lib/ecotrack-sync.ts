const BASE_URL = process.env.ECOTRACK_API_URL
const TOKEN = process.env.ECOTRACK_API_TOKEN
const PER_PAGE = 40
const REQUEST_TIMEOUT_MS = 20_000
const MAX_PAGES = 200

export type EcotrackOrder = {
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

export type LocalOrderCandidate = {
  id: string
  customer_name: string
  phone: string
  phone2: string | null
  wilaya: string
  total_price: number
  ecotrack_tracking: string | null
  created_at: string
}

export type MappedEcotrackStatus = {
  status: 'delivered' | 'cancelled' | 'confirmed'
  ecotrack_status: 'draft' | 'shipped'
}

export function mapEcotrackStatus(ecotrackStatus: string): MappedEcotrackStatus {
  const status = ecotrackStatus.toLowerCase().trim()
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
  const cancelled = [
    'retour_recu',
    'retour_reçu',
    'retour_archive',
    'retour_archivé',
    'retour_en_traitement',
    'annule',
    'annulé',
  ]

  if (delivered.includes(status)) return { status: 'delivered', ecotrack_status: 'shipped' }
  if (cancelled.includes(status)) return { status: 'cancelled', ecotrack_status: 'shipped' }
  if (status === 'prete_a_expedier' || status === 'prête_à_expédier') {
    return { status: 'confirmed', ecotrack_status: 'draft' }
  }
  return { status: 'confirmed', ecotrack_status: 'shipped' }
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

function getClient(order: EcotrackOrder) {
  return order.client ?? order.nom_client ?? ''
}

function getPhone(order: EcotrackOrder) {
  return normalizePhone(order.phone ?? order.telephone)
}

function getSecondPhone(order: EcotrackOrder) {
  return normalizePhone(order.phone_2 ?? order.telephone_2)
}

function getAmount(order: EcotrackOrder) {
  const amount = Number(String(order.montant).replace(/[^\d.-]/g, ''))
  return Number.isFinite(amount) ? amount : null
}

function namesLookRelated(first: string, second: string) {
  const left = normalizeName(first)
  const right = normalizeName(second)
  if (!left || !right) return false
  if (left === right || left.includes(right) || right.includes(left)) return true

  const leftWords = new Set(left.split(/\s+/).filter(word => word.length >= 3))
  const rightWords = right.split(/\s+/).filter(word => word.length >= 3)
  return rightWords.some(word => leftWords.has(word))
}

function fallbackMatches(ecotrackOrder: EcotrackOrder, localOrder: LocalOrderCandidate) {
  const ecotrackPhone = getPhone(ecotrackOrder)
  const ecotrackSecondPhone = getSecondPhone(ecotrackOrder)
  const localPhone = normalizePhone(localOrder.phone)
  const localSecondPhone = normalizePhone(localOrder.phone2)
  const phoneMatches =
    (!!ecotrackPhone && (ecotrackPhone === localPhone || ecotrackPhone === localSecondPhone)) ||
    (!!ecotrackSecondPhone && (ecotrackSecondPhone === localPhone || ecotrackSecondPhone === localSecondPhone))

  if (!phoneMatches || Number(ecotrackOrder.wilaya_id) !== Number(localOrder.wilaya)) return false

  const amount = getAmount(ecotrackOrder)
  if (amount === null || Math.abs(amount - Number(localOrder.total_price)) > 1) return false

  const ecotrackCreatedAt = Date.parse(String(ecotrackOrder.created_at ?? ''))
  const localCreatedAt = Date.parse(localOrder.created_at)
  if (
    !Number.isFinite(ecotrackCreatedAt) ||
    !Number.isFinite(localCreatedAt) ||
    Math.abs(ecotrackCreatedAt - localCreatedAt) > 7 * 24 * 60 * 60 * 1000
  ) return false

  return namesLookRelated(getClient(ecotrackOrder), localOrder.customer_name)
}

function referenceMatches(ecotrackOrder: EcotrackOrder, localOrder: LocalOrderCandidate) {
  const reference = String(ecotrackOrder.reference ?? '').replace(/^#/, '').trim().toUpperCase()
  return Boolean(reference) && reference === localOrder.id.slice(-8).toUpperCase()
}

export function ecotrackMatchKind(
  ecotrackOrder: EcotrackOrder,
  localOrder: LocalOrderCandidate
): 'reference' | 'fallback' | null {
  if (referenceMatches(ecotrackOrder, localOrder)) return 'reference'
  if (fallbackMatches(ecotrackOrder, localOrder)) return 'fallback'
  return null
}

export function findEcotrackMatch(
  ecotrackOrders: EcotrackOrder[],
  localOrder: LocalOrderCandidate,
  unavailableTrackings: Set<string> = new Set()
) {
  const available = ecotrackOrders.filter(order =>
    Boolean(order.tracking) && !unavailableTrackings.has(order.tracking)
  )
  const exactMatches = available.filter(order => ecotrackMatchKind(order, localOrder) === 'reference')
  const matches = exactMatches.length > 0
    ? exactMatches
    : available.filter(order => ecotrackMatchKind(order, localOrder) === 'fallback')

  return {
    match: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
  }
}

export async function fetchAllEcotrackOrders(): Promise<EcotrackOrder[]> {
  if (!BASE_URL || !TOKEN) throw new Error('Ecotrack configuration is missing')

  const results: EcotrackOrder[] = []
  let page = 1
  let hasMore = true

  while (hasMore) {
    const pageUrl = new URL(`${BASE_URL}/api/v1/get/orders`)
    pageUrl.searchParams.set('per_page', String(PER_PAGE))
    pageUrl.searchParams.set('page', String(page))

    const response = await fetch(pageUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    const body = await response.json().catch(() => null) as {
      success?: boolean
      message?: string
      data?: unknown
      orders?: unknown
      last_page?: unknown
      meta?: { last_page?: unknown }
      pagination?: { last_page?: unknown }
    } | null

    if (!response.ok || !body || body.success === false) {
      const detail = body?.message ? `: ${body.message}` : ''
      throw new Error(`Ecotrack orders request failed (${response.status})${detail}`)
    }

    const rawRows = body.data ?? body.orders
    if (rawRows !== undefined && !Array.isArray(rawRows)) {
      throw new Error('Ecotrack orders response has an invalid data shape')
    }
    const rows = (rawRows ?? []) as EcotrackOrder[]

    if (rows.length === 0) {
      hasMore = false
      continue
    }

    results.push(...rows)
    const lastPage = Number(
      body.last_page ?? body.meta?.last_page ?? body.pagination?.last_page ?? page
    )
    if (!Number.isFinite(lastPage) || lastPage < page) {
      throw new Error('Ecotrack orders response has invalid pagination')
    }
    if (page >= MAX_PAGES && page < lastPage) {
      throw new Error('Ecotrack orders response exceeds the safe pagination limit')
    }
    if (page >= lastPage) hasMore = false
    else page += 1
  }

  return results
}
