<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { City } from '~/types'

const { city, setCity, cities, search, openAuthModal } = useCinemaStore()
const { user, signOut } = useAuth()

const scrolled = ref(false)
function onScroll() {
  scrolled.value = window.scrollY > 24
}
onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true })
  onScroll()
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))

const cityList = Object.values(cities) as City[]
</script>

<template>
  <header
    :class="[
      'sticky top-0 z-40 transition-colors duration-300',
      scrolled ? 'border-b border-reel/70 bg-bg/80 backdrop-blur-md' : 'bg-transparent',
    ]"
  >
    <nav class="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
      <a href="#top" class="flex shrink-0 items-center gap-2.5">
        <span class="grid h-9 w-9 place-items-center rounded-lg bg-marquee text-lg text-ink shadow-[0_0_16px_rgba(232,181,77,0.35)]">
          🎬
        </span>
        <span class="font-display text-xl leading-none tracking-wide text-paper">
          CINEMA<span class="text-marquee">·</span>COMMUNITY
        </span>
      </a>

      <div class="ml-auto flex items-center gap-2 sm:gap-3">
        <label class="relative hidden md:block">
          <input
            v-model="search"
            type="search"
            placeholder="Search cinemas…"
            class="w-44 rounded-full border border-reel bg-bg-alt py-1.5 pl-8 pr-3 text-sm text-paper placeholder:text-mist/60 focus:border-marquee focus:outline-none"
          />
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs opacity-70">🔍</span>
        </label>

        <div class="flex rounded-full border border-reel bg-bg-alt p-1">
          <button
            v-for="c in cityList"
            :key="c.id"
            :class="[
              'btn-press rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-widest transition-colors',
              city === c.id ? 'bg-marquee font-semibold text-ink' : 'text-mist hover:text-paper',
            ]"
            @click="setCity(c.id)"
          >
            {{ c.name }}
          </button>
        </div>

        <button
          v-if="!user"
          class="btn-press rounded-full bg-marquee px-4 py-1.5 text-sm font-bold text-ink hover:bg-paper"
          @click="openAuthModal()"
        >
          Sign in
        </button>
        <div v-else class="flex items-center gap-2">
          <span class="hidden font-mono text-xs text-sage sm:inline">● {{ user.name }}</span>
          <button
            :title="`Sign out ${user.name}`"
            class="btn-press grid h-8 w-8 place-items-center rounded-full border border-reel bg-bg-alt2 font-display text-marquee hover:border-marquee"
            @click="signOut()"
          >
            {{ user.name[0] }}
          </button>
        </div>
      </div>
    </nav>
  </header>
</template>
