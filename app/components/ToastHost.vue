<script setup lang="ts">
const { message } = useToast()
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="message"
        class="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-marquee/60 bg-bg-alt2 px-5 py-2.5 text-sm text-paper shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
        role="status"
      >
        {{ message }}
      </div>
    </Transition>
  </Teleport>
</template>
