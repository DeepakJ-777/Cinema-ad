<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Cinema, Showtime } from '~/types'
import { fmt12 } from '~/utils/time'

/**
 * Mobile-only bottom sheet that opens when a cinema marker is tapped on the
 * full-screen map. Two tabs, both fed by the existing cinema payload (no extra
 * API calls):
 *   • Details   — ad aggregate, full community rating breakdown, reviews
 *   • Showtimes — today's shows grouped by movie (or an honest empty state)
 * "View all showtimes" switches to the Showtimes tab IN the sheet, so the user
 * never has to scroll away from the map. A small optional link still leads to
 * the full CinemaDetail flow.
 */
const props = defineProps<{
  cinema: Cinema | null
  open: boolean
  distanceKm?: number | null
}>()

const emit = defineEmits<{ close: [], 'view-details': [] }>()

const { openContribute } = useCinemaStore()

/** lg breakpoint (1024px) — the sheet is a mobile-only affordance. */
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches

watch(() => props.open, (open) => {
  if (!import.meta.client) return
  // Never lock scrolling when the sheet is hidden on desktop.
  document.body.style.overflow = open && !isDesktop() ? 'hidden' : ''
  // Every fresh marker tap starts on the Details tab.
  if (open) activeTab.value = 'details'
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
function onMqChange(e: MediaQueryListEvent) {
  // Viewport grew to desktop — close so the hidden sheet can't lock scrolling.
  if (e.matches && props.open) emit('close')
}
let mq: MediaQueryList | null = null
onMounted(() => {
  window.addEventListener('keydown', onKey)
  mq = window.matchMedia('(min-width: 1024px)')
  mq.addEventListener('change', onMqChange)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  mq?.removeEventListener('change', onMqChange)
  document.body.style.overflow = ''
})

/* ---------------- Tabs ---------------- */

const activeTab = ref<'details' | 'shows'>('details')

/** Opens the existing contribute modal (ad duration + ratings in one form) for
 *  this cinema — same flow as CinemaDetail's "Rate this theatre". The sheet
 *  closes first so the modal owns the screen and the body-scroll lock cleanly. */
function contribute() {
  if (!props.cinema) return
  emit('close')
  openContribute({ cinema: props.cinema })
}

/* ---------------- Content (all from the existing cinema payload) ---------------- */

/** "2.4 km from you" / "450 m from you" — null (omitted) without a location fix. */
const distanceLabel = computed(() => {
  if (props.distanceKm == null) return null
  return props.distanceKm < 1
    ? `${Math.round(props.distanceKm * 1000)} m from you`
    : `${props.distanceKm.toFixed(1)} km from you`
})

/** Report-weighted typical ad duration across this cinema's shows (same
 *  aggregate TicketCard uses). null → "No ad data yet". */
const typicalAds = computed(() => {
  const all = (props.cinema?.movies ?? [])
    .flatMap(m => m.showtimes)
    .filter(st => st.adDurationMin != null && st.adReports > 0)
  if (!all.length) return null
  const totalWeight = all.reduce((s, st) => s + (st.adReports || 1), 0)
  const avg = all.reduce((s, st) => s + st.adDurationMin! * (st.adReports || 1), 0) / totalWeight
  return Math.round(avg)
})

const movies = computed(() => (props.cinema?.movies ?? []).filter(m => m.showtimes.length > 0))

/** Short audience quotes — same cap as CinemaDetail. */
const reviews = computed(() => (props.cinema?.reviews ?? []).slice(0, 4))

/** A showtime provider covered this cinema recently (within 36 h) — so an
 *  empty movie list means the provider confirmed there are no shows today
 *  (same logic as CinemaDetail). Otherwise we can't claim "no shows". */
const providerConfirmed = computed(() => {
  const syncedAt = props.cinema?.syncedAt
  if (!syncedAt) return false
  const age = Date.now() - Date.parse(syncedAt)
  return Number.isFinite(age) && age >= 0 && age < 36 * 3600 * 1000
})

/** Distinct formats of a movie's shows, e.g. "2D · 3D" (as MovieRow shows). */
function movieFormats(m: { showtimes: Showtime[] }): string {
  return [...new Set(m.showtimes.map(s => s.format))].join(' · ')
}

/** Availability badge class for a showtime chip (provider data; mirrors MovieRow). */
function availClass(a?: string | null): string {
  if (!a) return ''
  if (a === 'sold_out') return 'bg-mist/15 text-mist line-through decoration-mist/60'
  if (a === 'filling_fast' || a === 'almost_full') return 'bg-amber-400/15 text-amber-300'
  return ''
}

/** Provider availability status → short badge label (mirrors MovieRow). */
function availLabel(a: string): string {
  if (a === 'sold_out') return 'Sold out'
  if (a === 'filling_fast') return 'Filling fast'
  if (a === 'almost_full') return 'Almost full'
  return a.replace(/_/g, ' ')
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && cinema"
        class="fixed inset-0 z-[1100] lg:hidden"
        role="dialog"
        aria-modal="true"
        :aria-label="`${cinema.name} actions`"
      >
        <!-- Scrim — tap to return to the map (map stays visible beneath) -->
        <div class="absolute inset-0 bg-bg/70 backdrop-blur-sm" @click="emit('close')" />

        <Transition
          enter-active-class="transition-transform duration-300 ease-out"
          enter-from-class="translate-y-full"
          leave-active-class="transition-transform duration-200 ease-in"
          leave-to-class="translate-y-full"
        >
          <div class="absolute inset-x-0 bottom-0 p-3">
            <div class="relative rounded-2xl border border-reel bg-bg-alt p-4 pt-3 shadow-2xl">
              <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-reel" aria-hidden="true" />
              <button
                class="btn-press absolute right-3 top-2 text-xl leading-none text-mist hover:text-paper"
                aria-label="Close and return to map"
                @click="emit('close')"
              >
                ✕
              </button>

              <!-- Always-visible header: name + rating + distance -->
              <h2 class="pr-8 font-display text-lg leading-tight text-paper">{{ cinema.name }}</h2>
              <div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span v-if="cinema.overall != null" class="font-semibold text-paper">
                  ⭐ {{ cinema.overall.toFixed(1) }}/5
                  <span class="font-normal text-mist">· {{ cinema.ratingCount }} rating{{ cinema.ratingCount === 1 ? '' : 's' }}</span>
                </span>
                <span v-else class="text-mist">No ratings yet</span>
                <span v-if="distanceLabel" class="text-body">📍 {{ distanceLabel }}</span>
              </div>

              <!-- Tab bar -->
              <div
                class="mt-3 flex rounded-full border border-reel bg-bg-alt2 p-1"
                role="tablist"
                aria-label="Cinema information"
              >
                <button
                  role="tab"
                  :aria-selected="activeTab === 'details'"
                  :class="[
                    'btn-press flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                    activeTab === 'details' ? 'bg-marquee text-ink' : 'text-mist hover:text-paper',
                  ]"
                  @click="activeTab = 'details'"
                >
                  Details
                </button>
                <button
                  role="tab"
                  :aria-selected="activeTab === 'shows'"
                  :class="[
                    'btn-press flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                    activeTab === 'shows' ? 'bg-marquee text-ink' : 'text-mist hover:text-paper',
                  ]"
                  @click="activeTab = 'shows'"
                >
                  Showtimes
                </button>
              </div>

              <!-- ── Details tab ─────────────────────────────────────────── -->
              <div
                v-if="activeTab === 'details'"
                role="tabpanel"
                aria-label="Details"
                class="scroll-slim mt-3 max-h-[38dvh] space-y-3 overflow-y-auto overscroll-contain pr-1"
              >
                <!-- Ad information -->
                <div class="rounded-xl bg-bg-alt2 px-3 py-2.5">
                  <template v-if="typicalAds != null">
                    <p class="text-sm font-semibold text-paper">📢 Usually has ads</p>
                    <p class="mt-0.5 text-xs text-body">~{{ typicalAds }} min before the movie</p>
                  </template>
                  <template v-else>
                    <p class="text-sm text-mist">📢 No ad data yet</p>
                    <div class="mt-2 flex gap-2">
                      <button
                        class="btn-press flex-1 rounded-lg border border-reel bg-bg px-3 py-1.5 text-xs font-semibold text-paper hover:border-marquee hover:text-marquee"
                        @click="contribute()"
                      >
                        ★ Add rating
                      </button>
                      <button
                        class="btn-press flex-1 rounded-lg bg-marquee px-3 py-1.5 text-xs font-semibold text-ink hover:bg-curtain-bright"
                        @click="contribute()"
                      >
                        Contribute AD data
                      </button>
                    </div>
                  </template>
                </div>

                <!-- Full community rating breakdown (reused component) -->
                <div>
                  <p class="font-mono text-[10px] uppercase tracking-widest text-mist">The crowd verdict</p>
                  <RatingBars
                    v-if="cinema.ratingCount > 0"
                    :ratings="cinema.ratings"
                    :overall="cinema.overall"
                    class="mt-2"
                  />
                  <p v-else class="mt-2 rounded-xl bg-bg-alt2 p-3 text-xs leading-relaxed text-mist">
                    No community ratings yet — be the first to rate this theatre.
                  </p>
                </div>

                <!-- Audience quotes -->
                <div v-if="reviews.length">
                  <p class="font-mono text-[10px] uppercase tracking-widest text-mist">From the audience</p>
                  <div class="mt-2 space-y-2">
                    <blockquote v-for="r in reviews" :key="r.text" class="rounded-lg bg-bg-alt2 p-3">
                      <p class="text-xs leading-relaxed text-body">“{{ r.text }}”</p>
                      <footer class="mt-1 text-[10px] text-mist">— {{ r.name }} · {{ r.date }}</footer>
                    </blockquote>
                  </div>
                </div>
              </div>

              <!-- ── Showtimes tab ────────────────────────────────────────── -->
              <div
                v-else
                role="tabpanel"
                aria-label="Showtimes"
                class="scroll-slim mt-3 max-h-[38dvh] overflow-y-auto overscroll-contain pr-1"
              >
                <p class="font-mono text-[10px] uppercase tracking-widest text-mist">Today's shows</p>
                <div v-if="movies.length" class="mt-2 space-y-3">
                  <div v-for="m in movies" :key="m.id">
                    <p class="truncate text-sm font-semibold text-paper">{{ m.title }}</p>
                    <p class="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-mist">
                      {{ m.language }}<template v-if="movieFormats(m)"> · {{ movieFormats(m) }}</template>
                    </p>
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                      <span
                        v-for="st in m.showtimes"
                        :key="st.id"
                        :class="['rounded-lg border border-reel bg-bg px-2.5 py-1 text-xs text-paper', availClass(st.availability)]"
                      >
                        {{ fmt12(st.startTime) }} <span class="opacity-60">{{ st.format }}</span>
                        <span
                          v-if="st.availability && st.availability !== 'available'"
                          class="ml-0.5 text-[10px] font-semibold uppercase tracking-wide"
                        >{{ availLabel(st.availability) }}</span>
                      </span>
                    </div>
                  </div>
                </div>
                <p v-else class="mt-2 rounded-xl bg-bg-alt2 px-3 py-3 text-xs leading-relaxed text-mist">
                  {{ providerConfirmed
                    ? 'No shows today — the showtime provider currently lists none at this cinema.'
                    : 'Showtimes unavailable right now' }}
                </p>
              </div>

              <!-- CTA (Details tab): flip to the Showtimes tab in-sheet —
                   the user never has to scroll away from the map -->
              <template v-if="activeTab === 'details'">
                <button
                  class="btn-press mt-3 w-full rounded-lg bg-marquee px-4 py-2.5 text-sm font-semibold text-ink hover:bg-curtain-bright"
                  @click="activeTab = 'shows'"
                >
                  View all showtimes
                </button>
                <button
                  class="btn-press mt-1 w-full rounded-lg px-2 py-1.5 text-[11px] font-medium uppercase tracking-widest text-mist hover:text-marquee"
                  @click="emit('view-details')"
                >
                  Open full cinema details ↓
                </button>
              </template>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
