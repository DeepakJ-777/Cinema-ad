import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev) return
  try {
    const { createClient } = await import('@libsql/client')
    const { readdir, readFile, mkdir } = await import('node:fs/promises')
    await mkdir('data', { recursive: true })
    const client = createClient({ url: 'file:data/db.sqlite' })

    // Apply migrations only on a fresh database (drizzle SQL isn't idempotent)
    const tables = await client.execute(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='users'",
    )
    if (Number(tables.rows[0].n) === 0) {
      const dir = 'server/database/migrations'
      for (const f of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort())
        await client.executeMultiple(await readFile(`${dir}/${f}`, 'utf8'))
    }

    const count = await client.execute('SELECT COUNT(*) AS n FROM cinemas')
    if (Number(count.rows[0].n) === 0) {
      await client.executeMultiple(await readFile('server/database/seed.sql', 'utf8'))
      console.log('[dev-db] seeded data/db.sqlite')
    }
  }
  catch (e) {
    console.warn('[dev-db] skipped:', e instanceof Error ? e.message : e)
  }
})
