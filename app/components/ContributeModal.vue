<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { fmt12 } from '~/utils/time'
import type { Movie, Showtime } from '~/types'

const { showContribute, contributeTarget, closeContribute, submitContribution } = useCinemaStore()
const { user } = useAuth()

const activeTab = ref<'ad' | 'rating'>('ad')

const selectedMovieId = ref<string>('')
const isCustomMovie = ref(false)
const selectedShowId = ref<string>('')
const isCustomShow = ref(false)
const selectedMinutes = ref<number>(15)
const isCustomMinutes = ref(false)
const customMinutesVal = ref<number>(15)
const busy = ref(false)

const customMovieTitle = ref('')
const customLanguage = ref('Malayalam')
const customDate = ref(new Date().toISOString().slice(0, 10))
const customStartTime = ref('')
const customEndTime = ref('')

const ratings = reactive({
  overall: 0,
  ambience: 0,
  staff: 0,
  movieExperience: 0,
  foodBeverages: 0,
  valueForMoney: 0,
})
const review = ref('')

const movies = computed(() => contributeTarget.value?.cinema?.movies ?? [])

const selectedMovie = computed(() => {
  if (isCustomMovie.value) return null
  if (!movies.value.length) return null
  return movies.value.find(m => m.id === selectedMovieId.value) ?? movies.value[0] ?? null
})

const showtimes = computed(() => selectedMovie.value?.showtimes ?? [])

const selectedShow = computed(() => {
  if (isCustomMovie.value || isCustomShow.value) return null
  if (!showtimes.value.length) return null
  return showtimes.value.find(s => s.id === selectedShowId.value) ?? showtimes.value[0] ?? null
})

function selectMovie(m: Movie) {
  isCustomMovie.value = false
  selectedMovieId.value = m.id
  customMovieTitle.value = m.title
  if (m.language) customLanguage.value = m.language

  if (m.showtimes && m.showtimes.length > 0 && m.showtimes[0]) {
    selectedShowId.value = m.showtimes[0].id
    isCustomShow.value = false
  } else {
    selectedShowId.value = '__custom__'
    isCustomShow.value = true
  }
}

function selectCustomMovie() {
  isCustomMovie.value = true
  selectedMovieId.value = '__custom__'
  isCustomShow.value = true
  selectedShowId.value = '__custom__'
  if (!customMovieTitle.value || movies.value.some(m => m.title === customMovieTitle.value)) {
    customMovieTitle.value = ''
  }
}

function selectShow(st: Showtime) {
  isCustomShow.value = false
  selectedShowId.value = st.id
}

function selectCustomShow() {
  isCustomShow.value = true
  selectedShowId.value = '__custom__'
}

watch(selectedMovieId, () => {
  if (!isCustomMovie.value && showtimes.value.length > 0 && !isCustomShow.value) {
    if (!showtimes.value.some(s => s.id === selectedShowId.value)) {
      selectedShowId.value = showtimes.value[0]?.id ?? ''
    }
  }
})

