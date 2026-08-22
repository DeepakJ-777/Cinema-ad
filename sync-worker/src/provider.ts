/**
 * ShowtimeProvider — the only seam through which showtime data enters the
 * system. The application (cron, D1 writer) depends on this interface alone,
 * never on a concrete vendor, so BookMyShow can be swapped for an authorized
 * API/partnership or another legitimate provider without touching the rest.
 */

import type { FetchBudget } from './http'

export interface ProviderVenue {
  code: string // provider venue code (BMS venueCode / District cinema id)
  name: string // e.g. "PVR: Lulu" / "PVR Lulu, Lulu International Shopping Mall, Kochi"
  address?: string
  /** District: numeric cinema id from the CD-prefixed page URL. */
  districtId?: string
  /** Provider-supplied coordinates when the venue payload carries them. */
  lat?: number
  lng?: number
  /** Our D1 cinema this venue was resolved to during discovery (provider-driven
   *  providers know which known cinema they fetched a page for). */
  matchedVenueId?: string
}

export interface ProviderEvent {
  code: string // provider event code (BMS ET00439318 / District contentId)
  title: string
  language?: string
  durationMin?: number
  posterUrl?: string
}

export interface ProviderShow {
  sessionId: string
  showDate: string // YYYY-MM-DD
  showTime: string // HH:MM, 24h
  showTimeCode?: string
  /** Local wall-clock value exactly as the provider published it, e.g.
   *  '2026-08-17T09:45' — NEVER reinterpreted through new Date(). */
  showDateTime?: string
  availabilityStatus: string // available | filling_fast | sold_out | …
  format?: string
  language?: string
  screen?: string
}

export interface ProviderShowLink {
  venueCode: string
  eventCode: string
  show: ProviderShow
}

/** Everything one successful location sync produced (normalized, no raw JSON). */
export interface ProviderLocationData {
  venues: ProviderVenue[]
  events: ProviderEvent[]
  shows: ProviderShowLink[]
  pages: { url: string; status: number; ms: number; bytes: number }[]
}

/** A cinema already known to us (D1 row) that a provider may attach to. */
export interface KnownVenue {
  id: string // our cinema id
  name: string
  lat?: number
  lng?: number
  districtCinemaId?: string | null
}

export interface ProviderInput {
  slug: string // canonical city slug, e.g. 'kochi'
  name: string
  regionCode: string // provider-specific, from sync_locations.region_code
  dateCode: string // YYYYMMDD (the day to sync)
  budget: FetchBudget
  /** Our cinemas in this location — used by cinema-driven providers (District)
   *  to decide which provider pages to fetch. Optional; BMS ignores it. */
  knownVenues?: KnownVenue[]
}

/** The provider refused automated access (bot protection, auth, etc.).
 *  The run must stop and log — never retry or work around. */
export class ProviderBlockedError extends Error {
  constructor(reason: string, public status?: number) { super(reason) }
}

/** Configuration incomplete (e.g. missing region_code) — skip, don't fail. */
export class ProviderSkippedError extends Error {}

export interface ShowtimeProvider {
  readonly id: string
  syncLocation(input: ProviderInput): Promise<ProviderLocationData>
}
