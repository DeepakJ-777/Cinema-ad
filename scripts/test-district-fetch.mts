import { istToday } from '../sync-worker/src/district-shows.ts'

const CINEMAS = [
  { id: '1022294', name: 'PVR Lulu Mall' },
  { id: '1020743', name: 'PVR Oberon Mall' },
  { id: '1025902', name: 'PVR Forum Mall' },
  { id: '122', name: 'Cinepolis Centre Square' },
  { id: '1013404', name: 'Vanitha Cineplex (test id)' },
]

const UA = 'CinemaCommunity-Sync/0.1 (community cinema start-times app; contact: dev@example.com)'
const DELAY_MS = 2500
const TIMEOUT_MS = 15000

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isConnectionResetError(err: any): boolean {
  if (!err) return false
  const msg = (err.message || String(err)).toLowerCase()
  const code = (err.code || err.cause?.code || '').toLowerCase()
  const causeMsg = (err.cause?.message || String(err.cause || '')).toLowerCase()
  return (
    code.includes('econnreset') ||
    code.includes('und_err_socket') ||
    code.includes('epipe') ||
    code.includes('etimedout') ||
    msg.includes('connection reset') ||
    msg.includes('connection was forcibly closed') ||
    msg.includes('socket closed') ||
    msg.includes('10054') ||
    msg.includes('fetch failed') ||
    causeMsg.includes('econnreset') ||
    causeMsg.includes('forcibly closed') ||
    causeMsg.includes('10054')
  )
}

async function fetchCinemaPage(cinemaId: string, citySlug = 'kochi', date = istToday()) {
  const url = `https://www.district.in/movies/x-in-${citySlug}-CD${cinemaId}?fromdate=${date}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(new Error(`Request timeout after ${TIMEOUT_MS}ms`)), TIMEOUT_MS)
  
  const t0 = Date.now()
  let response: Response | null = null
  let body = ''
  let status = 0
  let statusText = ''
  
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': UA,
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    status = response.status
    statusText = response.statusText
    body = await response.text()
  } finally {
    clearTimeout(timeoutId)
  }
  
  const durationMs = Date.now() - t0
  return { url, status, statusText, durationMs, body, bytes: Buffer.byteLength(body, 'utf8') }
}

async function fetchWithOptionalRetry(cinema: { id: string, name: string }, date = istToday()) {
  const url = `https://www.district.in/movies/x-in-kochi-CD${cinema.id}?fromdate=${date}`
  let attempt = 1
  while (true) {
    const t0 = Date.now()
    try {
      const res = await fetchCinemaPage(cinema.id, 'kochi', date)
      if (res.status === 200) {
        // Test parsing __NEXT_DATA__
        const m = res.body.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
        if (!m) {
          return {
            cinema,
            url,
            success: false,
            status: res.status,
            durationMs: res.durationMs,
            bytes: res.bytes,
            error: `no __NEXT_DATA__ script found (${res.bytes} bytes)`,
          }
        }
        const json = JSON.parse(m[1])
        const ss = json?.props?.pageProps?.data?.serverState
        const state = ss ? (ss[`${cinema.id}${date}`] ?? ss[cinema.id] ?? Object.values(ss)[0]) : null
        const sessionsCount = state?.arrangedSessions?.length ?? 0
        return {
          cinema,
          url,
          success: true,
          status: res.status,
          durationMs: res.durationMs,
          bytes: res.bytes,
          sessionsCount,
          cinemaName: state?.meta?.cinema?.name ?? 'Unknown',
        }
      } else {
        return {
          cinema,
          url,
          success: false,
          status: res.status,
          durationMs: res.durationMs,
          bytes: res.bytes,
          error: `HTTP ${res.status} ${res.statusText}`,
        }
      }
    } catch (err: any) {
      const durationMs = Date.now() - t0
      const isReset = isConnectionResetError(err)
      const errReason = `${err.name || 'Error'}: ${err.message || String(err)}${err.cause ? ` (cause: ${err.cause.message || err.cause})` : ''}`
      
      if (attempt === 1 && isReset) {
        console.log(`  [Retry] ${cinema.name} failed with connection reset (${errReason}). Waiting 4s before 1 retry...`)
        attempt++
        await sleep(4000)
        continue
      }
      
      return {
        cinema,
        url,
        success: false,
        status: 0,
        durationMs,
        bytes: 0,
        error: isReset ? `Connection reset (${errReason})` : errReason,
      }
    }
  }
}

async function run() {
  console.log(`Starting sequential fetch test for ${CINEMAS.length} Kochi cinemas (delay: ${DELAY_MS}ms, timeout: ${TIMEOUT_MS}ms)...`)
  console.log(`Date: ${istToday()}\n`)
  
  const results = []
  for (let i = 0; i < CINEMAS.length; i++) {
    const cinema = CINEMAS[i]
    console.log(`[Cinema ${i + 1}/${CINEMAS.length}] Fetching ${cinema.name} (CD${cinema.id})...`)
    const res = await fetchWithOptionalRetry(cinema)
    results.push(res)
    
    if (res.success) {
      console.log(`  ✓ HTTP ${res.status} in ${res.durationMs}ms | ${res.bytes} bytes | ${res.sessionsCount} movie sessions | parsed: "${res.cinemaName}"`)
    } else {
      console.log(`  ✗ FAILED in ${res.durationMs}ms | HTTP ${res.status} | URL: ${res.url} | reason: ${res.error}`)
    }
    
    if (i < CINEMAS.length - 1) {
      console.log(`  Waiting ${DELAY_MS}ms before next cinema...`)
      await sleep(DELAY_MS)
    }
  }
  
  console.log('\n================ SUMMARY ================')
  for (const r of results) {
    console.log(`${r.cinema.name.padEnd(26)} | ${r.success ? 'OK' : 'FAILED'} | status: ${String(r.status).padStart(3)} | ${String(r.durationMs).padStart(5)}ms | ${String(r.bytes).padStart(6)} bytes | ${r.success ? `parsed (${r.sessionsCount} sessions)` : `error: ${r.error}`}`)
  }
}

run().catch(console.error)
