<script setup lang="ts">
import { computed } from 'vue'

const { cinemas, meta, pending } = useCinemaStore()

const fmt = (n: number) => n.toLocaleString('en-IN')
const cinemaCount = computed(() => cinemas.value.length)
const totalReports = computed(() => meta.value.adReports)
const totalRatings = computed(() => meta.value.ratings)
const bulbs = Array.from({ length: 22 }, (_, i) => i)

function scrollToDiscover() {
  if (import.meta.client) {
    document.getElementById('discover')?.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>

<template>
  <section id="top" class="relative px-4 pt-16 pb-14 sm:px-6 sm:pt-24">
    <div class="mx-auto max-w-3xl">
      <div class="marquee-frame rounded-2xl border-2 border-marquee/50 bg-bg-alt/60 px-6 py-10 text-center sm:px-12 sm:py-14">
        <div class="bulb-row" aria-hidden="true">
          <span v-for="i in bulbs" :key="i" class="bulb" :style="{ '--i': i - 1 }" />
        </div>

        <p class="mt-6 font-mono text-[11px] uppercase tracking-[0.35em] text-mist">Community-powered cinema</p>
        <h1 class="mt-4 font-display text-[clamp(3rem,9vw,5.5rem)] leading-[0.95] tracking-wide text-paper">
          KNOW THE ADS<br />
          <span class="text-marquee">BEFORE</span> YOU GO
        </h1>
        <p class="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-mist sm:text-base">
          Crowd-sourced ad durations and honest audience ratings for every screen in Kochi &amp; Bengaluru —
          so you know exactly when to walk in, and which theatre deserves your evening.
        </p>

        <div class="mt-7 flex flex-wrap items-center justify-center gap-3">
          <button
            class="btn-press rounded-full bg-marquee px-6 py-2.5 text-sm font-bold text-ink hover:bg-paper"
            @click="scrollToDiscover"
          >
            Browse cinemas
          </button>
          <a
            href="#how"
            class="btn-press rounded-full border border-reel px-6 py-2.5 text-sm font-semibold text-paper hover:border-marquee"
          >
            How it works
          </a>
        </div>

        <div class="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-xs text-mist">
          <span><b class="text-marquee">{{ pending ? '…' : fmt(cinemaCount) }}</b> cinemas</span>
          <span><b class="text-marquee">{{ pending ? '…' : fmt(totalReports) }}</b> ad reports</span>
          <span><b class="text-marquee">{{ pending ? '…' : fmt(totalRatings) }}</b> ratings</span>
        </div>

        <div class="bulb-row mt-8" aria-hidden="true">
          <span v-for="i in bulbs" :key="i" class="bulb" :style="{ '--i': i }" />
        </div>
      </div>
      <p class="mt-5 text-center font-mono text-[11px] uppercase tracking-widest text-mist/70">
        No login needed to browse — ever.
      </p>
    </div>
  </section>
</template>
