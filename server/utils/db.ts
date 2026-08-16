import { createError } from 'h3'
import { drizzle } from 'drizzle-orm/d1'
import type { H3Event } from 'h3'
import * as schema from '../database/schema'

type Db = ReturnType<typeof drizzle<typeof schema>>
let localDb: Db | null = null

export async function getDb(event?: H3Event): Promise<Db> {
  if (import.meta.dev) { // dev: local libsql file DB (dead-code-eliminated in the Worker build)
    if (!localDb) {
      const fs = await import('node:fs')
      fs.mkdirSync('data', { recursive: true })
      const { createClient } = await import('@libsql/client')
      const { drizzle: drizzleLibsql } = await import('drizzle-orm/libsql')
      localDb = drizzleLibsql(createClient({ url: 'file:data/db.sqlite' }), { schema }) as unknown as Db
    }
    return localDb
  }
  const env = (event?.context as any)?.cloudflare?.env
  if (env?.DB) return drizzle(env.DB, { schema }) as Db
  throw createError({ statusCode: 500, statusMessage: 'Database not configured' })
}
