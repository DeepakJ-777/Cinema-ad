<script setup lang="ts">
import { computed } from 'vue'
import type { Cinema } from '~/types'

const props = defineProps<{
  cinema: Cinema
  active?: boolean
  distanceKm?: number | null
  showCity?: boolean
}>()

const emit = defineEmits<{ select: [], contribute: [], rate: [] }>()

const { isFavourite, toggle } = useFavourites()
const favourite = computed(() => isFavourite(props.cinema.id))

const showCount = computed(() => props.cinema.movies.reduce((s, m) => s + m.showtimes.length, 0))

/** Report-weighted typical ad duration across this cinema's shows. */
const typicalAds = computed(() => {
  const all = props.cinema.movies
    .flatMap(m => m.showtimes)
    .filter(st => st.adDurationMin != null && st.adReports > 0)
  if (!all.length) return null
  const totalWeight = all.reduce((s, st) => s + (st.adReports || 1), 0)
  const avg = all.reduce((s, st) => s + st.adDurationMin! * (st.adReports || 1), 0) / totalWeight
  return Math.round(avg)
})

const cityLabel = computed(() =>
  props.cinema.city.charAt(0).toUpperCase() + props.cinema.city.slice(1),
)

const distanceLabel = computed(() => {
  if (props.distanceKm == null) return null
  return props.distanceKm < 1
    ? `${Math.round(props.distanceKm * 1000)} m`
    : `${props.distanceKm.toFixed(1)} km`
})
</script>

<template>
  <article :class="['ticket cursor-pointer select-none', { active }]" @click="emit('select')">
    <div class="ticket-main">
      <div class="flex items-start justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1">
          <h3 class="font-display text-[15px] leading-tight text-paper">{{ cinema.name }}</h3>
          <button
            type="button"
            class="btn-press grid h-7 w-7 shrink-0 place-items-center rounded-md transition-colors hover:bg-bg"
            :class="favourite ? 'text-marquee hover:text-marquee' : 'text-mist hover:text-marquee'"
            :aria-pressed="favourite"
            :aria-label="favourite ? `Remove ${cinema.name} from favourites` : `Add ${cinema.name} to favourites`"
            @click.stop="toggle(cinema)"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" :fill="favourite ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M12 20s-7.5-4.6-7.5-10a4.6 4.6 0 0 1 7.5-3.6A4.6 4.6 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
        <span class="shrink-0 text-sm font-semibold text-paper">
          <span class="text-marquee">★</span>
          {{ cinema.overall != null ? cinema.overall.toFixed(1) : '—' }}
          <span class="font-normal text-mist">({{ cinema.ratingCount }})</span>
        </span>
      </div>
      <p v-if="cinema.address" class="mt-1 truncate text-xs text-mist">{{ cinema.address }}</p>
      <p class="mt-2 text-[11px] font-medium uppercase tracking-wider text-mist/80">
        {{ cinema.movies.length }} movies · {{ showCount }} shows today
      </p>
    </div>
    <div class="ticket-stub">
      <span class="ticket-notch top" />
      <span class="ticket-notch bottom" />
      <span
        v-if="showCity && cinema.city"
        class="rounded-full border border-marquee/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-marquee"
      >
        {{ cityLabel }}
      </span>
      <span
        v-if="typicalAds"
        class="rounded-full bg-marquee px-2.5 py-1 text-[11px] font-semibold text-ink"
      >
        ~{{ typicalAds }} min pre-show
      </span>
      <span
        v-else
        class="rounded-full border border-reel px-2.5 py-1 text-[11px] text-mist"
      >
        no reports yet
      </span>
      <span v-if="distanceLabel" class="text-[11px] text-mist">{{ distanceLabel }}</span>
      <span
        class="mt-auto text-[11px] font-semibold uppercase tracking-wider text-marquee underline decoration-marquee decoration-2 underline-offset-4"
      >
        View
      </span>
    </div>

    <!-- Row-level quick actions: far-right column on md+ (stacked under each
         other, bottom-aligned with VIEW); full-width row below the card on
         mobile so nothing overlaps or squeezes the content. -->
    <div
      class="col-span-full mt-1 flex gap-1.5 px-3.5 pb-3 md:col-span-1 md:mt-0 md:flex-col md:justify-end md:gap-1.5 md:px-1 md:py-3"
    >
      <button
        class="btn-press flex-1 whitespace-nowrap rounded-lg border border-reel bg-bg px-3 py-1.5 text-center text-[11px] font-medium text-paper hover:border-marquee hover:text-marquee md:flex-none"
        @click.stop="emit('contribute')"
      >
        Contribute AD data
      </button>
      <button
        class="btn-press flex-1 whitespace-nowrap rounded-lg border border-reel bg-bg px-3 py-1.5 text-center text-[11px] font-medium text-paper hover:border-marquee hover:text-marquee md:flex-none"
        @click.stop="emit('rate')"
      >
        Add rating
      </button>
    </div>
  </article>
</template>
