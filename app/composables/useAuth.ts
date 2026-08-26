import { computed } from 'vue'
import { createAuthClient } from 'better-auth/vue'

export const authClient = createAuthClient()

export function useAuth() {
  const toast = useToast()
  // useSession() returns a Ref of { data, error, isPending } — don't destructure it.
  const session = authClient.useSession()
  const user = computed(() => session.value?.data?.user ?? null)
  const isPending = computed(() => session.value?.isPending ?? false)

  async function signInWithGoogle() {
    try {
      const callbackURL = typeof window !== 'undefined' ? window.location.href : '/'
      const res = await authClient.signIn.social({
        provider: 'google',
        callbackURL,
      })
      if (res?.error) {
        toast.push(res.error.message || 'Google sign-in failed — please try again')
        return res.error
      }
      return null
    }
    catch (err: any) {
      const msg = err?.message || 'Failed to connect to Google sign-in'
      toast.push(msg)
      return { message: msg }
    }
  }
  async function signInWithEmail(email: string, password: string) {
    try {
      const res = await authClient.signIn.email({
        email,
        password,
      })
      if (res?.error) {
        toast.push(res.error.message || 'Sign in failed')
        return res.error
      }
      toast.push('Signed in successfully!')
      return null
    }
    catch (err: any) {
      const msg = err?.message || 'Sign in failed'
      toast.push(msg)
      return { message: msg }
    }
  }

  async function signUpWithEmail(name: string, email: string, password: string) {
    try {
      const res = await authClient.signUp.email({
        name,
        email,
        password,
      })
      if (res?.error) {
        toast.push(res.error.message || 'Sign up failed')
        return res.error
      }
      toast.push('Account created and signed in!')
      return null
    }
    catch (err: any) {
      const msg = err?.message || 'Sign up failed'
      toast.push(msg)
      return { message: msg }
    }
  }

  async function signOut() {
    await authClient.signOut()
    toast.push('Signed out — browsing stays free, forever.')
  }
  return { user, isPending, signInWithGoogle, signInWithEmail, signUpWithEmail, signOut }
}
