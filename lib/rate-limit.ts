import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextRequest, NextResponse } from 'next/server'

type PublicLimiterName = 'orders' | 'reviews'

type LimiterConfig = {
  limiter: Ratelimit
  message: string
}

let ordersLimiter: Ratelimit | null = null
let reviewsLimiter: Ratelimit | null = null

function hasUpstashEnv() {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN
  )
}

function getRedis() {
  return Redis.fromEnv()
}

function getLimiter(name: PublicLimiterName): LimiterConfig | null {
  if (!hasUpstashEnv()) return null

  if (name === 'orders') {
    ordersLimiter ??= new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(3, '1 m'),
      analytics: true,
      prefix: 'melyima:ratelimit:orders',
    })

    return {
      limiter: ordersLimiter,
      message: 'تم إرسال طلبات كثيرة خلال وقت قصير. يرجى الانتظار دقيقة ثم المحاولة مجدداً.',
    }
  }

  reviewsLimiter ??= new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(2, '10 m'),
    analytics: true,
    prefix: 'melyima:ratelimit:reviews',
  })

  return {
    limiter: reviewsLimiter,
    message: 'تم إرسال تقييمات كثيرة خلال وقت قصير. يرجى المحاولة لاحقاً.',
  }
}

export function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    forwardedFor ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('true-client-ip') ||
    'unknown'
  )
}

export async function rateLimitPublicApi(req: NextRequest, name: PublicLimiterName) {
  const config = getLimiter(name)

  if (!config) {
    const message = 'خدمة الحماية من كثرة الطلبات غير مفعّلة حالياً. يرجى المحاولة لاحقاً.'

    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: message },
        { status: 503 }
      )
    }

    console.warn('Upstash rate limiting skipped: missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN')
    return null
  }

  const ip = getClientIp(req)
  const result = await config.limiter.limit(ip)

  if (result.success) return null

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000)
  )

  return NextResponse.json(
    { success: false, error: config.message },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
      },
    }
  )
}
