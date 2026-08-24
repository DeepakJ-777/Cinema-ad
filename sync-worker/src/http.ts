/**
 * Shared polite-fetch layer for provider integrations.
 *
 * Rules baked in: honestly-identifying User-Agent, per-run fetch budget,
 * configurable AbortController timeout, clean stream draining, and precise
 * classification of access-control responses.
 *
 * At most ONE retry after a longer delay (4s) exclusively for transport-level
 * connection-reset / socket errors (e.g. ECONNRESET, 10054, socket closed).
 * HTTP-level errors (4xx, 5xx, challenges) are NEVER retried.
 */

export interface FetchBudget { left: number }

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const UA = 'CinemaCommunity-Sync/0.1 (community cinema start-times app; contact: dev@example.com)'
export const DEFAULT_FETCH_TIMEOUT_MS = 20_000

/** Statuses that mean "access control", not "page missing". */
const BLOCK_STATUSES = new Set([401, 403, 406, 429, 503])

const CHALLENGE_MARKERS = [
  'just a moment', 'attention required', 'checking your browser',
  'cf-chl', 'challenge-platform', 'are you a human', 'captcha',
  'access denied', 'request denied', 'unusual traffic',
]

export interface FetchResult {
  url: string
  status: number
  statusText: string
  ms: number
  bytes: number
  body?: string
  blockedReason?: string
  errorReason?: string
  skipped?: string
  headers: Record<string, string>
}

/** Check if an error represents a transport / socket connection reset. */
export function isConnectionResetError(err: unknown): boolean {
  if (!err) return false
  const e = err as any
  const msg = (e.message || String(e)).toLowerCase()
  const code = (e.code || e.cause?.code || '').toLowerCase()
  const causeMsg = (e.cause?.message || String(e.cause || '')).toLowerCase()
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

export function classifyBlock(status: number, statusText: string, body: string, headers: Record<string, string>): string | undefined {
  const lower = body.toLowerCase()
  const marker = CHALLENGE_MARKERS.find(m => lower.includes(m))
  if (marker)
    return `HTTP ${status} ${statusText} — bot-protection/challenge (marker: "${marker}"; server: ${headers.server || '?'}; cf-ray: ${headers['cf-ray'] || 'n/a'})`
  if (BLOCK_STATUSES.has(status))
    return `HTTP ${status} ${statusText} (server: ${headers.server || '?'}; body: "${body.slice(0, 160).replace(/\s+/g, ' ')}")`
  return undefined
}

export interface PoliteFetchOptions {
  timeoutMs?: number
  allowOneRetryOnReset?: boolean
  retryDelayMs?: number
}

export async function politeFetch(
  url: string,
  budget: FetchBudget,
  accept = 'text/html,application/xhtml+xml',
  options: PoliteFetchOptions = {},
): Promise<FetchResult> {
  if (budget.left <= 0)
    return { url, status: 0, statusText: '', ms: 0, bytes: 0, skipped: 'per-run fetch budget exhausted', headers: {} }
  budget.left--

  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS
  const allowRetry = options.allowOneRetryOnReset ?? true
  const retryDelay = options.retryDelayMs ?? 4000

  let attempt = 1
  while (true) {
    const t0 = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error(`request timeout after ${timeoutMs}ms`)), timeoutMs)
    let res: Response
    try {
      res = await fetch(url, {
        headers: {
          'user-agent': UA,
          accept,
          'accept-language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: controller.signal,
      })
    }
    catch (e: any) {
      clearTimeout(timer)
      const ms = Date.now() - t0
      const isReset = isConnectionResetError(e)
      const reason = `network error: ${e?.name ?? 'Error'}: ${e?.message ?? e}${e?.cause ? ` (cause: ${e.cause?.message ?? e.cause})` : ''}`
      if (attempt === 1 && allowRetry && isReset) {
        console.log(`[polite-fetch] socket reset on ${url} (${reason}) — waiting ${retryDelay}ms before single retry`)
        attempt++
        await sleep(retryDelay)
        continue
      }
      return {
        url,
        status: 0,
        statusText: '',
        ms,
        bytes: 0,
        headers: {},
        errorReason: reason,
        blockedReason: isReset ? `connection reset (${reason})` : reason,
      }
    }
    finally {
      clearTimeout(timer)
    }

    let body = ''
    try {
      body = await res.text()
    }
    catch (e: any) {
      const ms = Date.now() - t0
      const isReset = isConnectionResetError(e)
      const reason = `stream error reading body from ${url}: ${e?.message ?? e}`
      if (attempt === 1 && allowRetry && isReset) {
        console.log(`[polite-fetch] socket reset reading body on ${url} — waiting ${retryDelay}ms before single retry`)
        attempt++
        await sleep(retryDelay)
        continue
      }
      return {
        url: res.url || url,
        status: res.status,
        statusText: res.statusText,
        ms,
        bytes: 0,
        headers: { server: res.headers.get('server') ?? '', 'cf-ray': res.headers.get('cf-ray') ?? '' },
        errorReason: reason,
        blockedReason: isReset ? `connection reset (${reason})` : reason,
      }
    }

    const headers = { server: res.headers.get('server') ?? '', 'cf-ray': res.headers.get('cf-ray') ?? '' }
    const out: FetchResult = {
      url: res.url || url,
      status: res.status,
      statusText: res.statusText,
      ms: Date.now() - t0,
      bytes: body.length,
      headers,
    }
    if (res.ok) out.body = body
    else out.blockedReason = classifyBlock(res.status, res.statusText, body, headers)
    return out
  }
}

