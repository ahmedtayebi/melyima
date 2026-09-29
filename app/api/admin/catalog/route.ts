import { NextResponse } from 'next/server'
import { requireAdmin } from '@/app/api/ecotrack/_auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidateStoreCache } from '@/lib/store-cache'
import { isRecord, isStock, isUuid, validProductSave } from '@/lib/catalog-validation'

export async function POST(request: Request) {
  try {
    const auth = await requireAdmin()
    if (auth instanceof NextResponse) return auth
    const body: unknown = await request.json()
    const invalid = () => NextResponse.json({ success: false, error: 'بيانات الحفظ غير صحيحة' }, { status: 400 })
    if (!isRecord(body)) return invalid()
    const db = createAdminClient()
    let result: { data?: unknown; error: { message: string; code?: string } | null }
    switch (body.action) {
      case 'product_save':
        if (!validProductSave(body)) return invalid()
        result = await db.rpc('save_catalog_product', {
          p_product: body.product, p_colors: body.colors, p_sizes: body.sizes,
          p_stock_changes: body.stock_changes, p_expected_updated_at: body.expected_updated_at,
        })
        break
      case 'stock_save':
        if (!isUuid(body.product_id) || !isUuid(body.color_id) || !isUuid(body.size_id) ||
          !isStock(body.stock) || !isStock(body.expected_stock)) return invalid()
        result = await db.rpc('set_variant_stock_checked', {
          p_product_id: body.product_id, p_color_id: body.color_id, p_size_id: body.size_id,
          p_stock: body.stock, p_expected_stock: body.expected_stock,
        })
        break
      case 'settings_save':
        if (typeof body.policy !== 'string' || body.policy.length > 20000) return invalid()
        result = await db.from('store_settings').upsert({ key: 'store_policy', value: body.policy }, { onConflict: 'key' })
        break
      case 'category_create':
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100 ||
          !Number.isInteger(body.sort_order) || Number(body.sort_order) < 0) return invalid()
        result = await db.from('categories').insert({ name: body.name.trim(), sort_order: body.sort_order }).select().single()
        break
      case 'category_delete':
      case 'product_delete':
      case 'review_delete': {
        if (!isUuid(body.id)) return invalid()
        const table = body.action === 'category_delete' ? 'categories' : body.action === 'product_delete' ? 'products' : 'reviews'
        result = await db.from(table).delete().eq('id', body.id).select('id').single()
        break
      }
      case 'product_visibility':
        if (!isUuid(body.id) || typeof body.visible !== 'boolean') return invalid()
        result = await db.from('products').update({ is_visible: body.visible }).eq('id', body.id).select('id').single()
        break
      case 'review_status':
        if (!isUuid(body.id) || !['approved', 'rejected'].includes(String(body.status))) return invalid()
        result = await db.from('reviews').update({ status: body.status }).eq('id', body.id).select('id').single()
        break
      default: return invalid()
    }
    if (result.error) {
      if (result.error.message.includes('order_option_in_use')) {
        return NextResponse.json({ success: false, error: 'لا يمكن حذف منتج أو لون أو مقاس مرتبط بطلب، حتى لو كان الطلب في المحذوفات. استخدمي الإخفاء للحفاظ على بيانات الطلبات.' }, { status: 409 })
      }
      const conflict = ['stock_conflict', 'product_conflict', 'product_unavailable'].includes(result.error.message)
      console.error('Catalog save failed:', body.action, result.error)
      return NextResponse.json({ success: false, error: conflict
        ? 'تغيّرت بيانات المنتج أو المخزون. حدّثي الصفحة وراجعي القيم قبل الحفظ مجددًا.'
        : 'تعذّر حفظ التغييرات. لم يكتمل الحفظ، يرجى المحاولة مجددًا.' }, { status: conflict ? 409 : 500 })
    }
    let warning: string | undefined
    try {
      invalidateStoreCache()
    } catch (error) {
      console.error('Catalog saved but cache refresh failed:', error)
      warning = 'تم الحفظ، لكن تعذّر تحديث صفحات المتجر. قد تتأخر التغييرات في الظهور حتى التحديث التالي.'
    }
    return NextResponse.json({ success: true, data: result.data ?? null, warning })
  } catch (error) {
    console.error('Catalog request failed:', error)
    return NextResponse.json({ success: false, error: 'تعذّر حفظ التغييرات' }, { status: 500 })
  }
}
