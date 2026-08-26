<template>
  <main class="flex flex-col">
    <MarqueeHero />
    <FilmStrip />
    <HowItWorks />
    <CinemaStats class="my-6" />
    
    <!-- Prominent CTA Section linking to /map -->
    <section class="px-4 py-12 sm:px-6">
      <div class="mx-auto max-w-4xl rounded-2xl border border-reel bg-bg-alt p-8 text-center sm:p-12">
        <span class="text-[11px] font-semibold uppercase tracking-[0.22em] text-marquee">
          Live & Crowdsourced
        </span>
        <h2 class="mt-3 font-display text-2xl text-paper sm:text-3xl">
          Find Theatres & Check Real Start Times
        </h2>
        <p class="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-body sm:text-base">
          Browse theatres across Kochi, Bengaluru, and nearby areas on our interactive live map. Check ad durations and showtimes without any fluff.
        </p>
        <div class="mt-8 flex justify-center">
          <NuxtLink
            to="/map"
            class="btn-press inline-flex items-center gap-2.5 rounded-xl bg-marquee px-8 py-3.5 text-base font-bold text-ink shadow-lg transition-transform hover:scale-[1.02] hover:bg-curtain-bright"
          >
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M12 21.5s-6.5-5.6-6.5-10.5a6.5 6.5 0 1 1 13 0c0 4.9-6.5 10.5-6.5 10.5z" stroke-linecap="round" stroke-linejoin="round" />
              <circle cx="12" cy="10.5" r="2.3" />
            </svg>
            <span>Explore Live Map</span>
          </NuxtLink>
        </div>
      </div>
    </section>

    <FilmStrip />
    <SiteFooter />
  </main>
</template>
