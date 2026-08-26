<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Cinema } from '~/types'
import { CITIES } from '~/utils/cities'

/**
 * /map — Interactive Cinema Discovery Application.
 * Full-viewport map interface (inspired by Google Maps / Apple Maps).
 * Zero document-level vertical scroll; all theatre details and showtimes open
 * inside CinemaActionSheet.vue.
 */
const {
  cinemas,
  city,
  setCity,
  search,
  minRating,
  nearRadiusKm,
  filteredCinemas,
  activeCinema,
  selectedCinemaId,
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

const route = useRoute()

const favouritesOpen = useState('cc:fav-open', () => false)

function openFavouritesModal() {
  if (!user.value) {
    toast.push('Sign in to view your favourite theatres')
    openAuthModal()
    return
  }
  favouritesOpen.value = true
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

/** Map fit points based on near-me, browsed city, or all cinemas. */
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

/** Sheet state for theatre details */
const sheetOpen = useState('cc:sheet-open', () => false)

/** Search & Cinema List Drawer state (mobile affordance) */
const searchDrawerOpen = useState('cc:search-drawer', () => false)

// Watch query param ?theatre=id to open directly if linked
watch(() => route.query.theatre, (theatreId) => {
  if (theatreId && typeof theatreId === 'string') {
    selectCinema(theatreId)
    sheetOpen.value = true
  }
}, { immediate: true })

function openSearchDrawer() {
  searchDrawerOpen.value = true
  nextTick(() => {
    const input = document.getElementById('cinema-search') as HTMLInputElement | null
    input?.focus()
  })
}

// If navigated with ?search=1, open the search drawer and focus initial search bar
watch(() => route.query.search, (s) => {
  if (s) openSearchDrawer()
}, { immediate: true })

watch(searchDrawerOpen, (open) => {
  if (open) {
    nextTick(() => {
      const input = document.getElementById('cinema-search') as HTMLInputElement | null
      input?.focus()
    })
  }
})

// History management so mobile back button closes open drawers/sheets instead of leaving /map
let pushedHistory = false

watch([searchDrawerOpen, sheetOpen], ([drawer, sheet]) => {
  if (!import.meta.client) return
  const anyOpen = drawer || sheet
  if (anyOpen && !pushedHistory) {
    window.history.pushState({ modal: 'open' }, '')
    pushedHistory = true
  } else if (!anyOpen && pushedHistory) {
    pushedHistory = false
  }
})

function onPopState() {
  if (sheetOpen.value) {
    sheetOpen.value = false
    pushedHistory = false
  } else if (searchDrawerOpen.value) {
    searchDrawerOpen.value = false
    pushedHistory = false
  }
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (searchDrawerOpen.value) searchDrawerOpen.value = false
  }
}

onMounted(() => {
  window.addEventListener('popstate', onPopState)
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('popstate', onPopState)
  window.removeEventListener('keydown', onKey)
})

function onMapSelect(id: string) {
  selectCinema(id)
  searchDrawerOpen.value = false
  sheetOpen.value = true
}

function closeSheet() {
  sheetOpen.value = false
}

function onCardSelect(c: Cinema) {
  selectCinema(c.id)
  searchDrawerOpen.value = false
  sheetOpen.value = true
}

function contributeFor(c: Cinema, mode: 'ad' | 'rating' = 'ad') {
  openContribute({ cinema: c, mode })
}

/* ---------------- Progressive List Pagination (10 initial + 10 expand) ---------------- */
const INITIAL_LIST_COUNT = 10
const EXPAND_STEP = 10
const visibleCount = ref(INITIAL_LIST_COUNT)

const visibleCinemas = computed(() =>
  filteredCinemas.value.slice(0, visibleCount.value),
)

function expandList() {
  visibleCount.value += EXPAND_STEP
}

function collapseList() {
  visibleCount.value = INITIAL_LIST_COUNT
}

// Reset pagination when searching or changing filters
watch([search, city, minRating, nearMode, onlyFavourites], () => {
  visibleCount.value = INITIAL_LIST_COUNT
})
</script>

<template>
  <div class="relative h-full w-full overflow-hidden bg-bg">
    <!-- Full-Screen Interactive Map Canvas -->
    <div class="absolute inset-0 z-0 h-full w-full">
      <ClientOnly>
        <CinemaMap
          :cinemas="cinemas"
          :selected-id="activeCinema?.id ?? null"
          :fit-points="fitPoints"
          :user-location="userLocation"
          @select="onMapSelect"
        />
        <template #fallback>
          <div class="flex h-full w-full flex-col items-center justify-center bg-bg gap-3.5">
            <div class="relative flex h-12 w-12 items-center justify-center">
              <span class="absolute h-full w-full animate-ping rounded-full bg-marquee/20"></span>
              <span class="relative h-7 w-7 rounded-full border-2 border-marquee border-t-transparent animate-spin"></span>
            </div>
            <div class="flex flex-col items-center gap-1">
              <p class="font-display text-sm font-bold tracking-wider text-paper">
                SHOWSTART<span class="text-marquee">·MAP</span>
              </p>
              <p class="font-mono text-[11px] uppercase tracking-widest text-mist/80 animate-pulse">
                Loading live map & theatres…
              </p>
            </div>
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- Floating Top Toolbar (Search + City + Radius/Filters + Embedded Theatres Dropdown) -->
    <div
      class="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2 sm:top-4 sm:px-6 transition-opacity duration-200"
      :class="[
        sheetOpen ? 'max-lg:hidden' : '',
        searchDrawerOpen ? 'z-[1120]' : 'z-[1050]',
      ]"
    >
      <div
        class="pointer-events-auto flex w-full max-w-5xl flex-col gap-2 rounded-2xl border border-reel/80 bg-bg/95 p-2 shadow-2xl backdrop-blur-xl sm:p-3 transition-all duration-300"
        :class="searchDrawerOpen ? 'max-h-[85vh] overflow-hidden' : ''"
      >
        <!-- Top Header when Theatres List is Open (Above Search Bar) -->
        <div v-if="searchDrawerOpen" class="flex w-full items-center justify-between border-b border-reel/60 px-1 pb-2 pt-0.5">
          <div class="min-w-0 flex-1 pr-2">
            <h2 class="font-display text-sm sm:text-base font-bold text-paper">Theatres List</h2>
            <p class="text-[11px] text-mist truncate">
              <span v-if="search">Filtered by "<strong class="text-marquee">{{ search }}</strong>" · </span>
              Showing {{ Math.min(visibleCinemas.length, filteredCinemas.length) }} of {{ filteredCinemas.length }} screens
            </p>
          </div>
          <button
            type="button"
            class="btn-press grid h-7 w-7 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-lg border border-reel bg-bg-alt2 text-xs text-mist hover:text-paper"
            aria-label="Close list"
            @click="searchDrawerOpen = false"
          >
            ✕
          </button>
        </div>

        <div class="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <!-- Search Input (Row 1 on mobile, full width; flex-1 on desktop) -->
          <label class="relative w-full sm:min-w-[200px] sm:flex-1" @click="searchDrawerOpen = true">
            <input
              id="cinema-search"
              v-model="search"
              type="search"
              placeholder="Search cinemas…"
              class="w-full rounded-xl border border-reel bg-bg-alt2/80 py-1.5 pl-8 pr-7 text-xs text-paper placeholder:text-mist/60 focus:border-marquee focus:outline-none"
              @focus="searchDrawerOpen = true"
              @click="searchDrawerOpen = true"
            />
            <svg viewBox="0 0 24 24" class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-mist" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="11" cy="11" r="6.5" />
              <path d="M16 16l4.5 4.5" stroke-linecap="round" />
            </svg>
            <button
              v-if="search"
              type="button"
              class="btn-press absolute right-2 top-1/2 -translate-y-1/2 text-xs text-mist hover:text-paper"
              aria-label="Clear search"
              @click.stop="search = ''"
            >
              ✕
            </button>
          </label>

          <!-- Horizontal scrollable filter pills strip on mobile (Row 2), normal row on desktop -->
          <div class="scroll-slim flex w-full items-center gap-1.5 overflow-x-auto pb-0.5 sm:w-auto sm:overflow-visible sm:pb-0">
            <!-- City Switcher Pills -->
            <div class="flex shrink-0 rounded-xl border border-reel bg-bg-alt2/80 p-0.5" title="Browse predefined cities">
              <button
                v-for="c in cityOptions"
                :key="c.id"
                :class="[
                  'btn-press rounded-lg px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider transition-colors',
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
                'btn-press flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                nearMode
                  ? 'border-sage bg-sage text-ink hover:bg-curtain-bright'
                  : 'border-reel bg-bg-alt2/80 text-paper hover:border-mist/60',
              ]"
              @click="requestLocation(); onlyFavourites = false"
            >
              <span v-if="nearMode">✓</span>
              {{ locating ? 'Locating…' : nearMode ? 'Near You' : 'Near Me' }}
            </button>

            <!-- Favourites Filter / Modal Button -->
            <button
              :class="[
                'btn-press flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-colors',
                favouritesOpen
                  ? 'border-marquee bg-marquee text-ink hover:bg-curtain-bright'
                  : 'border-reel bg-bg-alt2/80 text-paper hover:border-mist/60',
              ]"
              :aria-pressed="favouritesOpen"
              title="View your favourite theatres"
              @click="openFavouritesModal()"
            >
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" :fill="favCount > 0 ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
                <path d="M12 20s-7.5-4.6-7.5-10a4.6 4.6 0 0 1 7.5-3.6A4.6 4.6 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>Favs</span>
              <span v-if="user && favCount > 0" class="text-[10px] opacity-80">({{ favCount }})</span>
            </button>

            <!-- Min Rating Dropdown -->
            <label class="flex shrink-0 items-center gap-1.5 font-mono text-xs text-mist">
              <select
                v-model.number="minRating"
                class="rounded-xl border border-reel bg-bg-alt2/80 px-2 py-1 text-xs text-paper focus:border-marquee focus:outline-none"
                aria-label="Filter by minimum rating"
              >
                <option :value="0">Any rating</option>
                <option :value="3.5">3.5+ ★</option>
                <option :value="4">4.0+ ★</option>
                <option :value="4.5">4.5+ ★</option>
              </select>
            </label>

            <!-- Theatres List / Drawer Toggle Button -->
            <button
              type="button"
              class="btn-press flex shrink-0 items-center gap-1.5 rounded-xl border border-reel bg-bg-alt2/90 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-paper hover:border-marquee hover:text-marquee"
              aria-label="View all theatres list"
              @click="searchDrawerOpen = !searchDrawerOpen"
            >
              <svg viewBox="0 0 24 24" class="h-3.5 w-3.5 text-marquee shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
                <path d="M4 6h16M4 12h16M4 18h7" stroke-linecap="round" />
              </svg>
              <span>Theatres List</span>
              <span class="text-[10px] font-bold text-marquee">({{ filteredCinemas.length }})</span>
            </button>
          </div>
        </div>

        <!-- Theatres List Content (Flows naturally directly underneath the search bar and filter pills) -->
        <div
          v-if="searchDrawerOpen"
          class="scroll-slim mt-1 flex-1 space-y-3 overflow-y-auto overscroll-contain border-t border-reel/60 pt-3 pr-1"
        >
          <div
            v-if="!filteredCinemas.length"
            class="rounded-xl border border-reel bg-bg-alt2 p-6 text-center text-xs text-mist"
          >
            No cinemas match your search.
            <button class="ml-1 font-semibold text-marquee underline" @click="search = ''; onlyFavourites = false; setCity('all')">Reset filters</button>
          </div>

          <TicketCard
            v-for="c in visibleCinemas"
            :key="c.id"
            :cinema="c"
            :active="c.id === activeCinema?.id"
            :distance-km="distanceTo(c)"
            show-city
            @select="onCardSelect(c)"
            @contribute="contributeFor(c, 'ad')"
            @rate="contributeFor(c, 'rating')"
          />

          <!-- Progressive list controls (Expand / Collapse) -->
          <div
            v-if="filteredCinemas.length > visibleCinemas.length || visibleCount > INITIAL_LIST_COUNT"
            class="flex gap-2 pt-2 pb-1 [overflow-anchor:none]"
          >
            <button
              v-if="filteredCinemas.length > visibleCinemas.length"
              type="button"
              class="btn-press flex-1 rounded-xl border border-reel bg-bg-alt2 py-2.5 text-xs font-semibold text-paper hover:border-marquee hover:text-marquee"
              @click="expandList"
            >
              Expand 10 more ▾ ({{ visibleCinemas.length }} of {{ filteredCinemas.length }})
            </button>
            <button
              v-if="visibleCount > INITIAL_LIST_COUNT"
              type="button"
              class="btn-press flex-1 rounded-xl border border-reel bg-bg py-2.5 text-xs font-medium text-mist hover:border-marquee hover:text-paper"
              @click="collapseList"
            >
              Collapse ▴
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Status Pill (Left top) -->
    <div class="pointer-events-none absolute left-3 top-20 z-20 hidden sm:block">
      <span class="rounded-md bg-bg/85 px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-widest text-marquee shadow backdrop-blur-md">
        {{ areaLabel }} · {{ filteredCinemas.length }} of {{ cinemas.length }} screens
      </span>
    </div>

    <!-- Cinema Details Action Sheet -->
    <CinemaActionSheet
      :cinema="activeCinema"
      :open="sheetOpen"
      :distance-km="activeCinema ? distanceTo(activeCinema) : null"
      @close="closeSheet"
    />

    <!-- Semi-transparent Backdrop Scrim when Theatres List is Open -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <div
          v-if="searchDrawerOpen"
          class="fixed inset-0 z-[1100] bg-bg/60 backdrop-blur-sm"
          @click="searchDrawerOpen = false"
        />
      </Transition>
    </Teleport>
  </div>
</template>
