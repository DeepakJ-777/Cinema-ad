<script setup lang="ts">
import { computed } from 'vue'
import type { Cinema } from '~/types'

const props = defineProps<{
  cinema: Cinema
  active?: boolean
  distanceKm?: number | null
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
        <h3 class="font-display text-xl leading-tight text-ink">{{ cinema.name }}</h3>
        <span class="shrink-0 font-mono text-sm font-semibold text-ink">
          <span class="text-curtain-bright">★</span>
          {{ cinema.overall != null ? cinema.overall.toFixed(1) : '—' }}
          <span class="text-ink/50">({{ cinema.ratingCount }})</span>
        </span>
      </div>
      <p class="mt-1 truncate text-xs text-ink/70">{{ cinema.address }}</p>
      <p class="mt-2 font-mono text-[11px] uppercase tracking-wider text-ink/60">
        🎬 {{ cinema.movies.length }} movies · {{ showCount }} shows today
      </p>
    </div>
    <div class="ticket-stub">
      <span class="ticket-notch top" />
      <span class="ticket-notch bottom" />
      <span
        v-if="typicalAds"
        class="rounded-md bg-curtain px-2 py-1 font-mono text-[11px] font-semibold text-paper"
      >
        ~{{ typicalAds }} min ads
      </span>
      <span
        v-else
        class="rounded-md bg-ink/10 px-2 py-1 font-mono text-[11px] text-ink/50"
      >
        no ad data
      </span>
      <span v-if="distanceLabel" class="font-mono text-[11px] text-ink/70">📍 {{ distanceLabel }}</span>
      <span
        class="mt-auto font-mono text-[11px] font-semibold uppercase tracking-wider text-ink underline decoration-curtain decoration-2 underline-offset-4"
      >
        View
      </span>
    </div>
  </article>
</template>
