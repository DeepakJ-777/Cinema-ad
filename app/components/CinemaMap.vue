<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker } from 'leaflet'
import type { Cinema } from '~/types'

const props = defineProps<{
  cinemas: Cinema[]
  selectedId: string | null
  center?: [number, number]
  zoom?: number
  fitPoints?: [number, number][]
  userLocation?: { lat: number; lng: number } | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Cinemas imported from OpenStreetMap carry no showtimes/reports yet. */
const isBare = (c: Cinema) => c.movies.length === 0 && c.ratingCount === 0 && c.overall == null

const el = ref<HTMLElement | null>(null)
const ready = ref(false)
let map: LeafletMap | null = null
let L: typeof import('leaflet') | null = null
const markers = new Map<string, Marker>()
let userMarker: Marker | null = null

function makeIcon(active: boolean, bare = false) {
  return L!.divIcon({
    html: `<span class="cine-pin${active ? ' active' : ''}${bare ? ' bare' : ''}"></span>`,
    className: 'pin-wrap',
    iconSize: [22, 30],
    iconAnchor: [11, 28],
    tooltipAnchor: [0, -26],
  })
}

function rebuild() {
  if (!map || !L) return
  markers.forEach(m => m.remove())
  markers.clear()
  for (const c of props.cinemas) {
    const active = c.id === props.selectedId
    const bare = isBare(c)
    const mk = L.marker([c.lat, c.lng], {
      icon: makeIcon(active, bare),
      riseOnHover: true,
      zIndexOffset: active ? 1000 : 0,
    })
      .addTo(map)
      .bindTooltip(
        `<b>${esc(c.name)}</b>${bare ? '<br/>no showtime data yet' : ''}`,
        {
          className: 'cine-tip',
          direction: 'top',
          offset: [0, -4],
        },
      )
    mk.on('click', () => emit('select', c.id))
    markers.set(c.id, mk)
  }
}

function fit(zoom?: number) {
  if (!map || !L) return
  // Caller decides the focus (near-me set, browsed city, or everything);
  // markers for every cinema stay on the map regardless of the current view.
  const pts = props.fitPoints?.length
    ? props.fitPoints
    : props.cinemas.map(c => [c.lat, c.lng] as [number, number])
  if (!pts.length) return
  map.flyToBounds(L.latLngBounds(pts).pad(0.15), { duration: 0.8, maxZoom: zoom ?? 13 })
}

onMounted(async () => {
  if (!el.value) return
  L = await import('leaflet')
  map = L.map(el.value, { zoomControl: false, scrollWheelZoom: false })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles &copy; <a href="https://carto.com/">CARTO</a>',
  }).addTo(map)
  // Midpoint between both cities as a neutral fallback before the first fit()
  map.setView(props.center ?? [11.48, 76.93], props.zoom ?? 6)
  // Wheel-zoom only after an explicit interaction, so page scroll isn't hijacked.
  map.on('click', () => map?.scrollWheelZoom.enable())
  map.on('mouseout', () => map?.scrollWheelZoom.disable())
  rebuild()
  fit(props.zoom)
  ready.value = true
  setTimeout(() => map?.invalidateSize(), 150)
})

watch(() => props.cinemas, () => {
  rebuild()
  fit(props.zoom)
})

watch(() => props.fitPoints, () => {
  fit(props.zoom)
})

watch(() => props.selectedId, (id) => {
  if (!map) return
  markers.forEach((mk, cid) => {
    const c = props.cinemas.find(x => x.id === cid)
    mk.setIcon(makeIcon(cid === id, c ? isBare(c) : false))
  })
  const c = props.cinemas.find(x => x.id === id)
  if (c) map.panTo([c.lat, c.lng])
})

watch(() => props.userLocation, (loc) => {
  if (!map || !L || !loc) return
  if (userMarker) userMarker.remove()
  userMarker = L.marker([loc.lat, loc.lng], {
    icon: L.divIcon({
      html: '<span class="me-pin"></span>',
      className: 'pin-wrap',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
    interactive: false,
  }).addTo(map)
  // View changes are driven by the fitPoints watcher (near-me set includes
  // the user's position), so no explicit fit here.
})

onUnmounted(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div class="relative isolate z-0 h-full w-full">
    <div ref="el" class="h-full w-full" />
    <div v-if="!ready" class="absolute inset-0 grid place-items-center bg-bg-alt2/80">
      <span class="font-mono text-xs uppercase tracking-widest text-mist">Loading map…</span>
    </div>
  </div>
</template>

