 <script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Cinema } from '~/types'

/**
 * Mobile-only fixed bottom navigation (lg:hidden).
 * Five primary actions:
 *   1. Home       → / (or scrolls to top if on /)
 *   2. Search     → opens the search & cinema list drawer over /map
 *   3. Add (+)    → raised action opening explicit Action Sheet menu
 *   4. Favourites → opens FavouritesSheet (authenticated with Google)
 *   5. Account    → opens mobile account / profile menu or AuthModal
 */
const route = useRoute()
const { openAuthModal, openContribute, selectedCinemaId, cinemas, selectCinema, distanceTo, userLocation } = useCinemaStore()
const { user } = useAuth()
const toast = useToast()

const menuOpen = useState('cc:nav-menu', () => false)
const favouritesOpen = useState('cc:fav-open', () => false)
const searchDrawerOpen = useState('cc:search-drawer', () => false)

const addMenuOpen = ref(false)
const cinemaSearchQuery = ref('')
const chosenCinema = ref<Cinema | null>(null)

// Explicitly selected cinema on map/details (never a silent default fallback)
const explicitlySelectedCinema = computed(() => {
  if (!selectedCinemaId.value) return null
  return cinemas.value.find(c => c.id === selectedCinemaId.value) ?? null
})

// Search / Nearest cinemas for the explicit theatre picker
const matchingCinemas = computed(() => {
  const q = cinemaSearchQuery.value.trim().toLowerCase()
  let list = cinemas.value
  if (q) {
    list = list.filter(c => c.name.toLowerCase().includes(q) || c.address?.toLowerCase().includes(q) || c.city.toLowerCase().includes(q))
  } else if (userLocation.value) {
    list = [...list].sort((a, b) => (distanceTo(a) ?? 9999) - (distanceTo(b) ?? 9999))
  }
  return list.slice(0, 7)
})

function pickCinema(c: Cinema) {
  chosenCinema.value = c
  selectCinema(c.id)
}

/* ---------------- Swipe Down Drag Gesture ---------------- */
const dragStartY = ref(0)
const dragOffsetY = ref(0)
const isDragging = ref(false)

function onDragStart(e: TouchEvent) {
  if (!e.touches || e.touches.length !== 1 || !e.touches[0]) return
  dragStartY.value = e.touches[0].clientY
  dragOffsetY.value = 0
  isDragging.value = true
}

function onDragMove(e: TouchEvent) {
  if (!isDragging.value || !e.touches || !e.touches[0]) return
  const deltaY = e.touches[0].clientY - dragStartY.value
  dragOffsetY.value = deltaY > 0 ? deltaY : deltaY * 0.2
}

function onDragEnd() {
  if (!isDragging.value) return
  isDragging.value = false
  if (dragOffsetY.value > 80) {
    addMenuOpen.value = false
  }
  dragOffsetY.value = 0
}

watch(addMenuOpen, (open) => {
  if (open) {
    dragOffsetY.value = 0
    cinemaSearchQuery.value = ''
    chosenCinema.value = explicitlySelectedCinema.value
  }
})

const homeActive = computed(() => route.path === '/')

function goHome() {
  if (route.path !== '/') {
    navigateTo('/')
    return
  }
  if (import.meta.client) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}

function goSearch() {
  if (route.path !== '/map') {
    navigateTo('/map?search=1')
    return
  }
  searchDrawerOpen.value = true
  nextTick(() => {
    const input = document.getElementById('cinema-search') as HTMLInputElement | null
    input?.focus()
  })
}

function onAdd() {
  addMenuOpen.value = true
}

function handleAction(type: 'ad' | 'rating' | 'manual') {
  if (!chosenCinema.value) return
  const targetCinema = chosenCinema.value
  addMenuOpen.value = false

  if (type === 'ad') openContribute({ cinema: targetCinema, mode: 'ad' })
  else if (type === 'rating') openContribute({ cinema: targetCinema, mode: 'rating' })
  else openContribute({ cinema: targetCinema, mode: 'ad', isManual: true })
}

function goFavourites() {
  if (!user.value) {
    openAuthModal()
    return
  }
  favouritesOpen.value = true
}

