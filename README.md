This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Upstash Redis Rate Limiting

The public order and review APIs use Upstash Redis through `@upstash/ratelimit`.

Limits:

- Orders: 3 submissions per IP per minute.
- Reviews: 2 submissions per IP per 10 minutes.

Setup:

1. Create a free account at https://console.upstash.com.
2. Create a new Redis database. The free tier is enough for this rate limiter.
3. Open the database, then copy the REST API credentials.
4. Add these environment variables locally and in Vercel:

```bash
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
```

5. In Vercel, add them under Project Settings -> Environment Variables for Production, Preview, and Development as needed, then redeploy.

In production, the public APIs fail closed with an Arabic error message if these variables are missing. In local development, requests are allowed and a warning is logged so the app remains easy to run.

## New Order Email Notifications

New orders can send a non-blocking admin notification through Resend. Verify the sending domain in Resend, then add these server-only variables locally and in Vercel:

```bash
RESEND_API_KEY="re_..."
ORDER_NOTIFICATION_EMAIL="admin@example.com"
ORDER_NOTIFICATION_FROM="MELYIMA <notifications@melyima.com>"
```

Email delivery failures are logged but do not prevent an order from being saved.
