<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { fmt12 } from '~/utils/time'

const { showContribute, contributeTarget, closeContribute, submitContribution } = useCinemaStore()
const { user } = useAuth()

const bands = [
  { label: '0–5', mid: 3 },
  { label: '5–10', mid: 7 },
  { label: '10–15', mid: 12 },
  { label: '15–20', mid: 17 },
  { label: '20–25', mid: 22 },
  { label: '25+', mid: 28 },
]

const band = ref<number | null>(null)
const busy = ref(false)
const ratings = reactive({
  overall: 0,
  ambience: 0,
  staff: 0,
  movieExperience: 0,
  foodBeverages: 0,
  valueForMoney: 0,
})
const review = ref('')

watch(showContribute, (open) => {
  if (open) {
    band.value = null
    Object.assign(ratings, {
      overall: 0,
      ambience: 0,
      staff: 0,
      movieExperience: 0,
      foodBeverages: 0,
      valueForMoney: 0,
    })
    review.value = ''
  }
  if (import.meta.client) {
    document.body.style.overflow = open ? 'hidden' : ''
  }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && showContribute.value) closeContribute()
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})

function close() {
  closeContribute()
}

const canSubmit = computed(() => {
  if (contributeTarget.value?.showtime && band.value != null) return true
  if (Object.values(ratings).some(v => v > 0)) return true
  return review.value.trim().length > 3
})

async function submit() {
  if (!canSubmit.value || busy.value) return
  const t = contributeTarget.value
  if (!t) return
  busy.value = true
  const ok = await submitContribution({
    cinemaId: t.cinema.id,
    movieId: t.movie?.id,
    showId: t.showtime?.id,
    minutes: band.value ?? undefined,
    ...ratings,
    review: review.value.trim(),
  })
  busy.value = false
  if (ok) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="showContribute && contributeTarget"
        class="fixed inset-0 z-[9999] grid place-items-center overflow-y-auto p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Contribute ad duration and ratings"
      >

        <div class="absolute inset-0 bg-bg/80 backdrop-blur-sm" @click="close" />

        <div class="modal-card relative w-full max-w-lg rounded-xl border border-reel bg-bg-alt p-6 text-paper shadow-2xl sm:p-8">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="font-display text-xl">Contribute</h2>
              <p class="mt-1 text-[11px] font-medium uppercase tracking-wider text-mist">
                {{ contributeTarget.cinema.name }}
                <template v-if="contributeTarget.movie"> · {{ contributeTarget.movie.title }}</template>
                <template v-if="contributeTarget.showtime"> · {{ fmt12(contributeTarget.showtime.startTime) }}</template>
              </p>
            </div>
            <button
              class="btn-press text-xl leading-none text-mist hover:text-paper"
              aria-label="Close"
              @click="close"
            >
              ✕
            </button>
          </div>

          <!-- Login gate: contribution (not browsing) is the only thing requiring auth -->
          <div v-if="!user" class="mt-8">
            <div class="text-center">
              <span class="mx-auto grid h-14 w-14 place-items-center rounded-full bg-bg-alt2 text-2xl">🔒</span>
              <h3 class="mt-4 font-display text-lg">Sign in to contribute</h3>
              <p class="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-mist">
                Browsing is free forever. Contributing ad timings and ratings is tied to an account —
                it keeps the crowd data honest.
              </p>
            </div>
            <div class="mt-6 rounded-xl border border-reel bg-bg-alt2 p-4">
              <AuthForms @success="() => {}" />
            </div>
          </div>

          <form v-else class="mt-6 space-y-6" @submit.prevent="submit">
            <fieldset v-if="contributeTarget.showtime">
              <legend class="text-[11px] font-semibold uppercase tracking-widest text-marquee">
                How long was the pre-show?
              </legend>
              <div class="mt-2 flex flex-wrap gap-2">
                <button
                  v-for="b in bands"
                  :key="b.label"
                  type="button"
                  :class="[
                    'btn-press rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
                    band === b.mid
                      ? 'bg-marquee text-ink'
                      : 'border border-reel text-mist hover:border-marquee hover:text-paper',
                  ]"
                  @click="band = b.mid"
                >
                  {{ b.label }} min
                </button>
              </div>
            </fieldset>

            <fieldset>
              <legend class="text-[11px] font-semibold uppercase tracking-widest text-marquee">
                Rate the experience
              </legend>
              <div class="mt-3 space-y-2.5">
                <StarPicker v-model="ratings.overall" label="Overall" icon="⭐" />
                <StarPicker v-model="ratings.ambience" label="Ambience" icon="🏛️" />
                <StarPicker v-model="ratings.staff" label="Staff" icon="👔" />
                <StarPicker v-model="ratings.movieExperience" label="Movie experience" icon="🎬" />
                <StarPicker v-model="ratings.foodBeverages" label="Food & beverages" icon="🍿" />
                <StarPicker v-model="ratings.valueForMoney" label="Value for money" icon="💰" />
              </div>
            </fieldset>

            <label class="block">
              <span class="text-[11px] font-semibold uppercase tracking-widest text-marquee">
                Optional review
              </span>
              <textarea
                v-model="review"
                rows="3"
                placeholder="Screens, sound, crowd, parking — what should others know?"
                class="mt-2 w-full rounded-lg border border-reel bg-bg-alt2 p-3 text-sm text-paper placeholder:text-mist/50 focus:border-marquee focus:outline-none"
              />
            </label>

            <div class="flex justify-end gap-2">
              <button
                type="button"
                class="btn-press rounded-lg px-5 py-2 text-sm font-medium text-mist hover:text-paper"
                @click="close"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="!canSubmit || busy"
                :class="[
                  'btn-press rounded-lg px-6 py-2 text-sm font-semibold transition-colors',
                  canSubmit && !busy
                    ? 'bg-marquee text-ink hover:bg-curtain-bright'
                    : 'cursor-not-allowed bg-bg-alt2 text-mist/50',
                ]"
              >
                {{ busy ? 'Submitting…' : 'Submit report' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
