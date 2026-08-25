<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import type { Cinema } from '~/types'

/**
 * Mobile-only bottom sheet listing the signed-in user's favourite theatres
 * (opened from the bottom navigation's Favourites tab). Reuses TicketCard so
 * the list looks exactly like the Discover list; hearts work here too.
 */
const open = useState('cc:fav-open', () => false)
const { cinemas, selectCinema, openContribute } = useCinemaStore()
const { ids, load } = useFavourites()
const { user } = useAuth()

const favouriteCinemas = computed(() =>
  cinemas.value.filter((c: Cinema) => ids.value.includes(c.id)))

/** lg breakpoint (1024px) — the sheet is a mobile-only affordance. */
const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches

watch(open, (v) => {
  if (!import.meta.client) return
  // Never lock scrolling when the sheet is hidden on desktop.
  document.body.style.overflow = v && !isDesktop() ? 'hidden' : ''
  if (v) load()
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) open.value = false
}
function onMqChange(e: MediaQueryListEvent) {
  if (e.matches && open.value) open.value = false
}
let mq: MediaQueryList | null = null
onMounted(() => {
  window.addEventListener('keydown', onKey)
  mq = window.matchMedia('(min-width: 1024px)')
  mq.addEventListener('change', onMqChange)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  mq?.removeEventListener('change', onMqChange)
  document.body.style.overflow = ''
})

function openCinema(id: string) {
  open.value = false
  selectCinema(id, { scroll: true })
}

function contributeFor(c: Cinema) {
  open.value = false
  openContribute({ cinema: c })
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open && user"
        class="fixed inset-0 z-[1100] lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label="Favourite theatres"
      >
        <!-- Scrim — tap to return to the map (map stays visible beneath) -->
        <div class="absolute inset-0 bg-bg/70 backdrop-blur-sm" @click="open = false" />

        <Transition
          enter-active-class="transition-transform duration-300 ease-out"
          enter-from-class="translate-y-full"
          leave-active-class="transition-transform duration-200 ease-in"
          leave-to-class="translate-y-full"
        >
          <div class="absolute inset-x-0 bottom-0 p-3">
            <div class="relative flex max-h-[72dvh] flex-col rounded-2xl border border-reel bg-bg-alt p-4 pt-3 shadow-2xl">
              <div class="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-reel" aria-hidden="true" />
              <button
                class="btn-press absolute right-3 top-2 text-xl leading-none text-mist hover:text-paper"
                aria-label="Close favourites"
                @click="open = false"
              >
                ✕
              </button>

              <h2 class="pr-8 font-display text-lg leading-tight text-paper">
                Favourite theatres
                <span v-if="favouriteCinemas.length" class="ml-1 text-xs font-normal text-mist">
                  · {{ favouriteCinemas.length }}
                </span>
              </h2>

              <div class="scroll-slim mt-3 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1">
                <TicketCard
                  v-for="c in favouriteCinemas"
                  :key="c.id"
                  :cinema="c"
                  show-city
                  @select="openCinema(c.id)"
                  @contribute="contributeFor(c)"
                  @rate="contributeFor(c)"
                />
                <p
                  v-if="!favouriteCinemas.length"
                  class="rounded-xl bg-bg-alt2 p-6 text-center"
                >
                  <span class="block font-display text-base text-paper">No favourite theatres yet</span>
                  <span class="mt-1.5 block text-xs leading-relaxed text-mist">
                    Tap the ♡ beside a theatre's name in the list to save it here — your favourites
                    follow your account across devices.
                  </span>
                </p>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
