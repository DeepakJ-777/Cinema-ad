<script setup lang="ts">
const steps = [
  {
    title: 'Pick a show',
    text: 'Find a cinema on the map or flip through the ticket stubs, then open a movie and tap a showtime.',
  },
  {
    title: 'Check the crowd’s ad timing',
    text: 'Every show shows a community-reported ad duration — like “~18 min, 14 reports” — with an arrive-by hint.',
  },
  {
    title: 'Report back',
    text: 'Watched it? Add your ad duration and ratings in under a minute. The aggregates update for everyone, live.',
  },
]
</script>

<template>
  <section id="how" class="scroll-mt-24 px-4 py-14 sm:px-6">
    <div class="mx-auto max-w-5xl">
      <h2 class="text-center font-display text-3xl tracking-wide text-paper sm:text-4xl">HOW IT WORKS</h2>
      <div class="mt-8 grid gap-4 sm:grid-cols-3">
        <div v-for="(s, i) in steps" :key="s.title" class="rounded-xl border border-reel bg-bg-alt p-5">
          <span class="font-mono text-xs text-marquee">0{{ i + 1 }}</span>
          <h3 class="mt-2 font-display text-xl text-paper">{{ s.title }}</h3>
          <p class="mt-1.5 text-sm leading-relaxed text-mist">{{ s.text }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
