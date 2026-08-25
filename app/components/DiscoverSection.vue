<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Cinema } from '~/types'
import { CITIES } from '~/utils/cities'

const {
  cinemas,
  city,
  setCity,
  search,
  minRating,
  nearRadiusKm,
  filteredCinemas,
  activeCinema,
  userLocation,
  nearMode,
  locating,
  nearPhaseLabel,
  selectCinema,
  requestLocation,
  distanceTo,
  openContribute,
  openAuthModal,
  onlyFavourites,
} = useCinemaStore()

const { user } = useAuth()
const { ids: favIds } = useFavourites()
const favCount = computed(() => favIds.value.length)
const toast = useToast()

function toggleFavouritesFilter() {
  if (!user.value) {
    toast.push('Sign in to view your favourite theatres')
    openAuthModal()
    return
  }
  onlyFavourites.value = !onlyFavourites.value
}

const cityOptions = [
  { id: 'all' as const, name: 'All' },
  ...Object.values(CITIES).map(c => ({ id: c.id, name: c.name })),
]

const areaLabel = computed(() => {
  if (onlyFavourites.value) return 'Your favourites'
  if (nearMode.value) return 'Near you'
  if (city.value === 'all') return 'All cities'
  return CITIES[city.value]?.name ?? city.value
})

/** Map view: fit to nearby cinemas + user (near-me), the browsed city, or everything. */
const fitPoints = computed<[number, number][]>(() => {
  if (nearMode.value) {
    const pts: [number, number][] = filteredCinemas.value.map(c => [c.lat, c.lng])
    if (userLocation.value) pts.push([userLocation.value.lat, userLocation.value.lng])
    return pts
  }
  if (city.value !== 'all')
    return cinemas.value.filter(c => c.city === city.value).map(c => [c.lat, c.lng] as [number, number])
  return cinemas.value.map(c => [c.lat, c.lng] as [number, number])
})

/** Honest warning when nothing exists inside the near-me radius. */
const noNearby = computed(() =>
  nearMode.value
  && filteredCinemas.value.length > 0
  && distanceTo(filteredCinemas.value[0]!) != null
  && (distanceTo(filteredCinemas.value[0]!) ?? Infinity) > nearRadiusKm.value)

/** Mobile action sheet: opens when a map marker is tapped (lg: hidden —
 *  desktop keeps the existing tap-to-select + inline CinemaDetail flow). */
const sheetOpen = ref(false)

function onMapSelect(id: string) {
  selectCinema(id) // existing selection flow (marker highlight + panTo)
  // The sheet is a mobile affordance; desktop keeps the existing inline flow.
  if (typeof window !== 'undefined' && !window.matchMedia('(min-width: 1024px)').matches) {
    sheetOpen.value = true
  }
}

function closeSheet() {
  sheetOpen.value = false
}

/** Existing route to the showtimes: scroll to the CinemaDetail section. */
function viewCinemaDetails() {
  if (!activeCinema.value) return
  selectCinema(activeCinema.value.id, { scroll: true })
  sheetOpen.value = false
}

/** Row-level quick actions: open the existing contribute modal (ad duration +
 *  ratings in one form) for the tapped cinema. */
function contributeFor(c: Cinema) {
  openContribute({ cinema: c })
}

/* Mobile list collapsing: below lg the CINEMAS list starts as a short preview
 * (first rows) and each "Expand list" press reveals EXPAND_STEP more; desktop
 * (lg+) always shows everything. The SSR/first render is collapsed so
 * hydration matches on both viewports, then desktop flips after mount. */
const MOBILE_LIST_PREVIEW = 6
const EXPAND_STEP = 10
const visibleCount = ref(MOBILE_LIST_PREVIEW)
const isDesktopList = ref(false)
let listMq: MediaQueryList | null = null
function onListMq(e: MediaQueryListEvent) {
  isDesktopList.value = e.matches
}
onMounted(() => {
  listMq = window.matchMedia('(min-width: 1024px)')
  isDesktopList.value = listMq.matches
  listMq.addEventListener('change', onListMq)
})
onUnmounted(() => listMq?.removeEventListener('change', onListMq))

const visibleCinemas = computed(() =>
  isDesktopList.value
    ? filteredCinemas.value
    : filteredCinemas.value.slice(0, visibleCount.value))

/** Each press adds EXPAND_STEP rows above the toggle — the overflow-anchor CSS
 *  on the toggle stops scroll anchoring from gliding down the list; this is a
 *  defensive snap-back in case a browser still shifts. */
function expandList() {
  const y = window.scrollY
  visibleCount.value += EXPAND_STEP
  nextTick(() => {
    if (Math.abs(window.scrollY - y) > 4) {
      window.scrollTo({ top: y, behavior: 'instant' as ScrollBehavior })
    }
  })
}

/** Collapse back to the default 6-row preview. */
function collapseList() {
  visibleCount.value = MOBILE_LIST_PREVIEW
}

