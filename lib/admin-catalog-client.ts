// Mutations and cache invalidation run together on the authenticated server.
export async function saveCatalog<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/admin/catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  const result = await response.json()
  if (!response.ok || !result.success) {
    throw new Error(result.error || 'تعذّر حفظ التغييرات')
  }
  // The database commit succeeded: never encourage retrying it as a failed save.
  if (result.warning) window.alert(result.warning)
  return result.data as T
}
