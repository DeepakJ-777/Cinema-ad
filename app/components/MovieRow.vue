<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Movie } from '~/types'
import { fmt12, shiftMinutes } from '~/utils/time'

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

/** Estimated actual start = listed time + typical pre-show (community model). */
const estStart = computed(() => {
  const st = selectedShow.value
  if (!st || st.adDurationMin == null) return null
  const base = Math.round(st.adDurationMin)
  return {
    lo: shiftMinutes(st.startTime, base - 1),
    hi: shiftMinutes(st.startTime, base + 1),
  }
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
    <button class="flex w-full items-center gap-3 p-3 text-left" @click="toggle">
      <span
        class="grid h-14 w-10 shrink-0 place-items-center rounded-md text-lg"
        :style="{
          background: `linear-gradient(160deg, hsl(${movie.hue} 16% 26%), hsl(${movie.hue} 18% 14%))`,
        }"
      >
        {{ movie.emoji }}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-display text-[15px] leading-tight text-paper">{{ movie.title }}</span>
        <span class="mt-0.5 block truncate text-[11px] font-medium uppercase tracking-wider text-mist">
          {{ movie.language }} · {{ Math.floor(movie.durationMin / 60) }}h {{ movie.durationMin % 60 }}m · {{ formats }}
        </span>
      </span>
      <span :class="['shrink-0 text-mist transition-transform duration-200', open && 'rotate-180']">▾</span>
    </button>

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
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <template v-if="selectedShow.adDurationMin != null">
                <span class="font-display text-2xl text-marquee">
                  ~{{ Math.round(selectedShow.adDurationMin) }} min
                </span>
                <span class="text-xs text-mist">
                  pre-show · {{ selectedShow.adReports }} report{{ selectedShow.adReports === 1 ? '' : 's' }}
                  <span :class="selectedShow.adReports >= 5 ? 'text-marquee' : 'text-mist/60'">
                    · {{ selectedShow.adReports >= 5 ? 'good confidence' : 'few reports' }}
                  </span>
                </span>
              </template>
              <span v-else class="font-display text-xl text-mist">no reports yet</span>
            </div>
            <p v-if="estStart" class="mt-2 text-xs leading-relaxed text-body">
              Today · {{ fmt12(selectedShow.startTime) }} listed · 🎬 Estimated movie start ≈ {{ fmt12(estStart.lo) }}–{{ fmt12(estStart.hi) }}
            </p>
            <p v-else-if="selectedShow" class="mt-2 text-xs leading-relaxed text-mist">
              Nobody has reported this show yet — you could be the first.
            </p>
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
                Report this show
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
