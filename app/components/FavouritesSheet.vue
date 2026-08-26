<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Cinema } from '~/types'

/**
 * Favourites modal & sheet:
 *   • On desktop: Clean centered modal dialog with backdrop blur.
 *   • On mobile: Sleek bottom sheet with drag-down dismissal.
 */
const open = useState('cc:fav-open', () => false)
const { cinemas, selectCinema, openContribute } = useCinemaStore()
const { ids, load } = useFavourites()
const { user } = useAuth()

const favouriteCinemas = computed(() =>
  cinemas.value.filter((c: Cinema) => ids.value.includes(c.id)))

/* Swipe down drag dismiss for Mobile */
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
    open.value = false
  }
  dragOffsetY.value = 0
}

watch(open, (v) => {
  if (!import.meta.client) return
  document.body.style.overflow = v ? 'hidden' : ''
  if (v) {
    dragOffsetY.value = 0
    load()
  }
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  if (import.meta.client) document.body.style.overflow = ''
})

const route = useRoute()
const sheetOpen = useState('cc:sheet-open', () => false)

function openCinema(id: string) {
  open.value = false
  selectCinema(id)
  sheetOpen.value = true
  if (route.path !== '/map') {
    navigateTo({ path: '/map', query: { theatre: id } })
  }
}

function contributeFor(c: Cinema, mode: 'ad' | 'rating' = 'ad') {
  open.value = false
  openContribute({ cinema: c, mode })
}
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
        v-if="open && user"
        class="fixed inset-0 z-[1200] flex items-end justify-center p-0 sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Favourite theatres"
      >
        <!-- Backdrop Scrim -->
        <div
          class="absolute inset-0 bg-bg/80 backdrop-blur-sm"
          :style="{
            opacity: dragOffsetY > 0 ? Math.max(0.1, 1 - (dragOffsetY / 300)) : undefined,
          }"
          @click="open = false"
        />

        <!-- Modal / Sheet Container -->
        <div
          class="relative flex max-h-[90dvh] w-full max-w-xl flex-col rounded-t-3xl border border-reel bg-bg-alt text-paper shadow-2xl pb-[env(safe-area-inset-bottom)] sm:max-h-[82vh] sm:rounded-2xl sm:pb-0"
          :style="{
            transform: dragOffsetY > 0 ? `translate3d(0, ${dragOffsetY}px, 0)` : undefined,
            transition: isDragging ? 'none' : 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)',
          }"
        >
          <!-- Mobile Pull Handle -->
          <div
            class="mx-auto flex h-7 w-full cursor-grab items-center justify-center touch-none select-none sm:hidden"
            aria-label="Drag down to close"
            @touchstart.stop="onDragStart"
            @touchmove.stop="onDragMove"
            @touchend.stop="onDragEnd"
          >
            <div class="h-1.5 w-12 rounded-full bg-reel" />
          </div>

          <!-- Sticky Header -->
          <div class="flex shrink-0 items-center justify-between border-b border-reel/70 px-5 py-4 sm:px-6">
            <div class="flex items-center gap-2.5">
              <span class="grid h-8 w-8 place-items-center rounded-xl bg-marquee/10 text-marquee border border-marquee/30 text-base">
                ♥
              </span>
              <div>
                <h2 class="font-display text-base font-bold text-paper sm:text-lg leading-tight">
                  Favourite Theatres
                </h2>
                <p class="text-xs text-mist">
                  {{ favouriteCinemas.length }} saved theatre{{ favouriteCinemas.length === 1 ? '' : 's' }}
                </p>
              </div>
            </div>
            <button
              class="btn-press grid h-8 w-8 place-items-center rounded-lg border border-reel bg-bg-alt2 text-mist hover:text-paper"
              aria-label="Close favourites"
              @click="open = false"
            >
              ✕
            </button>
          </div>

          <!-- Scrollable Favourites List -->
          <div class="scroll-slim flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">
            <template v-if="favouriteCinemas.length">
              <TicketCard
                v-for="c in favouriteCinemas"
                :key="c.id"
                :cinema="c"
                show-city
                @select="openCinema(c.id)"
                @contribute="contributeFor(c, 'ad')"
                @rate="contributeFor(c, 'rating')"
              />
            </template>
            <div
              v-else
              class="rounded-2xl border border-reel bg-bg-alt2/80 p-8 text-center"
            >
              <span class="mx-auto grid h-12 w-12 place-items-center rounded-full bg-bg text-2xl">♡</span>
              <h3 class="mt-3 font-display text-base font-semibold text-paper">No favourite theatres yet</h3>
              <p class="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-mist">
                Tap the heart icon beside any theatre on the map or list to save it to your favourites.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

