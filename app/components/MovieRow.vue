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

function toggle() {
  open.value = !open.value
  if (open.value && !selectedShowId.value) {
    selectedShowId.value = props.movie.showtimes[0]?.id ?? null
  }
}

/** Ads typically end ≈ adDuration before the listed start (per the community model). */
const adsEnd = computed(() => {
  const st = selectedShow.value
  if (!st || st.adDurationMin == null) return null
  const end = shiftMinutes(st.startTime, -st.adDurationMin)
  return {
    lo: shiftMinutes(end, -1),
    hi: shiftMinutes(end, 1),
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
      'rounded-xl border bg-bg-alt2 transition-colors',
      selectedShow ? 'border-marquee/40' : 'border-reel/60',
    ]"
  >
    <button class="flex w-full items-center gap-3 p-3 text-left" @click="toggle">
      <span
        class="grid h-14 w-10 shrink-0 place-items-center rounded-md border border-reel text-lg"
        :style="{
          background: `linear-gradient(160deg, hsl(${movie.hue} 40% 38%), hsl(${movie.hue} 45% 16%))`,
        }"
      >
        {{ movie.emoji }}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate font-display text-lg leading-tight text-paper">{{ movie.title }}</span>
        <span class="block truncate font-mono text-[11px] uppercase tracking-wider text-mist">
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
        <div class="border-t border-reel/60 p-3">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="st in movie.showtimes"
              :key="st.id"
              :class="[
                'btn-press rounded-lg px-3 py-1.5 font-mono text-xs transition-colors',
                selectedShowId === st.id
                  ? 'bg-marquee font-semibold text-ink'
                  : 'border border-reel bg-bg text-paper hover:border-marquee',
              ]"
              @click="selectedShowId = st.id"
            >
              {{ fmt12(st.startTime) }} <span class="opacity-60">{{ st.format }}</span>
            </button>
          </div>

          <div v-if="selectedShow" class="mt-3 rounded-lg border border-reel/60 bg-bg p-3">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <template v-if="selectedShow.adDurationMin != null">
                <span class="font-display text-2xl text-marquee">
                  ~{{ Math.round(selectedShow.adDurationMin) }} min
                </span>
                <span class="font-mono text-xs text-mist">
                  of ads · {{ selectedShow.adReports }} report{{ selectedShow.adReports === 1 ? '' : 's' }}
                  <span :class="selectedShow.adReports >= 5 ? 'text-sage' : 'text-mist/60'">
                    · {{ selectedShow.adReports >= 5 ? 'good confidence' : 'few reports' }}
                  </span>
                </span>
              </template>
              <span v-else class="font-display text-2xl text-mist">no reports yet</span>
            </div>
            <p v-if="adsEnd" class="mt-2 font-mono text-xs leading-relaxed text-paper/90">
              Today · {{ fmt12(selectedShow.startTime) }} listed — ads typically end ≈ {{ fmt12(adsEnd.lo) }}–{{ fmt12(adsEnd.hi) }}.
              Movie starts on time.
            </p>
            <p v-else-if="selectedShow" class="mt-2 font-mono text-xs leading-relaxed text-mist">
              Nobody has reported this show yet — you could be the first.
            </p>
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <span v-if="activeCinema?.overall != null" class="rounded bg-marquee/15 px-2 py-1 font-mono text-[11px] text-marquee">
                ⭐ {{ activeCinema.overall.toFixed(1) }}/5 theatre
              </span>
              <span v-if="arriveBy" class="rounded bg-sage/15 px-2 py-1 font-mono text-[11px] text-sage">
                ARRIVE BY ≈ {{ fmt12(arriveBy) }}
              </span>
              <button
                class="btn-press ml-auto rounded-full bg-curtain px-4 py-1.5 font-mono text-xs font-semibold text-paper hover:bg-curtain-bright"
                @click="report()"
              >
                📢 Report this show
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
