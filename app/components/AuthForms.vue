<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ success: [] }>()
const { signInWithGoogle, signInWithEmail, signUpWithEmail } = useAuth()

const authMode = ref<'google' | 'email'>('google')
const isSignUp = ref(false)
const googleBusy = ref(false)
const formBusy = ref(false)
const errorMsg = ref('')

const name = ref('')
const email = ref('')
const password = ref('')

async function handleGoogle() {
  if (googleBusy.value) return
  googleBusy.value = true
  errorMsg.value = ''
  const error = await signInWithGoogle()
  if (error) {
    googleBusy.value = false
    errorMsg.value = error.message ?? 'Google sign-in failed — please try again.'
  } else {
    emit('success')
  }
}

async function handleEmailAuth() {
  if (formBusy.value) return
  errorMsg.value = ''
  formBusy.value = true

  let err: any = null
  if (isSignUp.value) {
    if (!name.value.trim()) {
      errorMsg.value = 'Please enter your name'
      formBusy.value = false
      return
    }
    err = await signUpWithEmail(name.value.trim(), email.value.trim(), password.value)
  } else {
    err = await signInWithEmail(email.value.trim(), password.value)
  }

  formBusy.value = false
  if (err) {
    errorMsg.value = err.message || 'Authentication failed'
  } else {
    emit('success')
  }
}
</script>

<template>
  <div class="mx-auto w-full max-w-sm space-y-4">
    <!-- Google OAuth CTA -->
    <button
      type="button"
      :disabled="googleBusy || formBusy"
      class="btn-press flex w-full items-center justify-center gap-3 rounded-xl border border-reel bg-bg-alt2 py-2.5 text-sm font-semibold text-paper transition-colors hover:border-marquee hover:text-marquee disabled:opacity-50"
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

    <!-- Divider -->
    <div class="relative flex items-center justify-center">
      <div class="w-full border-t border-reel" />
      <span class="absolute bg-bg-alt2 px-3 text-[11px] uppercase tracking-wider text-mist">or with email</span>
    </div>

    <!-- Email Form -->
    <form class="space-y-3" @submit.prevent="handleEmailAuth">
      <div v-if="isSignUp">
        <label class="block text-[11px] font-semibold uppercase tracking-wider text-mist">Name</label>
        <input
          v-model="name"
          type="text"
          placeholder="e.g. John Doe"
          required
          class="mt-1 w-full rounded-xl border border-reel bg-bg-alt px-3.5 py-2 text-xs text-paper placeholder:text-mist/40 focus:border-marquee focus:outline-none"
        />
      </div>

      <div>
        <label class="block text-[11px] font-semibold uppercase tracking-wider text-mist">Email</label>
        <input
          v-model="email"
          type="email"
          placeholder="your@email.com"
          required
          class="mt-1 w-full rounded-xl border border-reel bg-bg-alt px-3.5 py-2 text-xs text-paper placeholder:text-mist/40 focus:border-marquee focus:outline-none"
        />
      </div>

      <div>
        <label class="block text-[11px] font-semibold uppercase tracking-wider text-mist">Password</label>
        <input
          v-model="password"
          type="password"
          placeholder="••••••••"
          required
          minlength="6"
          class="mt-1 w-full rounded-xl border border-reel bg-bg-alt px-3.5 py-2 text-xs text-paper placeholder:text-mist/40 focus:border-marquee focus:outline-none"
        />
      </div>

      <p v-if="errorMsg" class="text-center text-xs font-medium text-marquee">{{ errorMsg }}</p>

      <button
        type="submit"
        :disabled="formBusy || googleBusy"
        class="btn-press w-full rounded-xl bg-marquee py-2.5 text-xs font-bold text-ink shadow transition-all hover:bg-curtain-bright disabled:opacity-50"
      >
        {{ formBusy ? 'Please wait…' : isSignUp ? 'Create Account & Sign In' : 'Sign In with Email' }}
      </button>
    </form>

    <!-- Toggle Sign In / Sign Up -->
    <div class="text-center">
      <button
        type="button"
        class="text-xs text-mist hover:text-paper"
        @click="isSignUp = !isSignUp; errorMsg = ''"
      >
        {{ isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Create one" }}
      </button>
    </div>
  </div>
</template>
