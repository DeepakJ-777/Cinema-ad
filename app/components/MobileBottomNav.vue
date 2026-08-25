<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

/**
 * Mobile-only fixed bottom navigation (lg:hidden — desktop keeps the existing
 * header nav). Five slots: Map · Search · Add (raised center action) ·
 * Favourites · Account. Every item reuses an existing flow:
 *   Map      → the map-first home (scroll to top of /)
 *   Search   → focus the existing cinema search input
 *   Add      → existing contribute modal for the selected cinema (interim)
 *   Favourites → toast (no favourites feature yet — nothing invented)
 *   Account  → existing AuthModal / the existing ☰ account menu
 */
const route = useRoute()
const { openAuthModal, openContribute, selectedCinemaId, activeCinema } = useCinemaStore()
const { user } = useAuth()
const toast = useToast()
const menuOpen = useState('cc:nav-menu', () => false)
const favouritesOpen = useState('cc:fav-open', () => false)

/** Map is the "active section" while the map panel still fills the view. */
const mapActive = ref(true)
function onScroll() {
  const el = document.getElementById('discover-map')
  if (!el) return
  mapActive.value = el.getBoundingClientRect().bottom > window.innerHeight * 0.5
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))

function goMap() {
  if (route.path !== '/') {
    navigateTo('/')
    return
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goSearch() {
  const input = document.getElementById('cinema-search') as HTMLInputElement | null
  input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  input?.focus()
}

/** Interim: contribute for the cinema the user selected (marker/list tap);
 *  otherwise point at the cinema rows, which all carry contribute actions. */
function onAdd() {
  if (selectedCinemaId.value && activeCinema.value) {
    openContribute({ cinema: activeCinema.value })
    return
  }
  toast.push('Pick a cinema first — every row has Contribute AD data & Add rating')
  document.getElementById('cinema-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function goFavourites() {
  if (!user.value) {
    toast.push('Sign in to see your favourite theatres')
    openAuthModal()
    return
  }
  favouritesOpen.value = true
}

function goAccount() {
  if (user.value) menuOpen.value = true // existing ☰ account/profile menu
  else openAuthModal()
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-[900] flex w-full items-end border-t border-reel bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
    aria-label="Primary"
  >
    <!-- Map -->
    <button
      type="button"
      class="btn-press flex flex-1 flex-col items-center gap-1 px-1 py-1.5"
      :class="mapActive ? 'text-marquee' : 'text-mist hover:text-paper'"
      :aria-current="mapActive ? 'true' : undefined"
      @click="goMap"
    >
      <svg viewBox="0 0 24 24" class="h-[22px] w-[22px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="M12 21.5s-6.5-5.6-6.5-10.5a6.5 6.5 0 1 1 13 0c0 4.9-6.5 10.5-6.5 10.5z" stroke-linecap="round" stroke-linejoin="round" />
        <circle cx="12" cy="10.5" r="2.3" />
      </svg>
      <span class="text-[10px] font-medium uppercase tracking-wider">Map</span>
    </button>

    <!-- Search -->
    <button
      type="button"
      class="btn-press flex flex-1 flex-col items-center gap-1 px-1 py-1.5 text-mist hover:text-paper"
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
        class="btn-press -mt-4 grid h-11 w-11 place-items-center rounded-full bg-marquee text-ink ring-4 ring-bg hover:bg-curtain-bright"
        aria-label="Add contribution"
        @click="onAdd"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
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
  </nav>
</template>
