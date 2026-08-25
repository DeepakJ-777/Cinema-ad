<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'

const { signOutModalOpen, closeSignOutModal } = useCinemaStore()
const { user, signOut } = useAuth()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && signOutModalOpen.value) {
    closeSignOutModal()
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

async function handleSignOut() {
  closeSignOutModal()
  await signOut()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="pop">
      <div
        v-if="signOutModalOpen && user"
        class="fixed inset-0 z-[9999] grid place-items-center overflow-y-auto p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm Sign Out"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-bg/80 backdrop-blur-sm" @click="closeSignOutModal" />

        <!-- Modal Card -->
        <div class="modal-card relative w-full max-w-sm rounded-2xl border border-reel bg-bg-alt p-6 text-paper shadow-2xl">
          <!-- Header -->
          <div class="flex items-start justify-between">
            <h2 class="font-display text-xl leading-tight text-paper">
              Sign out?
            </h2>
            <button
              class="btn-press text-xl leading-none text-mist hover:text-paper"
              aria-label="Close"
              @click="closeSignOutModal"
            >
              ✕
            </button>
          </div>

          <!-- User Details Badge -->
          <div class="mt-4 flex items-center gap-3 rounded-xl border border-reel bg-bg-alt2 p-3">
            <div class="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-marquee/40 bg-bg font-display text-base font-bold text-marquee">
              {{ user.name?.[0] || '?' }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-semibold text-paper">{{ user.name }}</p>
              <p class="truncate text-xs text-mist">{{ user.email }}</p>
            </div>
          </div>

          <!-- Explanatory note -->
          <p class="mt-3 text-xs leading-relaxed text-mist">
            Browsing showtimes and ad countdowns remains completely free. You can sign back in with Google anytime to access your saved favourites and submit ratings.
          </p>

          <!-- Actions -->
          <div class="mt-6 flex items-center gap-2.5">
            <button
              type="button"
              class="btn-press flex-1 rounded-lg border border-reel bg-bg px-4 py-2.5 text-xs font-semibold text-paper hover:border-mist hover:text-white"
              @click="closeSignOutModal"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn-press flex-1 rounded-lg border border-red-500/30 bg-red-500/15 px-4 py-2.5 text-xs font-semibold text-red-400 hover:bg-red-500 hover:text-white transition-colors"
              @click="handleSignOut"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
