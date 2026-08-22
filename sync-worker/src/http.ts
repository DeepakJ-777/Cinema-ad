/**
 * Shared polite-fetch layer for provider integrations.
 *
 * Rules baked in: one attempt per URL (zero retries), honestly-identifying
 * User-Agent, per-run fetch budget, and precise classification of
 * access-control responses. A block is a block — we log it and stop; we never
 * retry, rotate clients, or strip headers to sneak through.
 */

export interface FetchBudget { left: number }

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export const UA = 'CinemaCommunity-Sync/0.1 (community cinema start-times app; contact: dev@example.com)'

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
  skipped?: string
  headers: Record<string, string>
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

export async function politeFetch(url: string, budget: FetchBudget, accept = 'text/html,application/xhtml+xml'): Promise<FetchResult> {
  if (budget.left <= 0)
    return { url, status: 0, statusText: '', ms: 0, bytes: 0, skipped: 'per-run fetch budget exhausted', headers: {} }
  budget.left--

  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(url, { headers: { 'user-agent': UA, accept }, redirect: 'follow' })
  }
  catch (e: any) {
    return { url, status: 0, statusText: '', ms: Date.now() - t0, bytes: 0, headers: {}, blockedReason: `network error: ${e?.name}: ${e?.message}` }
  }
  const body = await res.text().catch(() => '')
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
