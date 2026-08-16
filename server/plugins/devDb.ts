import { defineNitroPlugin } from 'nitropack/runtime'

export default defineNitroPlugin(async () => {
  if (!import.meta.dev) return
  try {
    const { createClient } = await import('@libsql/client')
    const { readdir, readFile, mkdir } = await import('node:fs/promises')
    await mkdir('data', { recursive: true })
    const client = createClient({ url: 'file:data/db.sqlite' })

    // Track applied migrations so new ones apply incrementally on an existing dev DB
    const existed = await client.execute(
      "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='_dev_migrations'",
    )
    await client.execute('CREATE TABLE IF NOT EXISTS _dev_migrations (name TEXT PRIMARY KEY)')

    const dir = 'server/database/migrations'
    const files = (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()

    // Upgrade path: DB created before the tracking table — assume every existing
    // migration was already applied, so only genuinely new ones run below.
    if (Number(existed.rows[0].n) === 0) {
      const hasUsers = await client.execute(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='users'",
      )
      if (Number(hasUsers.rows[0].n) > 0) {
        for (const f of files)
          await client.execute({ sql: 'INSERT OR IGNORE INTO _dev_migrations (name) VALUES (?)', args: [f] })
        console.log('[dev-db] backfilled migration tracking for pre-existing database')
      }
    }

    for (const f of files) {
      const done = await client.execute({ sql: 'SELECT 1 FROM _dev_migrations WHERE name = ?', args: [f] })
      if (done.rows.length) continue
      await client.executeMultiple(await readFile(`${dir}/${f}`, 'utf8'))
      await client.execute({ sql: 'INSERT INTO _dev_migrations (name) VALUES (?)', args: [f] })
      console.log(`[dev-db] applied migration ${f}`)
    }

    const count = await client.execute('SELECT COUNT(*) AS n FROM cinemas')
    if (Number(count.rows[0].n) === 0) {
      await client.executeMultiple(await readFile('server/database/seed.sql', 'utf8'))
      console.log('[dev-db] seeded data/db.sqlite (SYNTHETIC demo data)')
    }
  }
  catch (e) {
    console.warn('[dev-db] skipped:', e instanceof Error ? e.message : e)
  }
})
