export function isValidOrderTotal(value: unknown, deliveryPrice: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= deliveryPrice
    && Number.isSafeInteger(Math.round(value * 100))
    && value === Math.round(value * 100) / 100
}
