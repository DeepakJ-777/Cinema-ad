<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const { openAuthModal } = useCinemaStore()
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
</script>


<template>
  <header
    :class="[
      'sticky top-0 z-40 transition-colors duration-300',
      scrolled ? 'border-b border-reel/70 bg-bg/85 backdrop-blur-md' : 'bg-transparent',
    ]"
  >
    <nav class="flex w-full items-center gap-3 px-4 py-3 sm:px-6">
      <a href="#top" class="flex shrink-0 items-center gap-2.5">
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

      </a>

      <div class="ml-auto flex items-center gap-3">
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
            @click="signOut()"
          >
            {{ user.name[0] }}
          </button>
        </div>
      </div>
    </nav>
  </header>

</template>
