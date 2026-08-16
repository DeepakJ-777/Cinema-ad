import { computed } from 'vue'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient()

export function useAuth() {
  const toast = useToast()
  // useSession() returns a Ref of { data, error, isPending } — don't destructure it.
  const session = authClient.useSession()
  const user = computed(() => session.value?.data?.user ?? null)
  const isPending = computed(() => session.value?.isPending ?? false)

  async function signIn(email: string, password: string) {
    const { error } = await authClient.signIn.email({ email, password })
    if (!error) toast.push(`👋 Welcome back!`)
    return error
  }
  async function signUp(name: string, email: string, password: string) {
    const { error } = await authClient.signUp.email({ name, email, password })
    if (!error) toast.push(`🎭 Account created — welcome, ${name}!`)
    return error
  }
  async function signOut() {
    await authClient.signOut()
    toast.push('Signed out — browsing stays free, forever.')
  }
  return { user, isPending, signIn, signUp, signOut }
}
