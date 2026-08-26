<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Cinema, Movie, Showtime } from '~/types'
import { fmt12 } from '~/utils/time'

/**
 * Primary theatre-details interface on /map.
 * Appears as a sleek bottom sheet on mobile and a floating panel on desktop.
 * Two tabs:
 *   • AD & Ratings — ad aggregate, community rating breakdown, reviews, favourite toggle, contribution
 *   • Today's Showtimes — movies list with showtime chips, format badges, and countdown predictions
 */
const props = defineProps<{
  cinema: Cinema | null
  open: boolean
  distanceKm?: number | null
}>()

const emit = defineEmits<{ close: [] }>()

const { openContribute, openAuthModal } = useCinemaStore()
const { ids: favIds, toggle: toggleFavAction } = useFavourites()
const { user } = useAuth()
const toast = useToast()

const activeTab = ref<'details' | 'shows'>('details')

// Reset to Details tab whenever a new cinema is opened
watch(() => props.cinema?.id, () => {
  activeTab.value = 'details'
})

watch(() => props.open, (open) => {
  if (open) activeTab.value = 'details'
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})

/* ---------------- Favourites ---------------- */
const isFav = computed(() => props.cinema ? favIds.value.includes(props.cinema.id) : false)

function toggleFav() {
  if (!props.cinema) return
  toggleFavAction(props.cinema)
}

/* ---------------- Contribute ---------------- */
function contribute(mode: 'ad' | 'rating' = 'ad') {
  if (!props.cinema) return
  openContribute({ cinema: props.cinema, mode })
}

function manualShowtime() {
  if (!props.cinema) return
  openContribute({ cinema: props.cinema, mode: 'ad', isManual: true })
}

/* ---------------- Distance & Data Aggregates ---------------- */
const distanceLabel = computed(() => {
  if (props.distanceKm == null) return null
  return props.distanceKm < 1
    ? `${Math.round(props.distanceKm * 1000)} m from you`
    : `${props.distanceKm.toFixed(1)} km from you`
})

const typicalAds = computed(() => {
  const all = (props.cinema?.movies ?? [])
    .flatMap(m => m.showtimes)
    .filter(st => st.adDurationMin != null && st.adReports > 0)
  if (!all.length) return null
  const totalWeight = all.reduce((s, st) => s + (st.adReports || 1), 0)
  const avg = all.reduce((s, st) => s + st.adDurationMin! * (st.adReports || 1), 0) / totalWeight
  return Math.round(avg)
})

const movies = computed(() => (props.cinema?.movies ?? []).filter(m => m.showtimes.length > 0))
const reviews = computed(() => (props.cinema?.reviews ?? []).slice(0, 4))

const providerConfirmed = computed(() => {
  const syncedAt = props.cinema?.syncedAt
  if (!syncedAt) return false
  const age = Date.now() - Date.parse(syncedAt)
  return Number.isFinite(age) && age >= 0 && age < 36 * 3600 * 1000
})

/* ---------------- Interactive Swipe Down to Dismiss Gesture (Mobile) ---------------- */
const touchStartY = ref(0)
const touchStartTime = ref(0)
const dragOffsetY = ref(0)
const isDragging = ref(false)
const isClosing = ref(false)

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return
  touchStartY.value = e.touches[0].clientY
  touchStartTime.value = Date.now()
  dragOffsetY.value = 0
  isDragging.value = true
}

function onTouchMove(e: TouchEvent) {
  if (!isDragging.value || isClosing.value) return
  const currentY = e.touches[0].clientY
  const deltaY = currentY - touchStartY.value
  if (deltaY > 0) {
    dragOffsetY.value = deltaY
  } else {
    dragOffsetY.value = deltaY * 0.2
  }
}

