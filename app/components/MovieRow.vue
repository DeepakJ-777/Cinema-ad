<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Movie } from '~/types'
import { fmt12, roundHHMMTo5, shiftMinutes } from '~/utils/time'

const props = defineProps<{ movie: Movie }>()

const { activeCinema, openContribute } = useCinemaStore()

const open = ref(false)
const selectedShowId = ref<string | null>(null)

const selectedShow = computed(
  () => props.movie.showtimes.find(s => s.id === selectedShowId.value) ?? null,
)

const formats = computed(() =>
  [...new Set(props.movie.showtimes.map(s => s.format))].join(' · '),
)

/** Report-weighted typical ad duration across THIS movie's shows (same
 *  aggregate the ticket cards use, scoped to one movie). null → no data yet,
 *  in which case the title line shows no AD text at all. */
const movieAdMinutes = computed(() => {
  const all = props.movie.showtimes.filter(st => st.adDurationMin != null && st.adReports > 0)
  if (!all.length) return null
  const totalWeight = all.reduce((s, st) => s + (st.adReports || 1), 0)
  const avg = all.reduce((s, st) => s + st.adDurationMin! * (st.adReports || 1), 0) / totalWeight
  return Math.round(avg)
})

/** Availability badge class for a showtime chip (provider data; subtle by design). */
function availClass(a?: string | null): string {
  if (!a) return ''
  if (a === 'sold_out') return 'bg-mist/15 text-mist line-through decoration-mist/60'
  if (a === 'filling_fast' || a === 'almost_full') return 'bg-amber-400/15 text-amber-300'
  return ''
}

/** Provider availability status → short badge label. */
function availLabel(a: string): string {
  if (a === 'sold_out') return 'Sold out'
  if (a === 'filling_fast') return 'Filling fast'
  if (a === 'almost_full') return 'Almost full'
  return a.replace(/_/g, ' ')
}

function toggle() {
  open.value = !open.value
  if (open.value && !selectedShowId.value) {
    selectedShowId.value = props.movie.showtimes[0]?.id ?? null
  }
}

/**
 * PREDICTION vs HISTORY — reports are historical (submitted during/after a
 * show); the estimate below is forward-looking and its honesty scales with
 * how many past reports exist:
 *   1–2 reports → Low: coarse duration only, relative phrasing, NO clock time
 *                (a single report must never look like a precise prediction)
 *   3–5 reports → Medium: expected start rounded to the nearest 5 minutes
 *   6+ reports → High: expected start to the minute
 */
const CONF = {
  low: { label: 'Low confidence', chip: 'bg-amber-400/15 text-amber-300' },
  medium: { label: 'Medium confidence', chip: 'bg-mist/15 text-mist' },
  high: { label: 'High confidence', chip: 'bg-marquee/15 text-marquee' },
} as const
type Tier = keyof typeof CONF

const roundTo5 = (v: number) => Math.round(v / 5) * 5

const estimate = computed(() => {
  const st = selectedShow.value
  if (!st || st.adDurationMin == null || st.adReports < 1) return null
  const tier: Tier = st.adReports >= 6 ? 'high' : st.adReports >= 3 ? 'medium' : 'low'
  const med = Math.round(st.adDurationMin)
  if (tier === 'low') {
    return { tier, reports: st.adReports, adsLabel: `~${roundTo5(med)} min`, startAt: null as string | null }
  }
  const startRaw = shiftMinutes(st.startTime, med)
  return { tier, reports: st.adReports, adsLabel: `~${med} min`, startAt: tier === 'medium' ? roundHHMMTo5(startRaw) : startRaw }
})

const arriveBy = computed(() =>
  selectedShow.value ? shiftMinutes(selectedShow.value.startTime, -5) : null,
)

function report() {
  if (!activeCinema.value) return
  openContribute({
    cinema: activeCinema.value,
    movie: props.movie,
    showtime: selectedShow.value ?? undefined,
  })
}
</script>

