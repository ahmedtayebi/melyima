export const WILAYA_CODES: Record<string, number> = {
  'Adrar': 1, 'Chlef': 2, 'Laghouat': 3, 'Oum El Bouaghi': 4,
  'Batna': 5, 'Bejaia': 6, 'Biskra': 7, 'Béchar': 8,
  'Blida': 9, 'Bouira': 10, 'Tamanrasset': 11, 'Tébessa': 12,
  'Tlemcen': 13, 'Tiaret': 14, 'Tizi Ouzou': 15, 'Alger': 16,
  'Djelfa': 17, 'Jijel': 18, 'Sétif': 19, 'Saïda': 20,
  'Skikda': 21, 'Sidi Bel Abbès': 22, 'Annaba': 23, 'Guelma': 24,
  'Constantine': 25, 'Médéa': 26, 'Mostaganem': 27, "M'Sila": 28,
  'Mascara': 29, 'Ouargla': 30, 'Oran': 31, 'El Bayadh': 32,
  'Illizi': 33, 'Bordj Bou Arreridj': 34, 'Boumerdès': 35,
  'El Tarf': 36, 'Tindouf': 37, 'Tissemsilt': 38, 'El Oued': 39,
  'Khenchela': 40, 'Souk Ahras': 41, 'Tipaza': 42, 'Mila': 43,
  'Ain Defla': 44, 'Naâma': 45, 'Ain Temouchent': 46,
  'Ghardaia': 47, 'Relizane': 48, 'Timimoun': 49,
  'Bordj Badji Mokhtar': 50, 'Ouled Djellal': 51,
  'Beni Abbes': 52, 'In Salah': 53, 'In Guezzam': 54,
  'Touggourt': 55, 'Djanet': 56, "El M'Ghair": 57, 'El Meniaa': 58,
}

export const WILAYA_CODE_BY_NUMBER: Record<string, number> = {
  '01': 1, '1': 1,
  '02': 2, '2': 2,
  '03': 3, '3': 3,
  '04': 4, '4': 4,
  '05': 5, '5': 5,
  '06': 6, '6': 6,
  '07': 7, '7': 7,
  '08': 8, '8': 8,
  '09': 9, '9': 9,
  '10': 10,
  '11': 11,
  '12': 12,
  '13': 13,
  '14': 14,
  '15': 15,
  '16': 16,
  '17': 17,
  '18': 18,
  '19': 19,
  '20': 20,
  '21': 21,
  '22': 22,
  '23': 23,
  '24': 24,
  '25': 25,
  '26': 26,
  '27': 27,
  '28': 28,
  '29': 29,
  '30': 30,
  '31': 31,
  '32': 32,
  '33': 33,
  '34': 34,
  '35': 35,
  '36': 36,
  '37': 37,
  '38': 38,
  '39': 39,
  '40': 40,
  '41': 41,
  '42': 42,
  '43': 43,
  '44': 44,
  '45': 45,
  '46': 46,
  '47': 47,
  '48': 48,
  '49': 49,
  '50': 50,
  '51': 51,
  '52': 52,
  '53': 53,
  '54': 54,
  '55': 55,
  '56': 56,
  '57': 57,
  '58': 58,
}

const BASE_URL = process.env.ECOTRACK_API_URL
const TOKEN = process.env.ECOTRACK_API_TOKEN
const API_TIMEOUT_MS = 15_000

type EcotrackMutationResponse = {
  success?: boolean
  message?: unknown
  errors?: unknown
  tracking?: string
  delete?: unknown
}

export type EcotrackDeleteResult = {
  success: boolean
  message?: string
  lookupRequired?: boolean
}

function ecotrackEndpoint(path: string) {
  if (!BASE_URL || !TOKEN) throw new Error('Ecotrack configuration is missing')
  return `${BASE_URL}${path}`
}

function collectMutationMessages(value: unknown, messages: string[]) {
  if (typeof value === 'string') {
    const message = value.trim()
    if (message) messages.push(message)
    return
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectMutationMessages(item, messages))
    return
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectMutationMessages(item, messages))
  }
}

function mutationMessage(data: EcotrackMutationResponse) {
  const messages: string[] = []
  collectMutationMessages(data.message, messages)
  collectMutationMessages(data.errors, messages)
  return [...new Set(messages)].join(' ') || undefined
}

function mutationResult(res: Response, data: EcotrackMutationResponse) {
  const message = mutationMessage(data)
  return { success: res.ok && data.success === true, message }
}

function ecotrackHeaders(contentType?: string) {
  return {
    Accept: 'application/json',
    Authorization: `Bearer ${TOKEN}`,
    ...(contentType && { 'Content-Type': contentType }),
  }
}

function formBody(params: Record<string, string | undefined>) {
  const body = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) body.set(key, value)
  })
  return body
}

type EcotrackCommune = {
  nom?: unknown
  wilaya_id?: unknown
  code_postal?: unknown
  has_stop_desk?: unknown
}

export type EcotrackCommuneOption = {
  name: string
  wilaya_id: number
  code_postal: string | null
  has_stop_desk: boolean
}

function parseCommunes(data: unknown): EcotrackCommune[] {
  if (Array.isArray(data)) return data as EcotrackCommune[]
  if (data && typeof data === 'object') return Object.values(data) as EcotrackCommune[]
  return []
}