// A new browsing context (search/city/rating/near-me/favourites) starts collapsed again.
watch([search, city, minRating, nearMode, onlyFavourites], () => {
  visibleCount.value = MOBILE_LIST_PREVIEW
})
</script>

<template>
  <!-- Mobile: edge-to-edge map that fills the first viewport (heading hidden,
       toolbar above the map, ticket list peeks below the fold). lg+: unchanged. -->
  <section id="discover" class="scroll-mt-20 px-0 pt-3 pb-0 lg:px-6 lg:pt-14 lg:pb-14">
    <div class="mx-auto max-w-7xl">
      <div class="flex flex-col gap-4 px-4 md:flex-row md:items-end md:justify-between lg:px-0">
        <div class="hidden lg:block">
          <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-marquee">
            {{ areaLabel }}
          </p>
          <h2 class="mt-1 font-display text-2xl text-paper sm:text-3xl">Discover Theatres</h2>
        </div>

        <!-- Controls Toolbar above Map -->
        <div class="flex w-full flex-wrap items-center gap-2.5 sm:gap-3 lg:w-auto">
          <!-- Search Bar -->
          <label class="relative flex-1 sm:flex-initial">
            <input
              id="cinema-search"
              v-model="search"
              type="search"
              placeholder="Search cinemas…"
              class="w-full sm:w-48 md:w-56 rounded-full border border-reel bg-bg-alt py-1.5 pl-8 pr-3 text-xs text-paper placeholder:text-mist/60 focus:border-marquee focus:outline-none"
            />
            <svg viewBox="0 0 24 24" class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" stroke-linecap="round" />
            </svg>
          </label>

          <!-- Filter / Control Group: right-aligned -->
          <div class="ml-auto flex flex-wrap items-center justify-end gap-2.5 sm:gap-3">
            <!-- City Switcher (All, Kochi, Bengaluru) -->
            <div class="flex rounded-full border border-reel bg-bg-alt p-1" title="Browse predefined cities">
              <button
                v-for="c in cityOptions"
                :key="c.id"
                :class="[
                  'btn-press rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                  !nearMode && !onlyFavourites && city === c.id ? 'bg-marquee text-ink' : 'text-mist hover:text-paper',
                ]"
                @click="setCity(c.id); onlyFavourites = false"
              >
                {{ c.name }}
              </button>
            </div>

            <!-- Near Me Button -->
            <button
              :class="[
                'btn-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                nearMode
                  ? 'border-sage bg-sage text-ink hover:bg-curtain-bright'
                  : 'border-reel text-paper hover:border-mist/60',
              ]"
              @click="requestLocation(); onlyFavourites = false"
            >
              <span v-if="nearMode">✓</span>
              {{ locating ? 'Locating…' : nearMode ? 'Near You' : 'Near Me' }}
            </button>

            <!-- Favourites Filter Button -->
            <button
              :class="[
                'btn-press flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                onlyFavourites
                  ? 'border-marquee bg-marquee text-ink hover:bg-curtain-bright'
                  : 'border-reel text-paper hover:border-mist/60',
              ]"
              :aria-pressed="onlyFavourites"
              title="Filter by your favourite theatres"
              @click="toggleFavouritesFilter()"
            >
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" :fill="onlyFavourites ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M12 20s-7.5-4.6-7.5-10a4.6 4.6 0 0 1 7.5-3.6A4.6 4.6 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>Favourites</span>
              <span v-if="user && favCount > 0" class="text-[10px] opacity-80">({{ favCount }})</span>
            </button>

            <span v-if="nearPhaseLabel" class="animate-pulse text-[11px] font-medium text-marquee">
              {{ nearPhaseLabel }}
            </span>

            <!-- Min Rating Dropdown -->
            <label class="flex items-center gap-1.5 font-mono text-xs text-mist">
              <span class="hidden sm:inline">Min</span>
              <select
                v-model.number="minRating"
                class="rounded-lg border border-reel bg-bg-alt px-2 py-1 text-xs text-paper focus:border-marquee focus:outline-none"
                aria-label="Filter by minimum rating"
              >
                <option :value="0">Any rating</option>
                <option :value="3.5">3.5+</option>
                <option :value="4">4.0+</option>
                <option :value="4.5">4.5+</option>
              </select>
            </label>

            <span class="text-xs text-mist shrink-0">({{ filteredCinemas.length }})</span>
          </div>
        </div>
      </div>


      <div class="mt-3 grid gap-0 lg:mt-6 lg:gap-5 lg:grid-cols-[55fr_45fr]">
        <!-- Map panel — always renders every cinema, no matter the filters or zoom.
             Mobile: fills the viewport under the controls; the height also clears
             the mobile bottom nav (bar + safe-area inset) so the zoom controls
             and the list peek stay visible above it. -->
        <div
          id="discover-map"
          class="relative h-[calc(100dvh-16rem-env(safe-area-inset-bottom))] min-h-[420px] overflow-hidden rounded-none bg-bg-alt lg:h-[620px] lg:rounded-2xl"
        >
          <ClientOnly>
            <CinemaMap
              :cinemas="cinemas"
              :selected-id="activeCinema?.id ?? null"
              :fit-points="fitPoints"
              :user-location="userLocation"
              @select="onMapSelect"
            />
            <template #fallback>
              <div class="grid h-full place-items-center font-mono text-xs text-mist">Map loading…</div>
            </template>
          </ClientOnly>
          <span
            class="pointer-events-none absolute left-3 top-3 rounded-md bg-bg/85 px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-marquee"
          >
            {{ filteredCinemas.length }} of {{ cinemas.length }} screens
          </span>
        </div>

        <!-- Ticket list panel -->
        <div id="cinema-list" class="mx-4 mt-5 flex flex-col rounded-2xl border border-reel bg-bg-alt scroll-mt-24 lg:mx-0 lg:mt-0 lg:h-[620px]">
          <div class="flex items-center gap-3 border-b border-reel/70 p-4">
            <label class="relative flex-1 md:hidden">
              <input
                v-model="search"
                type="search"
                placeholder="Search cinemas…"
                class="w-full rounded-lg border border-reel bg-bg py-1.5 pl-8 pr-3 text-sm text-paper placeholder:text-mist/60 focus:border-marquee focus:outline-none"
              />
              <svg viewBox="0 0 24 24" class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4.5 4.5" stroke-linecap="round" />
              </svg>
            </label>
            <span class="hidden text-sm font-semibold uppercase tracking-widest text-mist md:block">
              Cinemas
            </span>
            <span class="ml-auto hidden shrink-0 text-[11px] uppercase tracking-widest text-mist/70 md:block">
              tap a card
            </span>
          </div>
          <div class="scroll-slim flex-1 space-y-4 overflow-y-auto p-4">
            <p
              v-if="noNearby"
              class="rounded-xl border border-reel bg-bg-alt2 p-4 text-center text-xs leading-relaxed text-mist"
            >
              📡 No cinemas within {{ nearRadiusKm }} km of you yet — the nearest ones are shown below.
              Pick a city above to browse instead.
            </p>
            <div
              v-if="onlyFavourites && !filteredCinemas.length"
              class="rounded-xl border border-reel bg-bg-alt2 p-6 text-center text-sm text-mist"
            >
              <p class="font-display text-base text-paper">No favourite theatres yet</p>
              <p class="mt-1 text-xs leading-relaxed">
                Tap the ♡ beside any theatre name to save it to your favourites.
              </p>
              <button
                class="btn-press mt-4 inline-flex items-center gap-1.5 rounded-lg border border-reel bg-bg px-3.5 py-1.5 text-xs font-semibold text-marquee hover:border-marquee"
                @click="onlyFavourites = false"
              >
                View all theatres
              </button>
            </div>
            <p v-else-if="!filteredCinemas.length" class="rounded-xl border border-reel bg-bg-alt2 p-6 text-center text-sm text-mist">
              No cinemas match “{{ search }}”.
              <button class="ml-1 font-semibold text-marquee underline" @click="search = ''">Clear</button>
            </p>
            <TicketCard
              v-for="c in visibleCinemas"
              :key="c.id"
              :cinema="c"
              :active="c.id === activeCinema?.id"
              :distance-km="distanceTo(c)"
              show-city
              @select="selectCinema(c.id, { scroll: true })"
              @contribute="contributeFor(c)"
              @rate="contributeFor(c)"
            />

            <!-- Mobile only: progressive list controls, side by side.
                 Expand list shows while more rows remain; Collapse shows once
                 expanded past the preview and resets to the default 6 rows.
                 overflow-anchor:none keeps the browser from anchoring to the
                 toggles when rows are inserted/removed around them. -->
            <div
              v-if="!isDesktopList && (filteredCinemas.length > visibleCinemas.length || visibleCount > MOBILE_LIST_PREVIEW)"
              class="flex gap-2 pt-1 lg:hidden [overflow-anchor:none]"
            >
              <button
                v-if="filteredCinemas.length > visibleCinemas.length"
                class="btn-press flex-1 rounded-lg border border-reel px-3 py-2 text-xs font-semibold text-paper hover:border-marquee hover:text-marquee [overflow-anchor:none]"
                @click="expandList"
              >
                Expand list ▾
              </button>
              <button
                v-if="visibleCount > MOBILE_LIST_PREVIEW"
                class="btn-press flex-1 rounded-lg border border-reel px-3 py-2 text-xs font-medium text-mist hover:border-marquee hover:text-marquee [overflow-anchor:none]"
                @click="collapseList"
              >
                Collapse ▴
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Mobile cinema action sheet (marker tap) -->
    <CinemaActionSheet
      :cinema="activeCinema"
      :open="sheetOpen"
      :distance-km="activeCinema ? distanceTo(activeCinema) : null"
      @close="closeSheet"
      @view-details="viewCinemaDetails"
    />
  </section>
</template>
