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
      'sticky top-0 z-40 transition-colors duration-300',
      scrolled ? 'border-b border-reel/70 bg-bg/85 backdrop-blur-md' : 'bg-transparent',
    ]"
  >
    <nav class="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
      <NuxtLink to="/" aria-label="ShowStart home" class="flex shrink-0 items-center gap-2.5" @click="goHome">
        <span class="grid h-8 w-8 place-items-center rounded-lg bg-marquee">
          <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="#101010" stroke-width="1.8" aria-hidden="true">
            <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
            <path d="M3.5 9h17M8 5.5v3.5M16 5.5v3.5" stroke-linecap="round" />
            <path d="M10.2 12.4l4 2.1-4 2.1z" fill="#101010" stroke="none" />
          </svg>
        </span>
        <span class="font-display text-[15px] font-bold tracking-wider text-paper">
          SHOWSTART<span class="text-marquee">·</span>IN
        </span>

      </NuxtLink>

      <!-- Account stays inline on desktop; on mobile it moves into the ☰ menu -->
      <div class="ml-auto hidden items-center gap-3 lg:flex">
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
        class="btn-press ml-auto grid h-8 w-8 place-items-center rounded-lg border border-reel bg-bg-alt2 text-paper hover:border-marquee hover:text-marquee lg:hidden"
        :aria-expanded="menuOpen"
        aria-label="Open menu"
        @click="menuOpen = !menuOpen"
      >
        <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>
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

        <p class="px-3 pb-1 pt-1 font-mono text-[10px] uppercase tracking-widest text-mist">Explore</p>
        <a
          href="#how"
          class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-paper hover:bg-bg-alt2"
          role="menuitem"
          @click="menuOpen = false"
        >
          How it works
        </a>
        <a
          href="#about"
          class="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm text-paper hover:bg-bg-alt2"
          role="menuitem"
          @click="menuOpen = false"
        >
          About ShowStart
        </a>
      </div>
    </Transition>
  </header>

</template>
