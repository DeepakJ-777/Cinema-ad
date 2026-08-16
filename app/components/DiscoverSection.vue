<script setup lang="ts">
const {
  city,
  cities,
  search,
  filteredCinemas,
  activeCinema,
  userLocation,
  sortByDistance,
  locating,
  selectCinema,
  requestLocation,
  distanceTo,
} = useCinemaStore()
</script>

<template>
  <section id="discover" class="scroll-mt-20 px-4 py-14 sm:px-6">
    <div class="mx-auto max-w-7xl">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="font-mono text-[11px] uppercase tracking-[0.3em] text-mist">
            Step in · {{ cities[city].name }}
          </p>
          <h2 class="mt-1 font-display text-4xl tracking-wide text-paper sm:text-5xl">DISCOVER</h2>
        </div>
        <div class="flex items-center gap-3">
          <button
            :class="[
              'btn-press rounded-full border px-4 py-2 font-mono text-xs font-semibold transition-colors',
              sortByDistance
                ? 'border-sage bg-sage/15 text-sage'
                : 'border-marquee/60 text-marquee hover:bg-marquee/10',
            ]"
            @click="requestLocation()"
          >
            {{ locating ? 'Locating…' : sortByDistance ? '✓ Nearest first' : '📡 Near me' }}
          </button>
          <span class="font-mono text-xs text-mist">{{ filteredCinemas.length }} cinemas</span>
        </div>
      </div>

      <div class="mt-6 grid gap-5 lg:grid-cols-[55fr_45fr]">
        <!-- Map panel -->
        <div class="relative h-[420px] overflow-hidden rounded-2xl border border-reel bg-bg-alt lg:h-[620px]">
          <ClientOnly>
            <CinemaMap
              :cinemas="filteredCinemas"
              :selected-id="activeCinema?.id ?? null"
              :center="cities[city].center"
              :zoom="12"
              :user-location="userLocation"
              @select="id => selectCinema(id)"
            />
            <template #fallback>
              <div class="grid h-full place-items-center font-mono text-xs text-mist">Map loading…</div>
            </template>
          </ClientOnly>
          <span
            class="pointer-events-none absolute left-3 top-3 rounded-full bg-bg/85 px-3 py-1 font-mono text-[11px] uppercase tracking-widest text-marquee"
          >
            {{ cities[city].name }} · {{ filteredCinemas.length }} screens
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
                class="w-full rounded-full border border-reel bg-bg py-1.5 pl-8 pr-3 text-sm text-paper placeholder:text-mist/60 focus:border-marquee focus:outline-none"
              />
              <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-70">🔍</span>
            </label>
            <span class="hidden font-display text-xl tracking-wide text-paper md:block">
              FLIP THROUGH THE STUBS
            </span>
            <span class="ml-auto hidden shrink-0 font-mono text-[11px] uppercase tracking-widest text-mist md:block">
              tap a ticket
            </span>
          </div>
          <div class="scroll-slim flex-1 space-y-4 overflow-y-auto p-4">
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
              @select="selectCinema(c.id, { scroll: true })"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
