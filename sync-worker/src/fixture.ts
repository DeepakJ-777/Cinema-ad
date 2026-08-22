/**
 * DEV-ONLY fixture provider. Enabled exclusively via USE_FIXTURE=1 (local
 * .dev.vars / --var) so the normalize → D1 → stale-cleanup pipeline can be
 * exercised end-to-end while the real BookMyShow endpoint remains
 * bot-protected. Data mirrors the documented example response; rows written
 * by it carry source='bookmyshow' with provider id 'bookmyshow-fixture' in
 * every log/summary so fixture runs are unmistakable. Never enabled by
 * default and never in production.
 */

import type { ProviderInput, ProviderLocationData, ShowtimeProvider } from './provider'

export class FixtureBookMyShowProvider implements ShowtimeProvider {
  readonly id = 'bookmyshow-fixture'

  async syncLocation(input: ProviderInput): Promise<ProviderLocationData> {
    const eventCode = 'ET00439318'
    const dateIso = `${input.dateCode.slice(0, 4)}-${input.dateCode.slice(4, 6)}-${input.dateCode.slice(6, 8)}`
    return {
      venues: [
        { code: 'VKJP', name: 'PVR: Lulu', address: 'Lulu Mall, Edappally, Kochi 682024' },
        { code: 'EYUA', name: 'Cinepolis: Centre Square', address: 'Centre Square Mall, MG Road, Ernakulam' },
        { code: 'XXXX', name: 'EVM Cinema A/C 4K RGB Laser 3D: Perumbavoor', address: 'Perumbavoor' },
      ],
      events: [{ code: eventCode, title: 'Awarapan 2', language: 'hindi' }],
      shows: [
        { venueCode: 'VKJP', eventCode, show: { sessionId: '43619', showDate: dateIso, showTime: '22:45', showTimeCode: '2245', showDateTime: `${dateIso}T22:45:00`, availabilityStatus: 'available', format: '2D · Hindi', language: 'hindi' } },
        { venueCode: 'EYUA', eventCode, show: { sessionId: '10544', showDate: dateIso, showTime: '22:05', showTimeCode: '2205', showDateTime: `${dateIso}T22:05:00`, availabilityStatus: 'available', format: '2D · Hindi', language: 'hindi' } },
        { venueCode: 'XXXX', eventCode, show: { sessionId: '10555', showDate: dateIso, showTime: '21:45', showTimeCode: '2145', showDateTime: `${dateIso}T21:45:00`, availabilityStatus: 'sold_out', format: '3D · Hindi', language: 'hindi' } },
      ],
      pages: [{ url: 'fixture://showtimes', status: 200, ms: 0, bytes: 0 }],
    }
  }
}