<template>
  <div
    :class="[
      'rounded-xl bg-bg-alt2 transition-colors',
      selectedShow ? 'ring-1 ring-marquee/40' : '',
    ]"
  >
    <div class="flex w-full items-center gap-2 p-3">
      <button class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="toggle">
        <span
          class="grid h-14 w-10 shrink-0 place-items-center rounded-md text-lg"
          :style="{
            background: `linear-gradient(160deg, hsl(${movie.hue} 16% 26%), hsl(${movie.hue} 18% 14%))`,
          }"
        >
          {{ movie.emoji }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-baseline gap-1.5">
            <span class="truncate font-display text-[15px] leading-tight text-paper">{{ movie.title }}</span>
            <span
              v-if="movieAdMinutes != null"
              class="shrink-0 whitespace-nowrap text-[11px] font-medium text-mist"
            >
              • AD ~{{ movieAdMinutes }} min
            </span>
          </span>
          <span class="mt-0.5 block truncate text-[11px] font-medium uppercase tracking-wider text-mist">
            {{ movie.language }} · {{ Math.floor(movie.durationMin / 60) }}h {{ movie.durationMin % 60 }}m · {{ formats }}
          </span>
        </span>
      </button>

      <!-- Row-level contribute — opens the existing contribute flow for this movie -->
      <button
        class="btn-press shrink-0 whitespace-nowrap rounded-lg border border-reel px-2.5 py-1.5 text-xs font-medium text-paper hover:border-marquee hover:text-marquee"
        @click="report()"
      >
        Contribute AD data
      </button>

      <button
        :class="['btn-press shrink-0 text-mist transition-transform duration-200', open && 'rotate-180']"
        aria-label="Toggle showtimes"
        @click="toggle"
      >
        ▾
      </button>
    </div>

    <div
      class="grid transition-all duration-300 ease-out"
      :class="open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'"
    >
      <div class="overflow-hidden">
        <div class="border-t border-reel/70 p-3">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="st in movie.showtimes"
              :key="st.id"
              :class="[
                'btn-press rounded-lg px-3 py-1.5 text-xs transition-colors',
                selectedShowId === st.id
                  ? 'bg-marquee font-semibold text-ink'
                  : 'border border-reel bg-bg text-paper hover:border-mist/60',
              ]"
              @click="selectedShowId = st.id"
            >
              {{ fmt12(st.startTime) }} <span class="opacity-60">{{ st.format }}</span>
              <span
                v-if="st.availability && st.availability !== 'available'"
                :class="['ml-1 rounded px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide', availClass(st.availability)]"
              >
                {{ availLabel(st.availability) }}
              </span>
            </button>
          </div>

          <div v-if="selectedShow" class="mt-3 rounded-lg bg-bg p-3">
            <template v-if="estimate">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span class="font-display text-2xl text-marquee">{{ estimate.adsLabel }}</span>
                <span class="text-xs text-mist">
                  of ads reported · {{ estimate.reports }} past report{{ estimate.reports === 1 ? '' : 's' }}
                </span>
                <span
                  :class="['rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', CONF[estimate.tier].chip]"
                >
                  {{ CONF[estimate.tier].label }}
                </span>
              </div>
              <p class="mt-2 text-xs leading-relaxed text-body">
                <template v-if="estimate.startAt">
                  🎬 Movie likely starts around {{ fmt12(estimate.startAt) }}{{ estimate.tier === 'medium' ? ' (±5 min)' : '' }} —
                  arrive by the listed time ({{ fmt12(selectedShow.startTime) }}) to catch the pre-show from the start.
                </template>
                <template v-else>
                  🎬 With so few reports, expect the movie to start roughly {{ estimate.adsLabel }} after
                  the listed time ({{ fmt12(selectedShow.startTime) }}) — too few reports for a precise start, so
                  plan to be seated by the listed time.
                </template>
              </p>
            </template>
            <template v-else>
              <span class="font-display text-xl text-mist">no reports yet</span>
              <p class="mt-2 text-xs leading-relaxed text-mist">
                Nobody has reported this show yet — reports come in during/after the show, so an
                estimate appears once moviegoers add theirs. You could be the first.
              </p>
            </template>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span v-if="activeCinema?.overall != null" class="rounded-md bg-marquee/15 px-2 py-1 text-[11px] font-medium text-marquee">
                ★ {{ activeCinema.overall.toFixed(1) }}/5 theatre
              </span>
              <span v-if="arriveBy" class="rounded-md bg-bg-alt2 px-2 py-1 text-[11px] font-medium text-body">
                Arrive by ≈ {{ fmt12(arriveBy) }}
              </span>
              <button
                class="btn-press ml-auto rounded-lg bg-curtain px-4 py-1.5 text-xs font-semibold text-ink hover:bg-curtain-bright"
                @click="report()"
              >
                Contribute AD data
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
