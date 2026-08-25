import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getRequestURL } from 'h3'
import type { H3Event } from 'h3'
import { getDb } from './db'
import { accounts, sessions, users, verifications } from '../database/schema'

export async function getAuth(event: H3Event) {
  const db = await getDb(event)
  const env = (event.context as any)?.cloudflare?.env
  // Secret comes from the Worker env binding (wrangler secret); dev fallback is 32+ chars
  const secret = env?.NUXT_AUTH_SECRET || process.env.NUXT_AUTH_SECRET || 'dev-only-insecure-secret-override-me-0123456789'
  const googleClientId = env?.GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const googleClientSecret = env?.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET

  return betterAuth({
    secret,
    baseURL: `${getRequestURL(event).origin}/api/auth`,
    database: drizzleAdapter(db as any, {
      provider: 'sqlite',
      // Keys must match the modelName remaps below (plural table names)
      schema: { users, sessions, accounts, verifications },
    }),
    socialProviders: {
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {}),
    },
    account: {
      modelName: 'accounts',
      accountLinking: {
        enabled: true,
        trustedProviders: ['google'],
        requireLocalEmailVerified: false,
      },
    },
    user: { modelName: 'users' },
    session: { modelName: 'sessions' },
    verification: { modelName: 'verifications' },
  })
}