function onTouchEnd() {
  if (!isDragging.value || isClosing.value) return
  isDragging.value = false
  const elapsed = Date.now() - touchStartTime.value
  const velocity = dragOffsetY.value / Math.max(elapsed, 1)

  // Trigger dismissal if dragged > 90px or fast swipe down (> 0.4px/ms)
  if (dragOffsetY.value > 90 || (velocity > 0.4 && dragOffsetY.value > 30)) {
    isClosing.value = true
    dragOffsetY.value = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 600
    setTimeout(() => {
      emit('close')
      isClosing.value = false
      dragOffsetY.value = 0
    }, 280)
  } else {
    // Snap back
    dragOffsetY.value = 0
  }
}

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    dragOffsetY.value = 0
    isClosing.value = false
    isDragging.value = false
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && cinema"
        class="fixed inset-0 z-[1100]"
        role="dialog"
        aria-modal="true"
        :aria-label="`${cinema.name} details`"
      >
        <!-- Backdrop Scrim — tap to return to map (non-blocking blur) -->
        <div
          class="absolute inset-0 bg-bg/50 backdrop-blur-[2px]"
          :style="{
            opacity: dragOffsetY > 0 ? Math.max(0.1, 1 - (dragOffsetY / 350)) : undefined,
            transition: isDragging ? 'none' : 'opacity 0.28s ease',
          }"
          @click="emit('close')"
        />

        <!-- Sheet container: Mobile slides from bottom; Desktop floats on left/bottom -->
        <Transition
          enter-active-class="transition-all duration-300 ease-out"
          enter-from-class="translate-y-full opacity-90 lg:translate-y-4 lg:opacity-0"
          leave-active-class="transition-all duration-200 ease-in"
          leave-to-class="translate-y-full opacity-90 lg:translate-y-4 lg:opacity-0"
        >
          <div
            class="absolute inset-x-0 bottom-0 p-2 sm:p-3 lg:bottom-6 lg:left-6 lg:right-auto lg:p-0"
            :style="{
              transform: dragOffsetY !== 0 ? `translate3d(0, ${Math.max(0, dragOffsetY)}px, 0)` : undefined,
              transition: isDragging ? 'none' : 'transform 0.28s cubic-bezier(0.25, 1, 0.5, 1)',
            }"
          >
            <div
              class="relative flex max-h-[82dvh] w-full flex-col rounded-2xl border border-reel bg-bg-alt/95 p-4 shadow-2xl backdrop-blur-xl lg:max-h-[80vh] lg:w-[520px]"
            >
              <!-- Mobile Drag Handle Area (Drag down to dismiss only from here) -->
              <div
                class="mx-auto -mt-1.5 mb-2.5 flex h-7 w-full cursor-grab items-center justify-center touch-none select-none lg:hidden"
                aria-label="Drag down to close"
                @touchstart.stop="onTouchStart"
                @touchmove.stop="onTouchMove"
                @touchend.stop="onTouchEnd"
              >
                <div class="h-1.5 w-12 rounded-full bg-reel transition-colors active:bg-marquee" />
              </div>

              <!-- Top header: Name + Favourite + Close -->
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <h2 class="font-display text-lg font-bold leading-tight text-paper sm:text-xl">
                    {{ cinema.name }}
                  </h2>
                  <p v-if="cinema.address" class="mt-0.5 truncate text-xs text-mist">
                    {{ cinema.address }}
                  </p>
                </div>

                <div class="flex items-center gap-1.5 shrink-0">
                  <!-- Favourite button -->
                  <button
                    type="button"
                    class="btn-press grid h-8 w-8 place-items-center rounded-lg border border-reel bg-bg-alt2 transition-colors hover:border-marquee hover:text-marquee"
                    :class="isFav ? 'text-marquee border-marquee' : 'text-mist'"
                    :title="isFav ? 'Remove from favourites' : 'Add to favourites'"
                    :aria-label="isFav ? 'Remove from favourites' : 'Add to favourites'"
                    @click="toggleFav"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      class="h-4 w-4"
                      :fill="isFav ? 'currentColor' : 'none'"
                      stroke="currentColor"
                      stroke-width="1.8"
                    >
                      <path d="M12 20s-7.5-4.6-7.5-10a4.6 4.6 0 0 1 7.5-3.6A4.6 4.6 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-linecap="round" stroke-linejoin="round" />
                    </svg>
                  </button>

                  <!-- Close button -->
                  <button
                    type="button"
                    class="btn-press grid h-8 w-8 place-items-center rounded-lg border border-reel bg-bg-alt2 text-base text-mist transition-colors hover:border-mist hover:text-paper"
                    aria-label="Close and return to map"
                    @click="emit('close')"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <!-- Quick stats row: Ad Time (highlighted) -> Rating -> Distance -->
              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                <!-- 1. Highlighted Ad Time -->
                <span
                  v-if="typicalAds != null"
                  class="inline-flex items-center gap-1 rounded-md bg-marquee px-2 py-0.5 font-display text-xs font-bold text-ink shadow-xs"
                >
                  📢 ~{{ typicalAds }} mins ads
                </span>
                <span
                  v-else
                  class="inline-flex items-center gap-1 rounded-md border border-reel bg-bg-alt2 px-2 py-0.5 text-xs text-mist"
                >
                  📢 No ad data
                </span>

                <!-- 2. Rating -->
                <span v-if="cinema.overall != null" class="font-semibold text-paper">
                  ⭐ {{ cinema.overall.toFixed(1) }}/5
                  <span class="font-normal text-mist">· {{ cinema.ratingCount }} rating{{ cinema.ratingCount === 1 ? '' : 's' }}</span>
                </span>
                <span v-else class="text-mist">⭐ No ratings yet</span>

                <!-- 3. Distance from user -->
                <span v-if="distanceLabel" class="font-medium text-body">📍 {{ distanceLabel }}</span>
              </div>

              <!-- Tab selector -->
              <div
                class="mt-3 flex rounded-xl border border-reel bg-bg-alt2 p-1"
                role="tablist"
                aria-label="Cinema information tabs"
              >
                <button
                  role="tab"
                  :aria-selected="activeTab === 'details'"
                  :class="[
                    'btn-press flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                    activeTab === 'details' ? 'bg-marquee text-ink' : 'text-mist hover:text-paper',
                  ]"
                  @click="activeTab = 'details'"
                >
                  AD & Ratings
                </button>
                <button
                  role="tab"
                  :aria-selected="activeTab === 'shows'"
                  :class="[
                    'btn-press flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors',
                    activeTab === 'shows' ? 'bg-marquee text-ink' : 'text-mist hover:text-paper',
                  ]"
                  @click="activeTab = 'shows'"
                >
                  Today's Showtimes
                  <span v-if="movies.length" class="ml-1 text-[10px] opacity-80">({{ movies.length }})</span>
                </button>
              </div>

              <!-- ── Tab 1: AD & Ratings ──────────────────────────────────── -->
              <div
                v-if="activeTab === 'details'"
                role="tabpanel"
                aria-label="AD and Ratings"
                class="scroll-slim mt-3 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
              >
                <!-- Typical AD duration card -->
                <div class="rounded-xl border border-reel/70 bg-bg-alt2 p-3.5">
                  <template v-if="typicalAds != null">
                    <div class="flex items-center justify-between">
                      <p class="text-sm font-semibold text-paper">📢 Usually has ads</p>
                      <span class="rounded-md bg-marquee/15 px-2 py-0.5 font-display text-xs font-bold text-marquee">
                        ~{{ typicalAds }} mins
                      </span>
                    </div>
                    <p class="mt-1 text-xs leading-relaxed text-body">
                      Crowdsourced pre-show duration based on recent moviegoer reports.
                    </p>
                  </template>
                  <template v-else>
                    <p class="text-sm font-medium text-mist">📢 No ad data reported yet</p>
                    <p class="mt-0.5 text-xs text-mist/80">
                      Be the first to report how long commercials ran before the movie!
                    </p>
                  </template>

                  <!-- Contribution CTAs -->
                  <div class="mt-3 flex gap-2">
                    <button
                      class="btn-press flex-1 rounded-lg border border-reel bg-bg px-3 py-2 text-xs font-semibold text-paper transition-colors hover:border-marquee hover:text-marquee"
                      @click="contribute('rating')"
                    >
                      ★ Rate theatre
                    </button>
                    <button
                      class="btn-press flex-1 rounded-lg border border-reel bg-bg px-3 py-2 text-xs font-semibold text-paper transition-colors hover:border-marquee hover:text-marquee"
                      @click="contribute('ad')"
                    >
                      Contribute AD data
                    </button>
                  </div>
                </div>

                <!-- Crowd verdict rating bars -->
                <div class="rounded-xl border border-reel/70 bg-bg-alt2 p-3.5">
                  <p class="font-mono text-[10px] uppercase tracking-widest text-mist">The crowd verdict</p>
                  <RatingBars
                    v-if="cinema.ratingCount > 0"
                    :ratings="cinema.ratings"
                    :overall="cinema.overall"
                    class="mt-2.5"
                  />
                  <p v-else class="mt-2 text-xs leading-relaxed text-mist">
                    No community ratings yet — share your experience to help other moviegoers!
                  </p>
                </div>

                <!-- Audience reviews / quotes -->
                <div v-if="reviews.length" class="space-y-2">
                  <p class="font-mono text-[10px] uppercase tracking-widest text-mist">From the audience</p>
                  <blockquote
                    v-for="r in reviews"
                    :key="r.text"
                    class="rounded-lg border border-reel/60 bg-bg-alt2 p-3"
                  >
                    <p class="text-xs leading-relaxed text-body">“{{ r.text }}”</p>
                    <footer class="mt-1.5 text-[10px] text-mist">— {{ r.name }} · {{ r.date }}</footer>
                  </blockquote>
                </div>
              </div>

              <!-- ── Tab 2: Today's Showtimes ─────────────────────────────── -->
              <div
                v-else
                role="tabpanel"
                aria-label="Today's Showtimes"
                class="scroll-slim mt-3 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1"
              >
                <div v-if="movies.length" class="space-y-3">
                  <MovieRow
                    v-for="m in movies"
                    :key="m.id"
                    :movie="m"
                  />
                  <!-- Option to add more movies/showtimes -->
                  <div class="pt-2 pb-1 text-center">
                    <button
                      type="button"
                      class="btn-press inline-flex items-center gap-1.5 rounded-xl border border-dashed border-reel bg-bg-alt2/60 px-4 py-2 text-xs font-semibold text-marquee transition-all hover:border-marquee hover:bg-bg-alt2"
                      @click="manualShowtime"
                    >
                      <span class="text-sm leading-none">+</span>
                      <span>Add another movie or showtime</span>
                    </button>
                  </div>
                </div>
                <div
                  v-else
                  class="rounded-xl border border-reel bg-bg-alt2 p-6 text-center text-xs leading-relaxed text-mist"
                >
                  <p class="font-display text-sm text-paper">No showtimes listed today</p>
                  <p class="mt-1 text-mist/80">
                    {{ providerConfirmed
                      ? 'The showtime provider confirms there are no sessions listed for today.'
                      : 'Showtime sync will refresh shortly with today’s listings.' }}
                  </p>
                  <div class="mt-4">
                    <button
                      type="button"
                      class="btn-press inline-flex items-center gap-1.5 rounded-xl bg-marquee px-4 py-2.5 text-xs font-bold text-ink shadow-md hover:bg-curtain-bright"
                      @click="manualShowtime"
                    >
                      <span class="text-sm leading-none">+</span>
                      <span>Enter movies & showtimes manually</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
