<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const { openAuthModal, openSignOutModal } = useCinemaStore()
const { user } = useAuth()
const route = useRoute()

const scrolled = ref(false)
function onScroll() {
  scrolled.value = window.scrollY > 24
}
// Logo goes to Home (the map screen). NuxtLink ignores same-route clicks,
// so scroll back to the top explicitly when we're already there.
function goHome() {
  menuOpen.value = false
  if (route.path === '/') window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** Mobile secondary menu (☰). State lives in a shared useState so the mobile
 *  bottom nav's Account action can open the same existing menu. */
const menuOpen = useState('cc:nav-menu', () => false)
const headerEl = ref<HTMLElement | null>(null)

function onDocPointerDown(e: PointerEvent) {
  if (menuOpen.value && headerEl.value && !headerEl.value.contains(e.target as Node)) {
    menuOpen.value = false
  }
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') menuOpen.value = false
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('pointerdown', onDocPointerDown)
  window.addEventListener('keydown', onKey)
  onScroll()
})
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
  document.removeEventListener('pointerdown', onDocPointerDown)
  window.removeEventListener('keydown', onKey)
})
</script>


<template>
  <header
    ref="headerEl"
    :class="[
      'sticky top-0 z-[1200] transition-colors duration-300',
      scrolled || route.path === '/map' ? 'border-b border-reel/70 bg-bg/90 backdrop-blur-md' : 'bg-transparent',
    ]"
  >
    <nav class="flex w-full items-center justify-between gap-2 px-3 py-2.5 sm:px-6 sm:py-3">
      <!-- Left: Brand Logo -->
      <NuxtLink to="/" aria-label="ShowStart home" class="flex shrink-0 items-center gap-2" @click="goHome">
        <span class="grid h-8 w-8 place-items-center rounded-lg bg-marquee shrink-0">
          <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="#101010" stroke-width="1.8" aria-hidden="true">
            <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
            <path d="M3.5 9h17M8 5.5v3.5M16 5.5v3.5" stroke-linecap="round" />
            <path d="M10.2 12.4l4 2.1-4 2.1z" fill="#101010" stroke="none" />
          </svg>
        </span>
        <span class="font-display text-[13px] sm:text-[15px] font-bold tracking-wider text-paper">
          SHOWSTART<span class="text-marquee">·IN</span>
        </span>
      </NuxtLink>

      <!-- Center (Mobile only): Sleek Top Page Switcher (Home ↔ Map) -->
      <div class="flex items-center rounded-xl border border-reel bg-bg-alt2/90 p-0.5 md:hidden" role="navigation" aria-label="Mobile page switcher">
        <NuxtLink
          to="/"
          :class="[
            'btn-press flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors',
            route.path === '/'
              ? 'bg-marquee text-ink shadow'
              : 'text-mist hover:text-paper',
          ]"
          @click="goHome"
        >
          <span>Home</span>
        </NuxtLink>
        <NuxtLink
          to="/map"
          :class="[
            'btn-press flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors',
            route.path === '/map'
              ? 'bg-marquee text-ink shadow'
              : 'text-mist hover:text-paper',
          ]"
        >
          <span>Map</span>
        </NuxtLink>
      </div>

      <!-- Desktop Navigation Links -->
      <div class="hidden items-center gap-1.5 md:flex md:ml-4">
        <NuxtLink
          to="/"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors"
          :class="route.path === '/' ? 'bg-bg-alt text-marquee' : 'text-mist hover:text-paper'"
          @click="goHome"
        >
          Home
        </NuxtLink>
        <NuxtLink
          to="/map"
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors"
          :class="route.path === '/map' ? 'bg-bg-alt text-marquee' : 'text-mist hover:text-paper'"
        >
          <svg viewBox="0 0 24 24" class="h-3.5 w-3.5" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M12 21.5s-6.5-5.6-6.5-10.5a6.5 6.5 0 1 1 13 0c0 4.9-6.5 10.5-6.5 10.5z" stroke-linecap="round" stroke-linejoin="round" />
            <circle cx="12" cy="10.5" r="2.3" />
          </svg>
          <span>Live Map</span>
        </NuxtLink>
        <NuxtLink
          to="/#how"
          class="rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-mist transition-colors hover:text-paper"
        >
          How It Works
        </NuxtLink>
      </div>

      <!-- Right: Account / ☰ menu -->
      <div class="flex items-center gap-2">
        <div class="hidden items-center gap-3 lg:flex">
          <button
            v-if="!user"
            class="btn-press rounded-lg bg-marquee px-4 py-1.5 text-sm font-semibold text-ink hover:bg-curtain-bright"
            @click="openAuthModal()"
          >
            Sign in
          </button>
          <div v-else class="flex items-center gap-2">
            <span class="hidden text-xs font-medium text-mist sm:inline">● {{ user.name }}</span>
            <button
              :title="`Sign out ${user.name}`"
              class="btn-press grid h-8 w-8 place-items-center rounded-full border border-reel bg-bg-alt2 font-display text-sm text-marquee hover:border-marquee"
              @click="openSignOutModal()"
            >
              {{ user.name[0] }}
            </button>
          </div>
        </div>

        <!-- Mobile ☰ — secondary navigation -->
        <button
          type="button"
          class="btn-press grid h-8 w-8 place-items-center rounded-lg border border-reel bg-bg-alt2 text-paper hover:border-marquee hover:text-marquee lg:hidden"
          :aria-expanded="menuOpen"
          aria-label="Open menu"
          @click="menuOpen = !menuOpen"
        >
          <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>
    </nav>

    <!-- Mobile secondary menu panel (account + info) -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="menuOpen"
        class="absolute right-2 top-full mt-1.5 w-64 rounded-xl border border-reel bg-bg-alt p-2 shadow-2xl lg:hidden"
        role="menu"
        aria-label="Secondary navigation"
      >
        <p class="px-3 pb-1 pt-2 font-mono text-[10px] uppercase tracking-widest text-mist">Account</p>
        <button
          v-if="!user"
          class="btn-press flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-semibold text-paper hover:bg-bg-alt2"
          role="menuitem"
          @click="openAuthModal(); menuOpen = false"
        >
          Sign in
        </button>
        <template v-else>
          <p class="flex items-center gap-2 px-3 py-2 text-xs text-mist">● {{ user.name }}</p>
          <button
            class="btn-press flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-paper hover:bg-bg-alt2"
            role="menuitem"
            @click="openSignOutModal(); menuOpen = false"
          >
            Sign out
          </button>
        </template>

        <div class="my-2 h-px bg-reel" />

        <p class="px-3 pb-1 pt-1 font-mono text-[10px] uppercase tracking-widest text-mist">Navigation</p>
        <NuxtLink
          to="/"
          class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-paper hover:bg-bg-alt2"
          role="menuitem"
          @click="menuOpen = false"
        >
          Home
        </NuxtLink>
        <NuxtLink
          to="/map"
          class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-paper hover:bg-bg-alt2"
          role="menuitem"
          @click="menuOpen = false"
        >
          Live Map
        </NuxtLink>
        <NuxtLink
          to="/#how"
          class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-paper hover:bg-bg-alt2"
          role="menuitem"
          @click="menuOpen = false"
        >
          How it works
        </NuxtLink>
        <NuxtLink
          to="/#about"
          class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-paper hover:bg-bg-alt2"
          role="menuitem"
          @click="menuOpen = false"
        >
          About ShowStart
        </NuxtLink>
      </div>
    </Transition>
  </header>

</template>
