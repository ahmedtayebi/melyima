export function isValidOrderTotal(value: unknown, deliveryPrice: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= deliveryPrice
    && Number.isSafeInteger(Math.round(value * 100))
    && value === Math.round(value * 100) / 100
}

// Anchor a manually entered total to the basket at the time it was entered.
// Later item changes add/subtract their price, preserving the agreed adjustment.
export function adjustOrderTotalForItems(value: string, previousProductsTotal: number, productsTotal: number): string {
  const total = value.trim() === '' ? NaN : Number(value)
  if (!isValidOrderTotal(total, 0) || previousProductsTotal === productsTotal) return value
  return String((Math.round(total * 100) + Math.round(productsTotal * 100) - Math.round(previousProductsTotal * 100)) / 100)
}
