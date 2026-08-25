import { watch } from 'vue'
import type { Cinema } from '~/types'

/**
 * User-specific favourite theatres, backed by /api/favourites (D1 records —
 * persisted per account, not localStorage). The id list is loaded once per
 * session and shared through useState, so every heart in the app reads the
 * same state; toggles are optimistic and revert on backend errors.
 */
export function useFavourites() {
  const ids = useState<string[]>('cc:fav-ids', () => [])
  const loaded = useState('cc:fav-loaded', () => false)
  const { user } = useAuth()
  const toast = useToast()
  const { openAuthModal } = useCinemaStore()

  /** Fetch the user's favourite cinema ids once (guarded — safe to call often). */
  async function load() {
    if (!user.value || loaded.value) return
    try {
      const res = await $fetch<{ favourites: string[] }>('/api/favourites')
      ids.value = res.favourites
      loaded.value = true
    }
    catch {
      // Non-fatal — hearts render neutral until the next attempt.
    }
  }

  function isFavourite(id: string) {
    return ids.value.includes(id)
  }

  async function toggle(cinema: Cinema) {
    if (!user.value) {
      toast.push('Sign in to save favourite theatres')
      openAuthModal()
      return
    }
    const wasFav = ids.value.includes(cinema.id)
    // Optimistic flip so the heart feels instant; revert on backend error.
    ids.value = wasFav ? ids.value.filter(i => i !== cinema.id) : [...ids.value, cinema.id]
    try {
      if (wasFav) {
        await $fetch(`/api/favourites?cinemaId=${encodeURIComponent(cinema.id)}`, { method: 'DELETE' })
      }
      else {
        await $fetch('/api/favourites', { method: 'POST', body: { cinemaId: cinema.id } })
      }
    }
    catch {
      ids.value = wasFav ? [...ids.value, cinema.id] : ids.value.filter(i => i !== cinema.id)
      toast.push('Could not save favourite — try again')
    }
  }

  // Session changes: favourites are per-account — clear on sign-out, reload on
  // sign-in. (Multiple component instances register this; the work is guarded.)
  watch(user, (u) => {
    ids.value = []
    loaded.value = false
    if (u) load()
  })

  return { ids, loaded, load, isFavourite, toggle }
}
