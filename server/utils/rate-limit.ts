/**
 * Basic in-memory sliding-window rate limiter for contributions.
 * Deliberately simple (per-isolate) — enough to blunt casual spam/hammering
 * in the MVP. A durable version (D1/KV counters) can come later.
 */
const buckets = new Map<string, number[]>()

export function allowRequest(key: string, limit = 8, windowMs = 60_000): boolean {
  const now = Date.now()
  if (buckets.size > 5000) { // periodic sweep so the map can't grow forever
    for (const [k, ts] of buckets) {
      if (!ts.some(t => now - t < windowMs)) buckets.delete(k)
    }
  }
  const recent = (buckets.get(key) ?? []).filter(t => now - t < windowMs)
  if (recent.length >= limit) {
    buckets.set(key, recent)
    return false
  }
  recent.push(now)
  buckets.set(key, recent)
  return true
}
