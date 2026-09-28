export const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
export const isStock = (value: unknown) => value === null ||
  (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2147483647)
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max
const money = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 90071992547409.91
const position = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 10000

export function validProductSave(body: Record<string, unknown>) {
  const p = body.product
  const colors = body.colors
  const sizes = body.sizes
  const stocks = body.stock_changes
  if (!isRecord(p) || !isUuid(p.id) || !text(p.name, 250) || !money(p.price) || Number(p.price) <= 0 ||
      !money(p.original_price) || (Number(p.original_price) > 0 && Number(p.original_price) < Number(p.price)) ||
      !(p.description === null || (typeof p.description === 'string' && p.description.length <= 20000)) ||
      typeof p.is_visible !== 'boolean' || !(p.category_id === null || isUuid(p.category_id)) ||
      !(body.expected_updated_at === null || (typeof body.expected_updated_at === 'string' && Number.isFinite(Date.parse(body.expected_updated_at)))) ||
      !Array.isArray(colors) || colors.length < 1 || colors.length > 100 ||
      !Array.isArray(sizes) || sizes.length > 100 || !Array.isArray(stocks) || stocks.length > 10000) return false

  if (!colors.every(c => isRecord(c) && isUuid(c.id) && text(c.name, 100) && text(c.hex_code, 30) &&
    typeof c.is_visible === 'boolean' && position(c.sort_order) && Array.isArray(c.images) && c.images.length <= 100 &&
    c.images.every(i => isRecord(i) && typeof i.image_url === 'string' && /^https?:\/\//.test(i.image_url) &&
      i.image_url.length <= 4000 && position(i.sort_order)))) return false
  if (!sizes.every(s => isRecord(s) && isUuid(s.id) && text(s.label, 100) &&
    typeof s.is_visible === 'boolean' && position(s.sort_order))) return false
  const colorIds = new Set(colors.map(c => c.id))
  const sizeIds = new Set(sizes.map(s => s.id))
  if (colorIds.size !== colors.length || sizeIds.size !== sizes.length) return false
  return stocks.every(s => isRecord(s) && colorIds.has(s.color_id) && sizeIds.has(s.size_id) &&
    isStock(s.stock) && isStock(s.expected_stock)) &&
    new Set(stocks.map(s => `${s.color_id}:${s.size_id}`)).size === stocks.length
}
