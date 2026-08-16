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
      <div v-if="authModalOpen" class="fixed inset-0 z-[60] grid place-items-center overflow-y-auto p-4" role="dialog" aria-modal="true">
        <div class="absolute inset-0 bg-bg/80 backdrop-blur-sm" @click="closeAuthModal" />
        <div class="modal-card relative w-full max-w-md rounded-2xl bg-paper p-6 text-ink shadow-2xl">
          <div class="flex items-start justify-between">
            <h2 class="font-display text-3xl tracking-wide">WELCOME BACK</h2>
            <button class="btn-press text-xl leading-none text-ink/50 hover:text-ink" aria-label="Close" @click="closeAuthModal">✕</button>
          </div>
          <p class="mt-1 font-mono text-[11px] uppercase tracking-wider text-ink/60">Browsing is free — accounts are for contributing.</p>
          <div class="mt-6"><AuthForms @success="closeAuthModal" /></div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