function goAccount() {
  if (user.value) menuOpen.value = true
  else openAuthModal()
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-[900] flex w-full items-end border-t border-reel bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    aria-label="Primary Mobile Navigation"
  >
    <!-- Home -->
    <button
      type="button"
      class="btn-press flex flex-1 flex-col items-center gap-1 px-1 py-1.5"
      :class="homeActive ? 'text-marquee' : 'text-mist hover:text-paper'"
      :aria-current="homeActive ? 'page' : undefined"
      @click="goHome"
    >
      <svg viewBox="0 0 24 24" class="h-[22px] w-[22px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M3 10.5l9-7.5 9 7.5v9a2 2 0 0 1-2 2h-4.5v-6h-5v6H5a2 2 0 0 1-2-2v-9z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="text-[10px] font-medium uppercase tracking-wider">Home</span>
    </button>

    <!-- Search -->
    <button
      type="button"
      class="btn-press flex flex-1 flex-col items-center gap-1 px-1 py-1.5"
      :class="searchDrawerOpen ? 'text-marquee' : 'text-mist hover:text-paper'"
      @click="goSearch"
    >
      <svg viewBox="0 0 24 24" class="h-[22px] w-[22px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" stroke-linecap="round" />
      </svg>
      <span class="text-[10px] font-medium uppercase tracking-wider">Search</span>
    </button>

    <!-- Add — raised center action -->
    <div class="flex flex-1 flex-col items-center gap-1 px-1 pb-1.5 pt-1">
      <button
        type="button"
        class="btn-press -mt-4 grid h-11 w-11 place-items-center rounded-full bg-marquee text-ink ring-4 ring-bg hover:bg-curtain-bright shadow-lg"
        aria-label="Add contribution"
        @click="onAdd"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
          <path d="M12 5.5v13M5.5 12h13" stroke-linecap="round" />
        </svg>
      </button>
      <span class="text-[10px] font-medium uppercase tracking-wider text-mist">Add</span>
    </div>

    <!-- Favourites -->
    <button
      type="button"
      class="btn-press flex flex-1 flex-col items-center gap-1 px-1 py-1.5 text-mist hover:text-paper"
      @click="goFavourites"
    >
      <svg viewBox="0 0 24 24" class="h-[22px] w-[22px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 20s-7.5-4.6-7.5-10a4.6 4.6 0 0 1 7.5-3.6A4.6 4.6 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span class="text-[10px] font-medium uppercase tracking-wider">Favourites</span>
    </button>

    <!-- Account -->
    <button
      type="button"
      class="btn-press flex flex-1 flex-col items-center gap-1 px-1 py-1.5 text-mist hover:text-paper"
      @click="goAccount"
    >
      <svg viewBox="0 0 24 24" class="h-[22px] w-[22px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <circle cx="12" cy="8" r="3.6" />
        <path d="M5 20c.8-3.4 3.6-5.2 7-5.2s6.2 1.8 7 5.2" stroke-linecap="round" />
      </svg>
      <span class="text-[10px] font-medium uppercase tracking-wider">Account</span>
    </button>

    <!-- Add Action Sheet Teleport -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition-opacity duration-200"
        enter-from-class="opacity-0"
        leave-active-class="transition-opacity duration-150"
        leave-to-class="opacity-0"
      >
        <div
          v-if="addMenuOpen"
          class="fixed inset-0 z-[1200] lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Add Contribution Options"
        >
          <!-- Scrim -->
          <div
            class="absolute inset-0 bg-bg/75 backdrop-blur-sm"
            :style="{
              opacity: dragOffsetY > 0 ? Math.max(0.1, 1 - (dragOffsetY / 300)) : undefined,
            }"
            @click="addMenuOpen = false"
          />

          <!-- Action Sheet Container -->
          <div
            class="absolute inset-x-0 bottom-0 p-3 pb-[calc(env(safe-area-inset-bottom)+12px)]"
            :style="{
              transform: dragOffsetY > 0 ? `translate3d(0, ${dragOffsetY}px, 0)` : undefined,
              transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
            }"
          >
            <div class="max-h-[82dvh] flex flex-col rounded-3xl border border-reel bg-bg-alt p-5 shadow-2xl backdrop-blur-xl">
              <!-- Drag handle -->
              <div
                class="mx-auto -mt-2 mb-3 flex h-6 w-full shrink-0 cursor-grab items-center justify-center touch-none select-none"
                @touchstart.stop="onDragStart"
                @touchmove.stop="onDragMove"
                @touchend.stop="onDragEnd"
              >
                <div class="h-1.5 w-12 rounded-full bg-reel" />
              </div>

              <!-- ══════════════ STATE A: THEATRE IS CONFIRMED ══════════════ -->
              <template v-if="chosenCinema">
                <!-- Header -->
                <div class="flex shrink-0 items-start justify-between gap-3 pb-3 border-b border-reel/60">
                  <div class="min-w-0 flex-1">
                    <h3 class="font-display text-base font-bold text-paper">What would you like to contribute?</h3>
                    <div class="mt-1 flex items-center gap-2">
                      <span class="truncate text-xs font-semibold text-marquee">📍 {{ chosenCinema.name }}</span>
                      <button
                        type="button"
                        class="shrink-0 text-[11px] font-semibold text-mist hover:text-paper underline underline-offset-2"
                        @click="chosenCinema = null"
                      >
                        Change
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-reel bg-bg text-mist hover:text-paper"
                    @click="addMenuOpen = false"
                  >
                    ✕
                  </button>
                </div>

                <!-- Actions List -->
                <div class="mt-3.5 space-y-2.5 overflow-y-auto">
                  <!-- Option 1: AD Timing -->
                  <button
                    type="button"
                    class="btn-press flex w-full items-center gap-3.5 rounded-2xl border border-reel/70 bg-bg-alt2/80 p-3.5 text-left transition-all hover:border-marquee hover:bg-bg-alt2"
                    @click="handleAction('ad')"
                  >
                    <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-marquee/30 bg-marquee/10 text-xl text-marquee">
                      📢
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between">
                        <h4 class="text-xs font-bold text-paper">Contribute AD Timing</h4>
                        <span class="rounded bg-marquee/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-marquee">
                          Commercials
                        </span>
                      </div>
                      <p class="mt-0.5 truncate text-[11px] text-mist">Report pre-show trailers & ads duration</p>
                    </div>
                  </button>

                  <!-- Option 2: Rate Theatre -->
                  <button
                    type="button"
                    class="btn-press flex w-full items-center gap-3.5 rounded-2xl border border-reel/70 bg-bg-alt2/80 p-3.5 text-left transition-all hover:border-amber-400 hover:bg-bg-alt2"
                    @click="handleAction('rating')"
                  >
                    <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-xl text-amber-400">
                      ⭐
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between">
                        <h4 class="text-xs font-bold text-paper">Rate Theatre Features</h4>
                        <span class="rounded bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-300">
                          Ratings
                        </span>
                      </div>
                      <p class="mt-0.5 truncate text-[11px] text-mist">Screen, sound, ambience, staff & food</p>
                    </div>
                  </button>

                  <!-- Option 3: Add Showtimes -->
                  <button
                    type="button"
                    class="btn-press flex w-full items-center gap-3.5 rounded-2xl border border-reel/70 bg-bg-alt2/80 p-3.5 text-left transition-all hover:border-cyan-400 hover:bg-bg-alt2"
                    @click="handleAction('manual')"
                  >
                    <div class="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-xl text-cyan-400">
                      🎬
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center justify-between">
                        <h4 class="text-xs font-bold text-paper">Enter Movies & Showtimes</h4>
                        <span class="rounded bg-cyan-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-cyan-300">
                          Showtimes
                        </span>
                      </div>
                      <p class="mt-0.5 truncate text-[11px] text-mist">Add missing movie screening details</p>
                    </div>
                  </button>
                </div>
              </template>

              <!-- ══════════════ STATE B: SELECT THEATRE FIRST ══════════════ -->
              <template v-else>
                <div class="flex shrink-0 items-start justify-between gap-3 pb-2.5 border-b border-reel/60">
                  <div>
                    <h3 class="font-display text-base font-bold text-paper">Which theatre are you at?</h3>
                    <p class="mt-0.5 text-xs text-mist">Select a cinema to report AD timings or ratings</p>
                  </div>
                  <button
                    type="button"
                    class="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-reel bg-bg text-mist hover:text-paper"
                    @click="addMenuOpen = false"
                  >
                    ✕
                  </button>
                </div>

                <!-- Instant Search Input -->
                <div class="mt-3 shrink-0">
                  <div class="relative">
                    <input
                      v-model="cinemaSearchQuery"
                      type="search"
                      placeholder="Search theatre by name or area…"
                      class="w-full rounded-xl border border-reel bg-bg-alt2 py-2.5 pl-9 pr-3 text-xs text-paper placeholder:text-mist/60 focus:border-marquee focus:outline-none"
                    />
                    <span class="pointer-events-none absolute left-3 top-2.5 text-mist">🔍</span>
                  </div>
                </div>

                <!-- Nearest / Matching Cinemas List -->
                <div class="scroll-slim mt-2.5 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-0.5 max-h-[38dvh]">
                  <div
                    v-for="c in matchingCinemas"
                    :key="c.id"
                    class="btn-press flex items-center justify-between rounded-xl border border-reel/50 bg-bg-alt2/50 p-2.5 transition-colors hover:border-marquee hover:bg-bg-alt2 cursor-pointer"
                    @click="pickCinema(c)"
                  >
                    <div class="min-w-0 flex-1 pr-2">
                      <p class="truncate text-xs font-bold text-paper leading-tight">{{ c.name }}</p>
                      <p v-if="c.address" class="mt-0.5 truncate text-[11px] text-mist">{{ c.address }}</p>
                    </div>
                    <div class="flex items-center gap-2 shrink-0">
                      <span v-if="distanceTo(c) != null" class="rounded bg-bg px-1.5 py-0.5 font-mono text-[10px] font-semibold text-marquee border border-reel">
                        {{ distanceTo(c)!.toFixed(1) }} km
                      </span>
                      <span class="text-xs text-mist">›</span>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </nav>
</template>

