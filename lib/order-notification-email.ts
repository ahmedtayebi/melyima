import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

type NotificationOrderItem = {
  product_name: string
  color_name: string
  size_label: string
  quantity: number
}

type NotificationOrder = {
  id: string
  customer_name: string
  phone: string
  phone2: string | null
  wilaya: string
  wilaya_name: string | null
  commune: string | null
  delivery_type: 'home' | 'office'
  delivery_price: number
  products_total: number
  total_price: number
  address: string | null
  notes: string | null
  created_at: string
  order_items: NotificationOrderItem[]
}

const ORDER_SELECT = `
  id, customer_name, phone, phone2, wilaya, wilaya_name, commune,
  delivery_type, delivery_price, products_total, total_price, address,
  notes, created_at,
  order_items(product_name, color_name, size_label, quantity)
`

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatPrice(value: number) {
  return `${new Intl.NumberFormat('fr-DZ').format(value)} دج`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ar-DZ', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  }).format(new Date(value))
}

function buildOrderEmail(order: NotificationOrder) {
  const shortId = order.id.slice(0, 6).toUpperCase()
  const deliveryLabel = order.delivery_type === 'home' ? 'توصيل للمنزل' : 'استلام من المكتب'
  const wilaya = order.wilaya_name || order.wilaya
  const phoneNumbers = order.phone2 ? `${order.phone} / ${order.phone2}` : order.phone
  const location = [wilaya, order.commune].filter(Boolean).join(' - ')
  const adminUrl = 'https://www.melyima.com/admin'

  const itemRows = order.order_items.map((item) => `
    <tr>
      <td style="padding:12px 10px;border-bottom:1px solid #eadfce;text-align:right;font-weight:700;">
        ${escapeHtml(item.product_name)}
      </td>
      <td style="padding:12px 10px;border-bottom:1px solid #eadfce;text-align:center;">
        ${escapeHtml(item.color_name)}
      </td>
      <td style="padding:12px 10px;border-bottom:1px solid #eadfce;text-align:center;">
        ${escapeHtml(item.size_label)}
      </td>
      <td style="padding:12px 10px;border-bottom:1px solid #eadfce;text-align:center;">
        ${escapeHtml(item.quantity)}
      </td>
    </tr>
  `).join('')

  const textItems = order.order_items
    .map((item) => `- ${item.product_name} | ${item.color_name} | ${item.size_label} | ${item.quantity}x`)
    .join('\n')

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;background:#f7f2e9;color:#211b17;font-family:Arial,Tahoma,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:28px 16px;">
      <div style="background:#1c1511;color:#ffffff;padding:22px 24px;border-radius:8px 8px 0 0;">
        <div style="color:#c6922b;font-size:14px;font-weight:700;margin-bottom:6px;">MELY·IMA</div>
        <h1 style="font-size:24px;line-height:1.4;margin:0;">طلب جديد #${shortId}</h1>
        <p style="margin:6px 0 0;color:#d9d0ca;font-size:14px;">${escapeHtml(formatDate(order.created_at))}</p>
      </div>

      <div style="background:#ffffff;padding:24px;border:1px solid #eadfce;border-top:0;">
        <h2 style="font-size:18px;margin:0 0 16px;">معلومات الزبون</h2>
        <table role="presentation" style="width:100%;border-collapse:collapse;font-size:15px;line-height:1.7;">
          <tr><td style="padding:5px 0;color:#7b6b5e;width:130px;">الاسم</td><td style="padding:5px 0;font-weight:700;">${escapeHtml(order.customer_name)}</td></tr>
          <tr><td style="padding:5px 0;color:#7b6b5e;">الهاتف</td><td style="padding:5px 0;direction:ltr;text-align:right;font-weight:700;">${escapeHtml(phoneNumbers)}</td></tr>
          <tr><td style="padding:5px 0;color:#7b6b5e;">نوع التوصيل</td><td style="padding:5px 0;">${deliveryLabel}</td></tr>
          <tr><td style="padding:5px 0;color:#7b6b5e;">الموقع</td><td style="padding:5px 0;">${escapeHtml(location)}</td></tr>
          ${order.address ? `<tr><td style="padding:5px 0;color:#7b6b5e;">العنوان</td><td style="padding:5px 0;">${escapeHtml(order.address)}</td></tr>` : ''}
        </table>

        <h2 style="font-size:18px;margin:26px 0 12px;">المنتجات</h2>
        <table style="width:100%;border-collapse:collapse;background:#fcfaf7;border:1px solid #eadfce;font-size:14px;">
          <thead>
            <tr style="background:#f3e8d6;color:#5f5044;">
              <th style="padding:10px;text-align:right;">المنتج</th>
              <th style="padding:10px;">اللون</th>
              <th style="padding:10px;">المقاس</th>
              <th style="padding:10px;">الكمية</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
        </table>

        <table role="presentation" style="width:100%;margin-top:18px;border-collapse:collapse;font-size:15px;">
          <tr><td style="padding:5px 0;color:#7b6b5e;">سعر المنتجات</td><td style="padding:5px 0;text-align:left;font-weight:700;">${escapeHtml(formatPrice(order.products_total))}</td></tr>
          <tr><td style="padding:5px 0;color:#7b6b5e;">سعر التوصيل</td><td style="padding:5px 0;text-align:left;font-weight:700;">${escapeHtml(formatPrice(order.delivery_price))}</td></tr>
          <tr><td style="padding:12px 0 0;border-top:1px solid #eadfce;font-size:17px;font-weight:700;">الإجمالي</td><td style="padding:12px 0 0;border-top:1px solid #eadfce;text-align:left;color:#a87116;font-size:19px;font-weight:700;">${escapeHtml(formatPrice(order.total_price))}</td></tr>
        </table>

        ${order.notes ? `
          <div style="margin-top:22px;padding:14px 16px;background:#fff8e8;border-right:4px solid #c6922b;">
            <div style="font-weight:700;margin-bottom:5px;">ملاحظة الزبون</div>
            <div style="white-space:pre-wrap;line-height:1.7;">${escapeHtml(order.notes)}</div>
          </div>
        ` : ''}

        <div style="margin-top:26px;text-align:center;">
          <a href="${adminUrl}" style="display:inline-block;background:#941f32;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:700;">فتح لوحة الطلبات</a>
        </div>
      </div>
    </div>
  </body>
</html>`

  const text = `طلب جديد #${shortId}

الاسم: ${order.customer_name}
الهاتف: ${phoneNumbers}
نوع التوصيل: ${deliveryLabel}
الموقع: ${location}
${order.address ? `العنوان: ${order.address}\n` : ''}
المنتجات:
${textItems}

سعر المنتجات: ${formatPrice(order.products_total)}
سعر التوصيل: ${formatPrice(order.delivery_price)}
الإجمالي: ${formatPrice(order.total_price)}
${order.notes ? `\nملاحظة الزبون: ${order.notes}\n` : ''}
لوحة الطلبات: ${adminUrl}`

  return {
    subject: `طلب جديد #${shortId} - MELYIMA`,
    html,
    text,
  }
}

export async function sendNewOrderNotification(orderId: string) {
  const apiKey = process.env.RESEND_API_KEY
  const recipient = process.env.ORDER_NOTIFICATION_EMAIL
  const from = process.env.ORDER_NOTIFICATION_FROM || 'MELYIMA <notifications@melyima.com>'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!apiKey || !recipient || !supabaseUrl || !serviceRoleKey) {
    console.warn('New order email skipped: notification environment variables are incomplete')
    return
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .single()

  if (error || !data) {
    throw new Error(`Could not load order ${orderId} for email: ${error?.message ?? 'not found'}`)
  }

  const order = data as NotificationOrder
  const email = buildOrderEmail(order)
  const resend = new Resend(apiKey)
  const { data: sentEmail, error: sendError } = await resend.emails.send(
    {
      from,
      to: [recipient],
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: 'category', value: 'new-order' }],
    },
    { idempotencyKey: `new-order/${order.id}` }
  )

  if (sendError) {
    throw new Error(`Resend rejected order ${orderId}: ${sendError.message}`)
  }

  console.info(`New order email sent for ${orderId}: ${sentEmail.id}`)
}
