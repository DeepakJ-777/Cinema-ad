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

/** A showtime provider covered this cinema recently (within 36 h) — so an
 *  empty movie list means the provider confirmed there are no shows today,
 *  not that sync is missing/broken. */
const providerConfirmed = computed(() => {
  const c = activeCinema.value
  if (!c?.syncedAt) return false
  const age = Date.now() - Date.parse(c.syncedAt)
  return Number.isFinite(age) && age >= 0 && age < 36 * 3600 * 1000
})

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
            <p class="text-[11px] font-medium uppercase tracking-[0.22em] text-mist">Now showing at</p>
            <h2 class="mt-1 font-display text-2xl leading-tight text-paper sm:text-3xl">
              {{ activeCinema.name }}
            </h2>
            <p v-if="activeCinema.address" class="mt-2 text-sm text-mist">{{ activeCinema.address }}</p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span class="text-lg font-semibold text-marquee">{{ stars || '☆☆☆☆☆' }}</span>
              <span class="text-sm font-semibold text-paper">{{ activeCinema.overall != null ? `${activeCinema.overall.toFixed(1)}/5` : 'no ratings yet' }}</span>
              <span class="text-xs text-mist">{{ activeCinema.ratingCount }} community rating{{ activeCinema.ratingCount === 1 ? '' : 's' }}<span v-if="activeCinema.ratingCount > 0 && activeCinema.ratingCount < 3" class="text-mist/70"> · limited data</span></span>
            </div>
          </div>
          <button
            class="btn-press shrink-0 rounded-lg border border-reel px-5 py-2 text-xs font-semibold text-paper hover:border-marquee hover:text-marquee"
            @click="rateCinema()"
          >
            ★ Rate this theatre
          </button>
        </div>

        <!-- 6-category rating grid -->
        <div class="mt-8">
          <div class="flex items-center justify-between">
            <h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-mist">The crowd verdict</h3>
            <span v-if="!activeCinema.ratingCount" class="text-[11px] text-mist/70">No community ratings yet</span>
          </div>
          <RatingBars
            v-if="activeCinema.ratingCount > 0"
            :key="`${activeCinema.id}-bars`"
            :ratings="activeCinema.ratings"
            :overall="activeCinema.overall"
            class="mt-4"
          />
          <p v-else class="mt-3 rounded-lg bg-bg-alt2 p-4 text-xs leading-relaxed text-mist">
            No rating breakdown available yet. Tap "Rate this theatre" above to share your experience!
          </p>
        </div>


        <!-- Audience quotes -->
        <div v-if="activeCinema.reviews.length" class="mt-8">
          <h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-mist">From the audience</h3>
          <div class="mt-3 grid gap-3 sm:grid-cols-2">
            <blockquote
              v-for="r in activeCinema.reviews.slice(0, 4)"
              :key="r.text"
              class="rounded-lg bg-bg-alt2 p-4"
            >
              <p class="text-sm leading-relaxed text-body">“{{ r.text }}”</p>
              <footer class="mt-2 text-[11px] text-mist">— {{ r.name }} · {{ r.date }}</footer>
            </blockquote>
          </div>
        </div>

        <!-- Now showing -->
        <div class="mt-8">
          <div class="flex items-end justify-between gap-3">
            <h3 class="text-xs font-semibold uppercase tracking-[0.18em] text-mist">Now showing</h3>
            <span class="text-[11px] font-medium uppercase tracking-widest text-mist">
              {{ activeCinema.movies.length }} movies · {{ showsCount }} shows
            </span>
          </div>
          <p v-if="activeCinema.movies.length" class="mt-1 text-[11px] leading-relaxed text-mist/80">
            Reports are historical — moviegoers submit them during or after a show. Estimated start
            times below are predictions from those past reports, to help you arrive before the movie begins.
          </p>
          <div class="mt-3 space-y-3">
            <p
              v-if="!activeCinema.movies.length && (activeCinema as any).isSyncing"
              class="rounded-lg bg-bg-alt2 p-4 text-sm leading-relaxed text-mist"
            >
              Showtimes are being updated...
            </p>
            <p
              v-else-if="!activeCinema.movies.length && providerConfirmed"
              class="rounded-lg bg-bg-alt2 p-4 text-sm leading-relaxed text-mist"
            >
              No shows today — our showtime provider currently lists no sessions at this
              cinema. Check back tomorrow, or tap a show once it's listed to start the
              ad-tracker countdown.
            </p>
            <p
              v-else-if="!activeCinema.movies.length"
              class="rounded-lg bg-bg-alt2 p-4 text-sm leading-relaxed text-mist"
            >
              Showtimes unavailable right now — this cinema's location comes from
              OpenStreetMap and its showtimes arrive via our daily sync. Community reports
              start counting down the ads as soon as a show is listed.
            </p>
            <MovieRow v-for="m in activeCinema.movies" :key="m.id" :movie="m" />
          </div>

        </div>
      </div>
    </div>
  </section>
</template>
