<script setup lang="ts">
const steps = [
  {
    title: 'Pick a show',
    text: 'Find a cinema on the map or in the list, open a movie, and tap a showtime — the listed time is when the pre-show begins.',
  },
  {
    title: 'See when it actually starts',
    text: 'Moviegoers report how long the pre-show ran. We pair those reports with the listed time: a 7:00 PM show with a ~18 min pre-show starts ≈ 7:18 PM.',
  },
  {
    title: 'Report back',
    text: 'Watched it? Report the pre-show length and rate the theatre — under a minute. Everyone’s start-time estimates update live.',
  },
]
</script>

<template>
  <section id="how" class="scroll-mt-24 px-4 py-14 sm:px-6">
    <div class="mx-auto max-w-5xl">
      <h2 class="text-center font-display text-2xl text-paper sm:text-3xl">How it works</h2>
      <div class="mt-8 grid gap-4 sm:grid-cols-3">
        <div v-for="(s, i) in steps" :key="s.title" class="rounded-xl bg-bg-alt p-5">
          <span class="text-xs font-semibold text-marquee">0{{ i + 1 }}</span>
          <h3 class="mt-2 font-display text-base text-paper">{{ s.title }}</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-body">{{ s.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
