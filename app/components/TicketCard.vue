<script setup lang="ts">
import { computed } from 'vue'
import type { Cinema } from '~/types'

const props = defineProps<{
  cinema: Cinema
  active?: boolean
  distanceKm?: number | null
  showCity?: boolean
}>()

const emit = defineEmits<{ select: [] }>()

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
        <h3 class="font-display text-[15px] leading-tight text-paper">{{ cinema.name }}</h3>
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
  </article>
</template>
