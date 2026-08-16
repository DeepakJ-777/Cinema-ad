import { computed } from 'vue'
import type { Cinema, CityId, Movie, Showtime } from '~/types'
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
  // 'all' default — no city restriction. The selector is a *browsing* filter;
  // Near Me is purely geographic and ignores it entirely.
  const city = useState<'all' | CityId>('cc:city', () => 'all')
  const selectedCinemaId = useState<string | null>('cc:sel', () => null)
  const search = useState('cc:search', () => '')
  const minRating = useState('cc:min-rating', () => 0)
  // Near-me lookup radius (km) — server-configurable, mirrored from the API response
  const nearRadiusKm = useState('cc:near-radius', () => 25)
  const userLocation = useState<{ lat: number; lng: number } | null>('cc:loc', () => null)
  const sortByDistance = useState('cc:near', () => false)
  const locating = useState('cc:locating', () => false)
  const showContribute = useState('cc:contrib-open', () => false)
  const contributeTarget = useState<ContributeTarget | null>('cc:contrib-target', () => null)
  const authModalOpen = useState('cc:auth-open', () => false)
  const toast = useToast()

  const { data, pending, error, refresh } = useFetch<Payload>('/api/cinemas', {
    key: 'cc-cinemas',
    // Load every city at once — "near me" can then consider cinemas across city
    // boundaries instead of only the active city toggle.
    query: { city: 'all' },
    default: () => ({ cinemas: [], meta: { adReports: 0, ratings: 0, contributors: 0 } }),
  })

  const cinemas = computed(() => data.value?.cinemas ?? [])
  const meta = computed(() => data.value?.meta ?? { adReports: 0, ratings: 0, contributors: 0 })

  const matchesTextRating = (c: Cinema) => {
    const q = search.value.trim().toLowerCase()
    if (q) {
      const hit = c.name.toLowerCase().includes(q)
        || c.address.toLowerCase().includes(q)
        || c.movies.some(m => m.title.toLowerCase().includes(q))
      if (!hit) return false
    }
    if (minRating.value > 0 && (c.overall == null || c.overall < minRating.value)) return false
    return true
  }

  /** True while the list is driven by the user's live location. */
  const nearMode = computed(() => sortByDistance.value && userLocation.value != null)

  const filteredCinemas = computed(() => {
    const base = cinemas.value.filter(matchesTextRating)
    if (nearMode.value) {
      const origin = userLocation.value!
      const dist = (c: Cinema) => haversineKm(origin, c)
      const sorted = [...base].sort((a, b) => dist(a) - dist(b))
      // Near Me is geographic only: cinemas within the radius, nearest first.
      // The two nearest are always kept so far-away users still see something.
      const nearby = sorted.filter(c => dist(c) <= nearRadiusKm.value)
      for (const c of sorted) {
        if (nearby.length >= 2) break
        if (!nearby.includes(c)) nearby.push(c)
      }
      return nearby
    }
    // Browse mode: city selector filters the list ('all' shows everything)
    let list = city.value === 'all' ? base : base.filter(c => c.city === city.value)
    if (city.value === 'all') {
      // Cinemas with community data first; bare OSM locations follow
      list = [...list].sort((a, b) => (b.movies.length > 0 ? 1 : 0) - (a.movies.length > 0 ? 1 : 0))
    }
    return list
  })

  const activeCinema = computed(
    () => cinemas.value.find(c => c.id === selectedCinemaId.value)
      ?? (nearMode.value
          ? filteredCinemas.value[0]
          : filteredCinemas.value.find(c => c.movies.length > 0) ?? filteredCinemas.value[0])
      ?? null,
  )

  /** Browsing a predefined city — mutually exclusive with Near Me. */
  function setCity(id: 'all' | CityId) {
    city.value = id
    selectedCinemaId.value = null
    if (id !== 'all') sortByDistance.value = false // explicit browse → leave near-me mode
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
      async (pos) => {
        userLocation.value = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        sortByDistance.value = true
        city.value = 'all' // near-me is geographic; clear the browse filter
        // Discover → save to D1 → reuse: the endpoint only hits Overpass when
        // this area has not been swept recently; repeat presses serve from D1.
        let added = 0
        let nearbyCount: number | null = null
        try {
          const res = await $fetch<{ added?: number, nearbyCount?: number, radiusKm?: number }>(
            '/api/cinemas/near',
            { query: { lat: userLocation.value.lat, lng: userLocation.value.lng } },
          )
          added = res.added ?? 0
          nearbyCount = res.nearbyCount ?? null
          if (res.radiusKm) nearRadiusKm.value = res.radiusKm
          if (added > 0) await refresh()
        }
        catch {
          // Overpass/DB hiccup — distance sorting over known cinemas still works
        }
        locating.value = false
        if (nearbyCount === 0)
          toast.push(`📡 No cinemas within ${nearRadiusKm.value} km yet — showing the nearest ones`)
        else if (added > 0)
          toast.push(`📡 ${added} cinemas near you added — sorted by distance`)
        else
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
      toast.push(' Thanks! Start-time estimates updated live.')
      return true
    }
    catch (e: any) {
      toast.push(e?.statusMessage || e?.data?.statusMessage || 'Could not submit — are you signed in?')
      return false
    }
  }

  return {
    city, setCity, search, minRating, nearRadiusKm, selectedCinemaId, userLocation, sortByDistance,
    locating, nearMode,
    showContribute, contributeTarget, authModalOpen, cinemas, filteredCinemas, activeCinema,
    meta, pending, error, selectCinema, distanceTo, requestLocation,
    openContribute, closeContribute, openAuthModal, closeAuthModal, submitContribution,
    refreshCinemas: refresh,
  }
}
