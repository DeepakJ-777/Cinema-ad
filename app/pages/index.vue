<template>
  <!-- max-lg: flex ordering puts the map (DiscoverSection) first on mobile so the
       app opens straight into the map. Desktop (lg+): hero → map → community
       stats + how it works (one visual area directly under the map) → detail. -->
  <main class="max-lg:flex max-lg:flex-col">
    <MarqueeHero />
    <FilmStrip />
    <DiscoverSection class="max-lg:order-first" />
    <!-- Community stats + how it works — one visual area immediately under the map -->
    <CinemaStats />
    <HowItWorks />
    <FilmStrip />
    <CinemaDetail />
    <FilmStrip />
    <SiteFooter />
  </main>
</template>
