<script setup lang="ts">
import { computed } from 'vue'
import { CITIES } from '~/utils/cities'

const {
  cinemas,
  city,
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
} = useCinemaStore()

const areaLabel = computed(() => {
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
</script>

<template>
  <section id="discover" class="scroll-mt-20 px-4 py-14 sm:px-6">
    <div class="mx-auto max-w-7xl">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-[11px] font-medium uppercase tracking-[0.22em] text-mist">
            {{ areaLabel }}
          </p>
          <h2 class="mt-1 font-display text-2xl text-paper sm:text-3xl">Discover</h2>
        </div>
        <div class="flex items-center gap-3">
          <button
            :class="[
              'btn-press rounded-lg border px-4 py-2 text-xs font-semibold transition-colors',
              nearMode
                ? 'border-sage bg-sage text-ink hover:bg-curtain-bright'
                : 'border-reel text-paper hover:border-mist/60',
            ]"
            @click="requestLocation()"
          >
            {{ locating ? 'Locating…' : nearMode ? '✓ Showing nearby' : 'Near me' }}
          </button>
          <span v-if="nearPhaseLabel" class="animate-pulse text-[11px] font-medium text-marquee">
            {{ nearPhaseLabel }}
          </span>
          <span class="text-xs text-mist">{{ filteredCinemas.length }} cinemas</span>
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
        </div>
      </div>

      <div class="mt-6 grid gap-5 lg:grid-cols-[55fr_45fr]">
        <!-- Map panel — always renders every cinema, no matter the filters or zoom -->
        <div class="relative h-[420px] overflow-hidden rounded-2xl bg-bg-alt lg:h-[620px]">
          <ClientOnly>
            <CinemaMap
              :cinemas="cinemas"
              :selected-id="activeCinema?.id ?? null"
              :fit-points="fitPoints"
              :user-location="userLocation"
              @select="id => selectCinema(id)"
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
        <div class="flex flex-col rounded-2xl border border-reel bg-bg-alt lg:h-[620px]">
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
            <p v-if="!filteredCinemas.length" class="rounded-xl border border-reel bg-bg-alt2 p-6 text-center text-sm text-mist">
              No cinemas match “{{ search }}”.
              <button class="ml-1 font-semibold text-marquee underline" @click="search = ''">Clear</button>
            </p>
            <TicketCard
              v-for="c in filteredCinemas"
              :key="c.id"
              :cinema="c"
              :active="c.id === activeCinema?.id"
              :distance-km="distanceTo(c)"
              show-city
              @select="selectCinema(c.id, { scroll: true })"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
