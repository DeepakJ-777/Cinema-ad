<script setup lang="ts">
import { computed } from 'vue'

const { cinemas, meta, pending, requestLocation } = useCinemaStore()

const fmt = (n: number) => n.toLocaleString('en-IN')
const stats = computed(() => [
  { label: 'Cinemas', value: cinemas.value.length },
  { label: 'Pre-show reports', value: meta.value.adReports },
  { label: 'Ratings', value: meta.value.ratings },
  { label: 'Moviegoers', value: meta.value.contributors ?? 0 },
])

/** Primary CTA: jump to Discover and ask for location — the label promises "near you". */
function findCinema() {
  if (!import.meta.client) return
  document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' })
  requestLocation()
}
</script>

<template>
  <section id="top" class="px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
    <div class="mx-auto max-w-3xl text-center">
      <p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-marquee">
        Community-powered cinema intelligence
      </p>
      <h1 class="mt-5 font-display text-[clamp(2.4rem,6.5vw,4.25rem)] leading-[1.05] text-paper">
        Skip the Ads.<br>
        <span class="text-marquee">Catch the Movie.</span>
      </h1>
      <p class="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-body sm:text-base">
        The live crowdsourced tracker that reveals when the film actually begins — so you never waste 20 minutes sitting through commercials again.
      </p>

      <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          class="btn-press rounded-lg bg-marquee px-6 py-2.5 text-sm font-semibold text-ink hover:bg-curtain-bright"
          @click="findCinema"
        >
          Find Theatres Near You
        </button>

        <a
          href="#how"
          class="btn-press rounded-lg border border-reel px-6 py-2.5 text-sm font-medium text-paper hover:border-mist/60"
        >
          How it works
        </a>
      </div>

      <!-- The product in one card: listed show + pre-show mechanism → estimated start -->
      <div class="mx-auto mt-10 max-w-xs rounded-xl border border-reel bg-bg-alt p-5 text-left">
        <p class="text-[11px] font-medium uppercase tracking-[0.18em] text-mist">7:00 PM show</p>
        <div class="mt-3 space-y-1.5 text-sm text-body">
          <p>Typical pre-show: <span class="font-semibold text-paper">~18 min</span></p>
          <p>🎬 Estimated movie start: <span class="font-semibold text-marquee">7:18 PM</span></p>
        </div>
        <p class="mt-4 border-t border-reel pt-3 text-[11px] leading-relaxed text-mist/70">
          Estimated from community reports — not guaranteed.
        </p>
      </div>

      <!-- KPI strip: value above label, shared grid rhythm -->
      <div class="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-reel bg-reel sm:grid-cols-4">
        <div v-for="s in stats" :key="s.label" class="bg-bg-alt px-4 py-5 text-center">
          <p class="font-display text-2xl text-paper">{{ pending ? '…' : fmt(s.value) }}</p>
          <p class="mt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-mist">
            {{ s.label }}
          </p>
        </div>
      </div>

      <p class="mt-5 text-[11px] font-medium uppercase tracking-widest text-mist/70">
        No login needed to browse — ever
      </p>
    </div>
  </section>
</template>
