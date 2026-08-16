<script setup lang="ts">
import { computed } from 'vue'

const { activeCinema, openContribute } = useCinemaStore()

const stars = computed(() => {
  const c = activeCinema.value
  if (!c || c.overall == null) return ''
  const full = Math.round(c.overall)
  return '★'.repeat(full) + '☆'.repeat(5 - full)
})

const showsCount = computed(
  () => activeCinema.value?.movies.reduce((s, m) => s + m.showtimes.length, 0) ?? 0,
)

function rateCinema() {
  if (activeCinema.value) {
    openContribute({ cinema: activeCinema.value })
  }
}
</script>

<template>
  <section id="cinema-detail" class="scroll-mt-20 px-4 pb-16 sm:px-6">
    <div class="mx-auto max-w-5xl">
      <div
        v-if="!activeCinema"
        class="rounded-2xl border border-reel bg-bg-alt p-10 text-center font-mono text-sm text-mist"
      >
        Select a cinema on the map or from a ticket to see details.
      </div>

      <div v-else :key="activeCinema.id" class="rounded-2xl border border-reel bg-bg-alt p-5 sm:p-8">
        <!-- Theatre header -->
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="font-mono text-[11px] uppercase tracking-[0.3em] text-mist">Now at the box office</p>
            <h2 class="mt-1 font-display text-4xl leading-none tracking-wide text-paper sm:text-5xl">
              {{ activeCinema.name }}
            </h2>
            <p class="mt-2 text-sm text-mist">{{ activeCinema.address }}</p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span class="font-mono text-lg text-marquee">{{ stars || '☆☆☆☆☆' }}</span>
              <span class="font-mono text-sm text-paper">{{ activeCinema.overall != null ? `${activeCinema.overall.toFixed(1)}/5` : 'no ratings yet' }}</span>
              <span class="font-mono text-xs text-mist">{{ activeCinema.ratingCount }} community rating{{ activeCinema.ratingCount === 1 ? '' : 's' }}<span v-if="activeCinema.ratingCount > 0 && activeCinema.ratingCount < 3" class="text-mist/70"> · limited data</span></span>
            </div>
          </div>
          <button
            class="btn-press shrink-0 rounded-full border border-marquee px-5 py-2 font-mono text-xs font-semibold text-marquee hover:bg-marquee hover:text-ink"
            @click="rateCinema()"
          >
            ⭐ Rate this theatre
          </button>
        </div>

        <!-- 6-category rating grid -->
        <div class="mt-8">
          <h3 class="font-display text-xl tracking-wide text-paper">THE CROWD VERDICT</h3>
          <RatingBars
            :key="`${activeCinema.id}-bars`"
            :ratings="activeCinema.ratings"
            :overall="activeCinema.overall"
            class="mt-4"
          />
        </div>

        <!-- Audience quotes -->
        <div v-if="activeCinema.reviews.length" class="mt-8">
          <h3 class="font-display text-xl tracking-wide text-paper">FROM THE AUDIENCE</h3>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <blockquote
              v-for="r in activeCinema.reviews.slice(0, 4)"
              :key="r.text"
              class="rounded-lg border border-reel/60 bg-bg-alt2 p-4"
            >
              <p class="text-sm leading-relaxed text-paper/90">“{{ r.text }}”</p>
              <footer class="mt-2 font-mono text-[11px] text-mist">— {{ r.name }} · {{ r.date }}</footer>
            </blockquote>
          </div>
        </div>

        <!-- Now showing -->
        <div class="mt-8">
          <div class="flex items-end justify-between gap-3">
            <h3 class="font-display text-xl tracking-wide text-paper">NOW SHOWING</h3>
            <span class="font-mono text-[11px] uppercase tracking-widest text-mist">
              {{ activeCinema.movies.length }} movies · {{ showsCount }} shows
            </span>
          </div>
          <div class="mt-3 space-y-3">
            <MovieRow v-for="m in activeCinema.movies" :key="m.id" :movie="m" />
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
