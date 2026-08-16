import { computed } from 'vue'
import type { Cinema, CityId, Movie, Showtime } from '~/types'
import { CITIES } from '~/utils/cities'
import { haversineKm } from '~/utils/geo'

export interface ContributeTarget {
  cinema: Cinema
  movie?: Movie
  showtime?: Showtime
}

export interface ContributionInput {
  cinemaId: string
  movieId?: string
  showId?: string
  minutes?: number
  overall?: number
  ambience?: number
  staff?: number
  movieExperience?: number
  foodBeverages?: number
  valueForMoney?: number
  review?: string
}

interface Payload {
  cinemas: Cinema[]
  meta: { adReports: number; ratings: number; contributors?: number }
}

export function useCinemaStore() {
  const city = useState<CityId>('cc:city', () => 'kochi')
  const selectedCinemaId = useState<string | null>('cc:sel', () => null)
  const search = useState('cc:search', () => '')
  const minRating = useState('cc:min-rating', () => 0)
  const userLocation = useState<{ lat: number; lng: number } | null>('cc:loc', () => null)
  const sortByDistance = useState('cc:near', () => false)
  const locating = useState('cc:locating', () => false)
  const showContribute = useState('cc:contrib-open', () => false)
  const contributeTarget = useState<ContributeTarget | null>('cc:contrib-target', () => null)
  const authModalOpen = useState('cc:auth-open', () => false)
  const toast = useToast()

  const { data, pending, error, refresh } = useFetch<Payload>('/api/cinemas', {
    key: 'cc-cinemas',
    query: { city },
    default: () => ({ cinemas: [], meta: { adReports: 0, ratings: 0, contributors: 0 } }),
  })

  const cinemas = computed(() => data.value?.cinemas ?? [])
  const meta = computed(() => data.value?.meta ?? { adReports: 0, ratings: 0, contributors: 0 })

  const filteredCinemas = computed(() => {
    const q = search.value.trim().toLowerCase()
    let list = cinemas.value.filter((c) => {
      if (!q) return true
      return (
        c.name.toLowerCase().includes(q)
        || c.address.toLowerCase().includes(q)
        || c.movies.some(m => m.title.toLowerCase().includes(q))
      )
    })
    if (minRating.value > 0)
      list = list.filter(c => c.overall != null && c.overall >= minRating.value)
    if (sortByDistance.value && userLocation.value) {
      const origin = userLocation.value
      list = [...list].sort((a, b) => haversineKm(origin, a) - haversineKm(origin, b))
    }
    return list
  })

  const activeCinema = computed(
    () => cinemas.value.find(c => c.id === selectedCinemaId.value) ?? cinemas.value[0] ?? null,
  )

  function setCity(id: CityId) {
    city.value = id
    selectedCinemaId.value = null
  }

  function selectCinema(id: string, opts?: { scroll?: boolean }) {
    selectedCinemaId.value = id
    if (opts?.scroll && import.meta.client) {
      requestAnimationFrame(() => {
        document.getElementById('cinema-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    }
  }

  function distanceTo(c: Cinema): number | null {
    if (!userLocation.value) return null
    return haversineKm(userLocation.value, c)
  }

  /** Toggles "near me" sorting: first tap requests location, second tap turns it off. */
  function requestLocation() {
    if (!import.meta.client || !('geolocation' in navigator)) {
      toast.push('📡 Location is not available on this device')
      return
    }
    if (sortByDistance.value) {
      sortByDistance.value = false
      return
    }
    if (locating.value) return
    locating.value = true
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLocation.value = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        sortByDistance.value = true
        locating.value = false
        toast.push('📡 Sorted by distance from you')
      },
      () => {
        locating.value = false
        toast.push('Could not get your location — check browser permissions')
      },
      { timeout: 8000, maximumAge: 60000 },
    )
  }

  function openContribute(target: ContributeTarget) {
    contributeTarget.value = target
    showContribute.value = true
  }

  function closeContribute() {
    showContribute.value = false
  }

  function openAuthModal() {
    authModalOpen.value = true
  }

  function closeAuthModal() {
    authModalOpen.value = false
  }

  async function submitContribution(input: ContributionInput): Promise<boolean> {
    try {
      if (input.showId && input.minutes != null) {
        await $fetch('/api/ad-reports', {
          method: 'POST',
          body: { showId: input.showId, minutes: input.minutes },
        })
      }
      const hasRating = ['overall', 'ambience', 'staff', 'movieExperience', 'foodBeverages', 'valueForMoney']
        .some(k => Number(input[k as keyof ContributionInput]) > 0)
      if (hasRating || (input.review && input.review.trim())) {
        await $fetch('/api/ratings', { method: 'POST', body: input })
      }
      await refresh()
      toast.push('🎉 Thanks! Community aggregates updated live.')
      return true
    }
    catch (e: any) {
      toast.push(e?.statusMessage || e?.data?.statusMessage || 'Could not submit — are you signed in?')
      return false
    }
  }

  return {
    city, cities: CITIES, search, minRating, selectedCinemaId, userLocation, sortByDistance, locating,
    showContribute, contributeTarget, authModalOpen, cinemas, filteredCinemas, activeCinema,
    meta, pending, error, setCity, selectCinema, distanceTo, requestLocation,
    openContribute, closeContribute, openAuthModal, closeAuthModal, submitContribution,
    refreshCinemas: refresh,
  }
}