watch(showContribute, (open) => {
  if (open) {
    const target = contributeTarget.value
    activeTab.value = target?.mode === 'rating' ? 'rating' : 'ad'

    customMovieTitle.value = ''
    customLanguage.value = 'Malayalam'
    customDate.value = new Date().toISOString().slice(0, 10)
    customStartTime.value = ''
    customEndTime.value = ''

    // If cinema has no movies or opened in manual mode
    if (target?.isManual || !target?.cinema?.movies?.length) {
      isCustomMovie.value = true
      isCustomShow.value = true
      selectedMovieId.value = '__custom__'
      selectedShowId.value = '__custom__'
    } else {
      isCustomMovie.value = false

      if (target?.movie) {
        selectedMovieId.value = target.movie.id
        customMovieTitle.value = target.movie.title
        if (target.movie.language) customLanguage.value = target.movie.language
      } else {
        selectedMovieId.value = target.cinema.movies[0]?.id ?? ''
        if (target.cinema.movies[0]?.language) customLanguage.value = target.cinema.movies[0].language
      }

      if (target?.showtime) {
        selectedShowId.value = target.showtime.id
        isCustomShow.value = false
        customStartTime.value = target.showtime.startTime
      } else if (showtimes.value.length) {
        selectedShowId.value = showtimes.value[0]?.id ?? ''
        isCustomShow.value = false
      } else {
        selectedShowId.value = '__custom__'
        isCustomShow.value = true
      }
    }

    selectedMinutes.value = target?.showtime?.adDurationMin != null ? Math.round(target.showtime.adDurationMin) : 15
    isCustomMinutes.value = false
    customMinutesVal.value = selectedMinutes.value

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

function isPastShow(timeStr?: string | null): boolean {
  if (!timeStr) return false
  const now = new Date()
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  return timeStr < currentHHMM
}

function close() {
  closeContribute()
}

const canSubmit = computed(() => {
  if (activeTab.value === 'ad') {
    if (selectedMinutes.value == null || selectedMinutes.value < 0 || selectedMinutes.value > 90) {
      return false
    }
    if (isCustomMovie.value || !movies.value.length) {
      return Boolean(
        customMovieTitle.value.trim().length > 0 &&
        customStartTime.value.trim().length > 0
      )
    }
    if (isCustomShow.value || !showtimes.value.length) {
      return Boolean(
        customStartTime.value.trim().length > 0
      )
    }
    return Boolean(selectedShow.value?.id)
  }
  if (Object.values(ratings).some(v => v > 0)) return true
  return review.value.trim().length > 3
})

function setDuration(mins: number) {
  selectedMinutes.value = mins
  customMinutesVal.value = mins
  isCustomMinutes.value = false
}

function onCustomInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(val) && val >= 0 && val <= 90) {
    selectedMinutes.value = val
    customMinutesVal.value = val
    isCustomMinutes.value = true
  }
}

/* ---------------- Interactive Drag Down Gesture ---------------- */
const dragStartY = ref(0)
const dragStartTime = ref(0)
const dragOffsetY = ref(0)
const isDragging = ref(false)
const isClosing = ref(false)

function onDragStart(e: TouchEvent) {
  if (!e.touches || e.touches.length !== 1 || !e.touches[0]) return
  dragStartY.value = e.touches[0].clientY
  dragStartTime.value = Date.now()
  dragOffsetY.value = 0
  isDragging.value = true
}

function onDragMove(e: TouchEvent) {
  if (!isDragging.value || isClosing.value || !e.touches || !e.touches[0]) return
  const currentY = e.touches[0].clientY
  const deltaY = currentY - dragStartY.value
  if (deltaY > 0) {
    dragOffsetY.value = deltaY
  } else {
    dragOffsetY.value = deltaY * 0.2
  }
}

function onDragEnd() {
  if (!isDragging.value || isClosing.value) return
  isDragging.value = false
  const elapsed = Date.now() - dragStartTime.value
  const velocity = dragOffsetY.value / Math.max(elapsed, 1)

  if (dragOffsetY.value > 90 || (velocity > 0.4 && dragOffsetY.value > 30)) {
    isClosing.value = true
    dragOffsetY.value = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600
    setTimeout(() => {
      close()
      isClosing.value = false
      dragOffsetY.value = 0
    }, 280)
  } else {
    dragOffsetY.value = 0
  }
}

async function submit() {
  if (!canSubmit.value || busy.value) return
  const t = contributeTarget.value
  if (!t) return
  busy.value = true

  let ok = false
  if (activeTab.value === 'ad') {
    if (isCustomMovie.value || !movies.value.length) {
      ok = await submitContribution({
        cinemaId: t.cinema.id,
        movieTitle: customMovieTitle.value.trim(),
        language: customLanguage.value.trim() || 'General',
        date: customDate.value || new Date().toISOString().slice(0, 10),
        startTime: customStartTime.value.trim(),
        endTime: customEndTime.value.trim(),
        minutes: selectedMinutes.value,
      })
    } else if (isCustomShow.value || !selectedShow.value?.id) {
      ok = await submitContribution({
        cinemaId: t.cinema.id,
        movieId: selectedMovie.value?.id,
        movieTitle: selectedMovie.value?.title || customMovieTitle.value.trim(),
        language: selectedMovie.value?.language || customLanguage.value.trim() || 'General',
        date: customDate.value || new Date().toISOString().slice(0, 10),
        startTime: customStartTime.value.trim(),
        endTime: customEndTime.value.trim(),
        minutes: selectedMinutes.value,
      })
    } else {
      const showId = selectedShow.value?.id || t.showtime?.id
      if (showId) {
        ok = await submitContribution({
          cinemaId: t.cinema.id,
          movieId: selectedMovie.value?.id || t.movie?.id,
          showId,
          date: customDate.value || new Date().toISOString().slice(0, 10),
          minutes: selectedMinutes.value,
        })
      }
    }
  } else {
    ok = await submitContribution({
      cinemaId: t.cinema.id,
      ...ratings,
      review: review.value.trim(),
    })
  }

  busy.value = false
  if (ok) close()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="showContribute && contributeTarget"
        class="fixed inset-0 z-[9999] flex items-end justify-center p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Contribute ad duration and ratings"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-bg/80 backdrop-blur-sm"
          :style="{
            opacity: dragOffsetY > 0 ? Math.max(0.1, 1 - (dragOffsetY / 350)) : undefined,
            transition: isDragging ? 'none' : 'opacity 0.28s ease',
          }"
          @click="close"
        />

        <!-- Modal / Mobile Sheet Container -->
        <div
          class="modal-card relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl border-t border-reel bg-bg-alt text-paper shadow-2xl pb-[env(safe-area-inset-bottom)] sm:max-h-[85vh] sm:rounded-2xl sm:border sm:border-reel sm:pb-0"
          :style="{
            transform: dragOffsetY !== 0 ? `translate3d(0, ${Math.max(0, dragOffsetY)}px, 0)` : undefined,
            transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
          }"
        >
          <!-- Mobile Pull Handle Area (Drag down to dismiss only from here) -->
          <div
            class="mx-auto flex h-7 w-full cursor-grab items-center justify-center touch-none select-none sm:hidden"
            aria-label="Drag down to close"
            @touchstart.stop="onDragStart"
            @touchmove.stop="onDragMove"
            @touchend.stop="onDragEnd"
          >
            <div class="h-1.5 w-12 rounded-full bg-reel transition-colors active:bg-marquee" />
          </div>

          <!-- Sticky Modal Header -->
          <div class="flex shrink-0 items-start justify-between gap-3 border-b border-reel/70 px-5 py-3.5 sm:px-6 sm:py-4">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2.5">
                <button
                  type="button"
                  :class="[
                    'font-display text-base font-bold transition-all sm:text-lg',
                    activeTab === 'ad' ? 'text-paper' : 'text-mist hover:text-paper',
                  ]"
                  @click="activeTab = 'ad'"
                >
                  Contribute AD Timing
                </button>
                <span class="text-mist/40">|</span>
                <button
                  type="button"
                  :class="[
                    'font-display text-base font-bold transition-all sm:text-lg',
                    activeTab === 'rating' ? 'text-paper' : 'text-mist hover:text-paper',
                  ]"
                  @click="activeTab = 'rating'"
                >
                  Rate Theatre
                </button>
              </div>
              <p class="mt-0.5 truncate text-xs text-mist">
                {{ contributeTarget.cinema.name }}
                <span v-if="contributeTarget.cinema.address" class="text-mist/70"> · {{ contributeTarget.cinema.address }}</span>
              </p>
            </div>
            <button
              class="btn-press grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-reel bg-bg-alt2 text-mist hover:text-paper"
              aria-label="Close"
              @click="close"
            >
              ✕
            </button>
          </div>

          <!-- Scrollable Modal Body -->
          <div class="scroll-slim flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <!-- Login gate -->
            <div v-if="!user" class="py-2">
              <div class="text-center">
                <span class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg-alt2 text-2xl">🔒</span>
                <h3 class="mt-3 font-display text-base">Sign in to contribute</h3>
                <p class="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-mist">
                  Browsing is free forever. Contributing ad timings and ratings is tied to an account to ensure community accuracy.
                </p>
              </div>
              <div class="mt-4 rounded-xl border border-reel bg-bg-alt2 p-4">
                <AuthForms @success="() => {}" />
              </div>
            </div>

            <!-- Form Content -->
            <form v-else id="contribute-form" class="space-y-4" @submit.prevent="submit">
              <!-- ══════════════ TAB 1: AD TIMING ══════════════ -->
              <div v-if="activeTab === 'ad'" class="space-y-4">
                <!-- 1. MOVIE SELECTION -->
                <div>
                  <div class="flex items-center justify-between">
                    <label class="block text-[11px] font-semibold uppercase tracking-wider text-marquee">
                      Select Movie
                    </label>
                    <span v-if="isCustomMovie" class="text-[10px] font-medium text-mist">
                      Custom Movie Mode
                    </span>
                  </div>

                  <div class="mt-2 flex flex-wrap items-center gap-2">
                    <!-- Pre-listed Movie Buttons -->
                    <button
                      v-for="m in movies"
                      :key="m.id"
                      type="button"
                      :class="[
                        'btn-press flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                        !isCustomMovie && selectedMovie?.id === m.id
                          ? 'border border-marquee bg-marquee text-ink shadow'
                          : 'border border-reel bg-bg-alt2 text-paper hover:border-marquee/70',
                      ]"
                      @click="selectMovie(m)"
                    >
                      <span class="max-w-[180px] truncate">{{ m.title }}</span>
                    </button>

                    <!-- Add Custom Movie Button -->
                    <button
                      type="button"
                      :class="[
                        'btn-press flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all',
                        isCustomMovie
                          ? 'border-marquee bg-marquee text-ink shadow'
                          : 'border-dashed border-reel bg-bg-alt2/80 text-mist hover:border-marquee hover:text-paper',
                      ]"
                      @click="selectCustomMovie"
                    >
                      <span class="text-sm font-bold leading-none">+</span>
                      <span>Custom Movie</span>
                    </button>
                  </div>

                  <!-- Custom Movie Input Form (if custom movie selected or no movies exist) -->
                  <div v-if="isCustomMovie || !movies.length" class="mt-3 space-y-3 rounded-2xl border border-reel bg-bg-alt2/60 p-3.5 sm:p-4">
                    <div>
                      <label class="block text-[11px] font-semibold uppercase tracking-wider text-marquee">
                        Movie Name <span class="text-curtain-bright text-xs">*</span>
                      </label>
                      <input
                        v-model="customMovieTitle"
                        type="text"
                        placeholder="e.g. Manjummel Boys"
                        class="mt-1.5 w-full rounded-xl border border-reel bg-bg-alt2 px-3.5 py-2.5 text-xs text-paper placeholder:text-mist/50 focus:border-marquee focus:outline-none"
                      />
                    </div>

                    <div>
                      <label class="block text-[11px] font-semibold uppercase tracking-wider text-marquee">
                        Language
                      </label>
                      <input
                        v-model="customLanguage"
                        type="text"
                        list="movie-languages"
                        placeholder="e.g. Malayalam"
                        class="mt-1.5 w-full rounded-xl border border-reel bg-bg-alt2 px-3.5 py-2.5 text-xs text-paper placeholder:text-mist/50 focus:border-marquee focus:outline-none"
                      />
                      <datalist id="movie-languages">
                        <option value="Malayalam" />
                        <option value="Tamil" />
                        <option value="Hindi" />
                        <option value="English" />
                        <option value="Telugu" />
                        <option value="Kannada" />
                        <option value="Bengali" />
                        <option value="Marathi" />
                      </datalist>
                    </div>
                  </div>
                </div>

                <!-- 2. SHOW SESSION SELECTION -->
                <div>
                  <div class="flex items-center justify-between">
                    <label class="block text-[11px] font-semibold uppercase tracking-wider text-marquee">
                      Select Show Session
                    </label>
                    <span v-if="isCustomShow" class="text-[10px] font-medium text-mist">
                      Custom Timing Mode
                    </span>
                  </div>

                  <!-- Showtimes Pills (when not custom movie) -->
                  <div v-if="!isCustomMovie" class="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      v-for="st in showtimes"
                      :key="st.id"
                      type="button"
                      :class="[
                        'btn-press flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                        !isCustomShow && selectedShow?.id === st.id
                          ? 'border border-marquee bg-marquee text-ink shadow'
                          : isPastShow(st.startTime)
                            ? 'border border-reel/60 bg-bg-alt2/50 text-mist/60 hover:border-marquee'
                            : 'border border-reel bg-bg-alt2 text-paper hover:border-marquee',
                      ]"
                      @click="selectShow(st)"
                    >
                      <span>{{ fmt12(st.startTime) }}</span>
                      <span :class="!isCustomShow && selectedShow?.id === st.id ? 'opacity-80' : 'opacity-60'" class="text-[10px]">({{ st.format }})</span>
                      <span
                        v-if="isPastShow(st.startTime)"
                        :class="!isCustomShow && selectedShow?.id === st.id ? 'bg-ink/15 text-ink/85' : 'bg-bg text-mist/60'"
                        class="rounded px-1 py-0.2 text-[9px] lowercase font-normal"
                      >
                        ended
                      </span>
                    </button>

                    <!-- Add Custom Show Button -->
                    <button
                      type="button"
                      :class="[
                        'btn-press flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all',
                        isCustomShow
                          ? 'border-marquee bg-marquee text-ink shadow'
                          : 'border-dashed border-reel bg-bg-alt2/80 text-mist hover:border-marquee hover:text-paper',
                      ]"
                      @click="selectCustomShow"
                    >
                      <span class="text-sm font-bold leading-none">+</span>
                      <span>Custom Show</span>
                    </button>
                  </div>

                  <!-- Custom Show Timing Inputs (if custom show or custom movie or no showtimes) -->
                  <div v-if="isCustomShow || isCustomMovie || !showtimes.length" class="mt-3 space-y-2 rounded-2xl border border-reel bg-bg-alt2/60 p-3.5 sm:p-4">
                    <div class="grid grid-cols-2 gap-3">
                      <div>
                        <label class="block text-[11px] font-semibold uppercase tracking-wider text-marquee">
                          Start Time <span class="text-curtain-bright text-xs">*</span>
                        </label>
                        <input
                          v-model="customStartTime"
                          type="text"
                          placeholder="e.g. 10:30 AM or 18:30"
                          class="mt-1.5 w-full rounded-xl border border-reel bg-bg-alt2 px-3.5 py-2.5 font-mono text-xs text-paper placeholder:text-mist/50 focus:border-marquee focus:outline-none"
                        />
                      </div>
                      <div>
                        <label class="block text-[11px] font-semibold uppercase tracking-wider text-mist">
                          End Time (Optional)
                        </label>
                        <input
                          v-model="customEndTime"
                          type="text"
                          placeholder="e.g. 01:30 PM"
                          class="mt-1.5 w-full rounded-xl border border-reel bg-bg-alt2 px-3.5 py-2.5 font-mono text-xs text-paper placeholder:text-mist/50 focus:border-marquee focus:outline-none"
                        />
                      </div>
                    </div>
                    <p class="text-[10px] text-mist/70 pt-0.5">
                      Enter time in 12h (e.g. 2:00 PM, 6:30 PM) or 24h (e.g. 14:00, 18:30) format.
                    </p>
                  </div>
                </div>

                <!-- 3. SHOW DATE -->
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-marquee">
                    Show Date
                  </label>
                  <input
                    v-model="customDate"
                    type="date"
                    class="mt-1.5 w-full rounded-xl border border-reel bg-bg-alt2 px-3.5 py-2.5 text-xs text-paper placeholder:text-mist/50 focus:border-marquee focus:outline-none [color-scheme:dark]"
                  />
                </div>

                <!-- 4. PRE-SHOW AD DURATION -->
                <div>
                  <label class="block text-[11px] font-semibold uppercase tracking-wider text-marquee">
                    Pre-show AD Duration
                  </label>

                  <div class="mt-2 rounded-2xl border border-reel bg-bg-alt2/80 p-4 text-center">
                    <div class="flex items-baseline justify-center gap-1.5 font-display">
                      <span class="text-4xl font-extrabold tracking-tight text-marquee">{{ selectedMinutes }}</span>
                      <span class="text-sm font-semibold uppercase tracking-wider text-mist">minutes</span>
                    </div>

                    <!-- Slider -->
                    <div class="mt-3 px-1">
                      <input
                        type="range"
                        min="0"
                        max="45"
                        step="1"
                        :value="selectedMinutes"
                        class="w-full accent-marquee cursor-pointer h-2 bg-reel rounded-lg"
                        @input="onCustomInput"
                      />
                      <div class="mt-1.5 flex justify-between px-0.5 text-[10px] font-mono text-mist/60">
                        <span>0m (No ads)</span>
                        <span>15m</span>
                        <span>30m</span>
                        <span>45m+</span>
                      </div>
                    </div>

                    <!-- Quick Presets -->
                    <div class="mt-3.5 grid grid-cols-4 gap-1.5 sm:flex sm:flex-wrap sm:justify-center">
                      <button
                        v-for="mins in [0, 5, 10, 15, 20, 25, 30, 40]"
                        :key="mins"
                        type="button"
                        :class="[
                          'btn-press rounded-lg py-1.5 text-xs font-semibold transition-all sm:px-3',
                          selectedMinutes === mins
                            ? 'border border-marquee bg-marquee text-ink shadow'
                            : 'border border-reel bg-bg text-mist hover:border-mist hover:text-paper',
                        ]"
                        @click="setDuration(mins)"
                      >
                        {{ mins === 0 ? 'No Ads' : `${mins}m` }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- ══════════════ TAB 2: THEATRE RATINGS ══════════════ -->
              <div v-else class="space-y-4">
                <fieldset>
                  <legend class="text-[11px] font-semibold uppercase tracking-widest text-marquee">
                    Rate Theatre Features
                  </legend>
                  <div class="mt-3 space-y-2.5">
                    <StarPicker v-model="ratings.overall" label="Overall Experience" icon="⭐" />
                    <StarPicker v-model="ratings.ambience" label="Ambience & Comfort" icon="🏛️" />
                    <StarPicker v-model="ratings.staff" label="Staff & Service" icon="👔" />
                    <StarPicker v-model="ratings.movieExperience" label="Screen & Sound Quality" icon="🎬" />
                    <StarPicker v-model="ratings.foodBeverages" label="Food & Beverages" icon="🍿" />
                    <StarPicker v-model="ratings.valueForMoney" label="Value for Money" icon="💰" />
                  </div>
                </fieldset>

                <label class="block">
                  <span class="text-[11px] font-semibold uppercase tracking-widest text-marquee">
                    Audience Review (Optional)
                  </span>
                  <textarea
                    v-model="review"
                    rows="3"
                    placeholder="Share details on screen brightness, sound, seating comfort, or parking…"
                    class="mt-2 w-full rounded-xl border border-reel bg-bg-alt2 p-3 text-xs text-paper placeholder:text-mist/50 focus:border-marquee focus:outline-none"
                  />
                </label>
              </div>
            </form>
          </div>

          <!-- Sticky Actions Footer -->
          <div v-if="user" class="flex shrink-0 items-center gap-3 border-t border-reel/70 bg-bg-alt px-5 py-3.5 sm:px-6">
            <button
              type="button"
              class="btn-press rounded-xl border border-reel bg-bg px-4 py-2.5 text-xs font-semibold text-mist hover:border-mist hover:text-paper"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="contribute-form"
              :disabled="!canSubmit || busy"
              :class="[
                'btn-press flex-1 rounded-xl py-2.5 text-center text-xs sm:text-sm font-bold transition-all shadow-md',
                canSubmit && !busy
                  ? 'bg-marquee text-ink hover:bg-curtain-bright cursor-pointer active:scale-[0.98]'
                  : 'cursor-not-allowed border border-reel bg-bg-alt2 text-mist/40',
              ]"
            >
              {{ busy ? 'Submitting…' : activeTab === 'ad' ? 'Submit AD Timing' : 'Submit Rating' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
