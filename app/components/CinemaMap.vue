<script setup lang="ts">
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker } from 'leaflet'
import type { Cinema } from '~/types'

const props = defineProps<{
  cinemas: Cinema[]
  selectedId: string | null
  center: [number, number]
  zoom?: number
  userLocation?: { lat: number; lng: number } | null
}>()

const emit = defineEmits<{ select: [id: string] }>()

const el = ref<HTMLElement | null>(null)
const ready = ref(false)
let map: LeafletMap | null = null
let L: typeof import('leaflet') | null = null
const markers = new Map<string, Marker>()
let userMarker: Marker | null = null

function makeIcon(active: boolean) {
  return L!.divIcon({
    html: `<span class="cine-pin${active ? ' active' : ''}"></span>`,
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
    const mk = L.marker([c.lat, c.lng], {
      icon: makeIcon(active),
      riseOnHover: true,
      zIndexOffset: active ? 1000 : 0,
    })
      .addTo(map)
      .bindTooltip(`<b>${c.name}</b>`, {
        className: 'cine-tip',
        direction: 'top',
        offset: [0, -4],
      })
    mk.on('click', () => emit('select', c.id))
    markers.set(c.id, mk)
  }
}

function fit(zoom?: number) {
  if (!map || !L || !props.cinemas.length) return
  const pts: [number, number][] = props.cinemas.map(c => [c.lat, c.lng])
  if (props.userLocation) pts.push([props.userLocation.lat, props.userLocation.lng])
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
  map.setView(props.center, props.zoom ?? 12)
  // Wheel-zoom only after an explicit interaction, so page scroll isn't hijacked.
  map.on('click', () => map?.scrollWheelZoom.enable())
  map.on('mouseout', () => map?.scrollWheelZoom.disable())
  rebuild()
  fit(props.zoom ?? 13)
  ready.value = true
  setTimeout(() => map?.invalidateSize(), 150)
})

watch(() => props.cinemas, () => {
  rebuild()
  fit(props.zoom ?? 13)
})

watch(() => props.selectedId, (id) => {
  if (!map) return
  markers.forEach((mk, cid) => mk.setIcon(makeIcon(cid === id)))
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
  fit(12)
})

onUnmounted(() => {
  map?.remove()
  map = null
})
</script>

<template>
  <div class="relative h-full w-full">
    <div ref="el" class="h-full w-full" />
    <div v-if="!ready" class="absolute inset-0 grid place-items-center bg-bg-alt2/80">
      <span class="font-mono text-xs uppercase tracking-widest text-mist">Loading map…</span>
    </div>
  </div>
</template>