export async function ecotrackGetCommunes(wilayaId: number): Promise<{
  success: boolean
  communes?: EcotrackCommuneOption[]
  message?: string
}> {
  try {
    const res = await fetch(`${ecotrackEndpoint('/api/v1/get/communes')}?wilaya_id=${encodeURIComponent(String(wilayaId))}`, {
      headers: ecotrackHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || (data && typeof data === 'object' && 'success' in data && data.success === false)) {
      return { success: false, message: 'Unable to fetch Ecotrack communes' }
    }

    const communes = parseCommunes(data)
      .filter(item =>
        Number(item.wilaya_id) === wilayaId &&
        typeof item.nom === 'string' &&
        item.nom.trim()
      )
      .map(item => ({
        name: String(item.nom).trim(),
        wilaya_id: wilayaId,
        code_postal: item.code_postal ? String(item.code_postal) : null,
        has_stop_desk: Number(item.has_stop_desk) === 1,
      }))

    return { success: true, communes }
  } catch {
    return { success: false, message: 'Network error' }
  }
}

export async function ecotrackGetStopDeskCommune(wilayaId: number): Promise<{
  success: boolean
  commune?: string
  message?: string
}> {
  const result = await ecotrackGetCommunes(wilayaId)
  if (!result.success || !result.communes) {
    return { success: false, message: result.message }
  }

  const commune = result.communes.find(item => item.has_stop_desk)?.name
  if (!commune) {
      return { success: false, message: 'No Ecotrack stop desk commune found' }
  }

  return { success: true, commune }
}

// CREATE order (draft)
export async function ecotrackCreateOrder(params: {
  nom_client: string
  telephone: string
  telephone_2?: string
  adresse: string
  commune: string
  code_wilaya: number
  montant: number
  stop_desk: number
  produit?: string
  reference?: string
}): Promise<{ success: boolean; tracking?: string; message?: string }> {
  try {
    const body = formBody({
      nom_client: params.nom_client,
      telephone: params.telephone,
      adresse: params.adresse,
      commune: params.commune,
      code_wilaya: String(params.code_wilaya),
      montant: String(params.montant),
      type: '1',
      stop_desk: String(params.stop_desk),
      stock: '0',
      ...(params.telephone_2 && { telephone_2: params.telephone_2 }),
      ...(params.produit && { produit: params.produit }),
      ...(params.reference && { reference: params.reference }),
    })

    const res = await fetch(ecotrackEndpoint('/api/v1/create/order'), {
      method: 'POST',
      headers: ecotrackHeaders('application/x-www-form-urlencoded'),
      body,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })

    const data = await res.json() as EcotrackMutationResponse
    if (res.ok && data.success === true && data.tracking) {
      return { success: true, tracking: data.tracking }
    }
    return { success: false, message: mutationMessage(data) }
  } catch {
    return { success: false, message: 'Network error' }
  }
}

// SHIP order (validate)
export async function ecotrackShipOrder(tracking: string): Promise<{ success: boolean; message?: string }> {
  try {
    const body = formBody({ tracking, ask_collection: '0' })
    const res = await fetch(ecotrackEndpoint('/api/v1/valid/order'), {
      method: 'POST',
      headers: ecotrackHeaders('application/x-www-form-urlencoded'),
      body,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => ({})) as EcotrackMutationResponse
    return mutationResult(res, data)
  } catch {
    return { success: false, message: 'Network error' }
  }
}

// UPDATE order
export async function ecotrackUpdateOrder(tracking: string, params: {
  client?: string
  adresse?: string
  commune?: string
  wilaya?: number
  montant?: number
  tel?: string
  tel2?: string
  product?: string
  stop_desk?: number
}): Promise<{ success: boolean; message?: string }> {
  try {
    const body = formBody({
      tracking,
      type: '1',
      client: params.client,
      adresse: params.adresse,
      commune: params.commune,
      wilaya: params.wilaya !== undefined ? String(params.wilaya) : undefined,
      montant: params.montant !== undefined ? String(params.montant) : undefined,
      tel: params.tel,
      tel2: params.tel2,
      product: params.product,
      stop_desk: params.stop_desk !== undefined ? String(params.stop_desk) : undefined,
    })

    const res = await fetch(ecotrackEndpoint('/api/v1/update/order'), {
      method: 'POST',
      headers: ecotrackHeaders('application/x-www-form-urlencoded'),
      body,
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => ({})) as EcotrackMutationResponse
    return mutationResult(res, data)
  } catch {
    return { success: false, message: 'Network error' }
  }
}

// DELETE order
export async function ecotrackDeleteOrder(tracking: string): Promise<EcotrackDeleteResult> {
  try {
    const endpoint = new URL(ecotrackEndpoint('/api/v1/delete/order'))
    endpoint.searchParams.set('tracking', tracking.trim())
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: ecotrackHeaders(),
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
    })
    const data = await res.json().catch(() => ({})) as EcotrackMutationResponse
    const deleteState = String(data.delete ?? '').trim().toLowerCase()

    // Some Ecotrack accounts return { delete: "success|fail" } instead of
    // the documented { success, message } response for this endpoint.
    if (res.ok && (data.success === true || ['success', 'ok', 'true', '1'].includes(deleteState))) {
      return { success: true, message: mutationMessage(data) }
    }

    return {
      success: false,
      message: mutationMessage(data),
      lookupRequired: res.ok && data.success === undefined && deleteState === 'fail',
    }
  } catch {
    return { success: false, message: 'Network error' }
  }
}
