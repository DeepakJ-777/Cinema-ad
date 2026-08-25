<script setup lang="ts">
import { computed } from 'vue'

/**
 * KPI strip (Cinemas / Pre-show reports / Ratings / Moviegoers) — moved out of
 * MarqueeHero so it sits with "How it works" as one visual area directly under
 * the map (desktop). Same data and rendering as before.
 */
const { cinemas, meta, pending } = useCinemaStore()

const fmt = (n: number) => n.toLocaleString('en-IN')
const stats = computed(() => [
  { label: 'Cinemas', value: cinemas.value.length },
  { label: 'Pre-show reports', value: meta.value.adReports },
  { label: 'Ratings', value: meta.value.ratings },
  { label: 'Moviegoers', value: meta.value.contributors ?? 0 },
])
</script>

<template>
  <section aria-label="Community stats" class="px-4 sm:px-6">
    <div class="mx-auto max-w-5xl">
      <!-- value above label, shared grid rhythm (matches HowItWorks width) -->
      <div class="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-reel bg-reel sm:grid-cols-4">
        <div v-for="s in stats" :key="s.label" class="bg-bg-alt px-4 py-5 text-center">
          <p class="font-display text-2xl text-paper">{{ pending ? '…' : fmt(s.value) }}</p>
          <p class="mt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-mist">
            {{ s.label }}
          </p>
        </div>
      </div>
    </div>
  </section>
</template>
