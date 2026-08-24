<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
const { authModalOpen, closeAuthModal } = useCinemaStore()
function onKey(e: KeyboardEvent) { if (e.key === 'Escape') closeAuthModal() }
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="pop">
      <div v-if="authModalOpen" class="fixed inset-0 z-[9999] grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true">
        <div class="absolute inset-0 bg-bg/80 backdrop-blur-sm" @click="closeAuthModal" />

        <div class="modal-card relative w-full max-w-md rounded-xl border border-reel bg-bg-alt p-6 text-paper shadow-2xl">
          <div class="flex items-start justify-between">
            <h2 class="font-display text-xl">Welcome back</h2>
            <button class="btn-press text-xl leading-none text-mist hover:text-paper" aria-label="Close" @click="closeAuthModal">✕</button>
          </div>
          <p class="mt-1 text-[11px] font-medium uppercase tracking-wider text-mist">Browsing is free — accounts are for contributing.</p>
          <div class="mt-6"><AuthForms @success="closeAuthModal" /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
