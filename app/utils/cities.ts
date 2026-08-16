import type { City, CityId } from '~/types'
export const CITIES: Record<CityId, City> = {
  kochi: { id: 'kochi', name: 'Kochi', center: [9.9857, 76.2781], zoom: 12 },
  bengaluru: { id: 'bengaluru', name: 'Bengaluru', center: [12.9716, 77.5946], zoom: 12 },
}
