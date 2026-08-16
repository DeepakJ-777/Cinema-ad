/** Shift an "HH:MM" string by delta minutes (wraps around midnight). */
export function shiftMinutes(hhmm: string, delta: number): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const total = ((((h * 60 + m + delta) % 1440) + 1440) % 1440)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

/** Format "HH:MM" (24h) as "h:MM AM/PM". */
export function fmt12(hhmm: string): string {
  const [h = 0, m = 0] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr}:${String(m).padStart(2, '0')} ${ampm}`
}
