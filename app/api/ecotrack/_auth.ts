import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function requireAdmin(): Promise<{ userId: string } | NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  return { userId: user.id }
}
