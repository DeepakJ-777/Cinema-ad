<script setup lang="ts">
import { ref } from 'vue'
const emit = defineEmits<{ success: [] }>()
const { signIn, signUp } = useAuth()
const mode = ref<'signin' | 'signup'>('signin')
const name = ref(''), email = ref(''), password = ref('')
const busy = ref(false), errorMsg = ref('')

async function submit() {
  if (busy.value) return
  busy.value = true; errorMsg.value = ''
  // signIn/signUp return the error object directly (null on success)
  const error = mode.value === 'signin'
    ? await signIn(email.value.trim(), password.value)
    : await signUp(name.value.trim(), email.value.trim(), password.value)
  busy.value = false
  if (error) { errorMsg.value = error.message ?? 'Something went wrong'; return }
  emit('success')
}
</script>

<template>
  <div class="mx-auto w-full max-w-sm">
    <div class="flex justify-center gap-1 font-mono text-[11px] uppercase tracking-widest">
      <button :class="['rounded-full px-3 py-1', mode === 'signin' ? 'bg-ink text-paper' : 'text-ink/60']" @click="mode = 'signin'">Sign in</button>
      <button :class="['rounded-full px-3 py-1', mode === 'signup' ? 'bg-ink text-paper' : 'text-ink/60']" @click="mode = 'signup'">Create account</button>
    </div>
    <form class="mt-4 space-y-3" @submit.prevent="submit">
      <input v-if="mode === 'signup'" v-model="name" required placeholder="Your name"
        class="w-full rounded-lg border border-ink/25 bg-white/60 px-3 py-2 text-sm focus:border-curtain focus:outline-none" />
      <input v-model="email" type="email" required placeholder="Email"
        class="w-full rounded-lg border border-ink/25 bg-white/60 px-3 py-2 text-sm focus:border-curtain focus:outline-none" />
      <input v-model="password" type="password" required minlength="8" placeholder="Password (8+ characters)"
        class="w-full rounded-lg border border-ink/25 bg-white/60 px-3 py-2 text-sm focus:border-curtain focus:outline-none" />
      <p v-if="errorMsg" class="font-mono text-xs text-curtain-bright">{{ errorMsg }}</p>
      <button type="submit" :disabled="busy"
        class="btn-press w-full rounded-full bg-marquee py-2.5 text-sm font-bold text-ink hover:bg-ink hover:text-paper disabled:opacity-50">
        {{ busy ? '…' : mode === 'signin' ? 'Sign in' : 'Create account' }}
      </button>
    </form>
  </div>
</template>
