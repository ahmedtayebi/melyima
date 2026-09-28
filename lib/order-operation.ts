import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { createAdminClient } from '@/lib/supabase/admin'

type Database = ReturnType<typeof createAdminClient>

export const orderBusyResponse = () => NextResponse.json({
  success: false,
  error: 'توجد عملية أخرى على هذا الطلب. انتظري اكتمالها ثم حدّثي الصفحة وحاولي مجددًا.',
}, { status: 409 })

export async function acquireOrderOperation(db: Database, orderId: string) {
  const token = randomUUID()
  const { data, error } = await db.rpc('try_lock_order_operation', { p_order_id: orderId, p_token: token })
  if (error) throw new Error(`Order lock failed: ${error.message}`)
  if (!data) return null
  return async () => {
    // A failed release stays locked rather than permitting unsafe concurrent work.
    try {
      const { error } = await db.rpc('release_order_operation', { p_order_id: orderId, p_token: token })
      if (error) console.error('Order lock requires recovery:', orderId, error.message)
    } catch (error) {
      console.error('Order lock requires recovery:', orderId, error)
    }
  }
}
