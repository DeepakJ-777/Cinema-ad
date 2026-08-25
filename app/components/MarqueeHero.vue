<script setup lang="ts">
const { requestLocation } = useCinemaStore()

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
        .Community-powered.
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

      <p class="mt-6 text-[11px] font-medium uppercase tracking-widest text-mist/70">
        No login needed to browse — ever
      </p>
    </div>
  </section>
</template>
