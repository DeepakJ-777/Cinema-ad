export type CityId = 'kochi' | 'bengaluru'

export interface City {
  id: CityId
  name: string
  center: [number, number]
  zoom: number
}

export interface RatingBreakdown {
  ambience: number
  staff: number
  movieExperience: number
  foodBeverages: number
  valueForMoney: number
}

export interface Review {
  name: string
  date: string
  text: string
}

export interface Showtime {
  id: string
  startTime: string
  format: string
  screen: string
  /** Provider availability when the show was synced: 'available' | 'filling_fast' | 'sold_out' | … */
  availability?: string | null
  /** Typical ad duration (minutes) for this show from community reports; null when unreported */
  adDurationMin: number | null
  adReports: number
}

export interface Movie {
  id: string
  title: string
  language: string
  durationMin: number
  hue: number
  emoji: string
  showtimes: Showtime[]
}

export interface Cinema {
  id: string
  name: string
  address: string
  city: string
  lat: number
  lng: number
  /** ISO timestamp of the last successful showtime-provider sync covering this cinema (null = never synced) */
  syncedAt?: string | null
  overall: number | null
  ratingCount: number
  ratings: RatingBreakdown | null
  reviews: Review[]
  movies: Movie[]
}
