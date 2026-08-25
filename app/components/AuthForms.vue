<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ success: [] }>()
const { signInWithGoogle } = useAuth()
const googleBusy = ref(false), errorMsg = ref('')

async function handleGoogle() {
  if (googleBusy.value) return
  googleBusy.value = true
  errorMsg.value = ''
  const error = await signInWithGoogle()
  if (error) {
    googleBusy.value = false
    errorMsg.value = error.message ?? 'Google sign-in failed — please try again.'
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-sm space-y-4">
    <p class="text-xs leading-relaxed text-mist">
      Use your Google account to save favourites, rate theatres, and contribute AD data.
    </p>

    <!-- Google OAuth CTA -->
    <button
      type="button"
      :disabled="googleBusy"
      class="btn-press flex w-full items-center justify-center gap-3 rounded-lg border border-reel bg-bg-alt2 py-2.5 text-sm font-semibold text-paper transition-colors hover:border-marquee hover:text-marquee disabled:opacity-50"
      @click="handleGoogle"
    >
      <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 5c1.6 0 3 .6 4.1 1.7l3.1-3.1C17.3 1.8 14.8 1 12 1 7.5 1 3.7 3.6 1.9 7.3l3.7 2.9C6.5 7.4 9 5 12 5z" />
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.6h6.5c-.3 1.5-1.1 2.8-2.4 3.7l3.7 2.9c2.2-2 3.7-5 3.7-8.9z" />
        <path fill="#FBBC05" d="M5.6 14.8c-.2-.7-.4-1.5-.4-2.3s.2-1.6.4-2.3L1.9 7.3C.7 9.7 0 12.3 0 15.2c0 2.8.7 5.5 1.9 7.9l3.7-2.9z" />
        <path fill="#34A853" d="M12 23.5c3.2 0 6-1.1 8-3l-3.7-2.9c-1.1.7-2.5 1.2-4.3 1.2-3 0-5.5-2.4-6.4-5.2L1.9 16.5C3.7 20.2 7.5 23.5 12 23.5z" />
      </svg>
      <span>{{ googleBusy ? 'Connecting to Google…' : 'Continue with Google' }}</span>
    </button>

    <p v-if="errorMsg" class="text-center text-xs font-medium text-marquee">{{ errorMsg }}</p>
  </div>
</template>
