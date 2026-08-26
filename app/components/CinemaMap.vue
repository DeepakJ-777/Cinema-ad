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

const { locateUser } = useCinemaStore()
const locating = ref(false)

/** Locate button: refocus the map on the user. Reuses the stored fix when
 *  present (no permission prompt); otherwise takes one fresh fix via the store. */
async function locateMe() {
  if (locating.value) return
  if (props.userLocation) {
    focusUser(props.userLocation)
    return
  }
  locating.value = true
  const loc = await locateUser()
  locating.value = false
  if (loc) focusUser(loc)
}

function focusUser(loc: { lat: number; lng: number }) {
  if (!map) return
  // Neighborhood-level zoom; keep a closer manual zoom instead of pulling out.
  map.flyTo([loc.lat, loc.lng], Math.max(14, map.getZoom()), { duration: 0.8 })
}

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

function getCinemaAdDuration(c: Cinema): number | null {
  const all = (c.movies ?? [])
    .flatMap(m => m.showtimes)
    .filter(st => st.adDurationMin != null && st.adReports > 0)
  if (!all.length) return null
  const totalWeight = all.reduce((s, st) => s + (st.adReports || 1), 0)
  const avg = all.reduce((s, st) => s + st.adDurationMin! * (st.adReports || 1), 0) / totalWeight
  return Math.round(avg)
}

function makeIcon(active: boolean, bare = false, adDuration: number | null = null) {
  const hasAd = adDuration != null && adDuration > 0
  const badgeHtml = hasAd
    ? `<span class="cine-ad-badge${active ? ' active' : ''}">~${adDuration}m</span>`
    : ''

  return L!.divIcon({
    html: `<div class="cine-pin-node${active ? ' is-active' : ''}${hasAd ? ' has-badge' : ''}">${badgeHtml}<span class="cine-pin${active ? ' active' : ''}${bare ? ' bare' : ''}"></span></div>`,
    className: 'pin-wrap',
    iconSize: [60, hasAd ? 46 : 30],
    iconAnchor: [30, hasAd ? 42 : 26],
    tooltipAnchor: [0, hasAd ? -42 : -26],
  })
}

function rebuild() {
  if (!map || !L) return
  markers.forEach(m => m.remove())
  markers.clear()
  for (const c of props.cinemas) {
    const active = c.id === props.selectedId
    const bare = isBare(c)
    const adDuration = getCinemaAdDuration(c)
    const mk = L.marker([c.lat, c.lng], {
      icon: makeIcon(active, bare, adDuration),
      riseOnHover: true,
      zIndexOffset: active ? 1000 : 0,
    })
      .addTo(map)
      .bindTooltip(
        `<b>${esc(c.name)}</b>${adDuration ? `<br/><span style="color:#C6F135;font-weight:600;">~${adDuration} mins ads</span>` : (bare ? '<br/>no showtime data yet' : '')}`,
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
  map = L.map(el.value, { zoomControl: false, scrollWheelZoom: true })
  L.control.zoom({ position: 'bottomright' }).addTo(map)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=cb1_25wo_1_ca95250577fa150e2e1ea585', {
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, tiles &copy; <a href="https://carto.com/">CARTO</a>',
}).addTo(map)

  // Midpoint between both cities as a neutral fallback before the first fit()
  map.setView(props.center ?? [11.48, 76.93], props.zoom ?? 6)
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
    mk.setIcon(makeIcon(cid === id, c ? isBare(c) : false, c ? getCinemaAdDuration(c) : null))
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
    <!-- Floating Locate / Relocation control -->
    <button
      v-if="ready"
      type="button"
      title="Center on my location"
      aria-label="Center map on my location"
      class="btn-press absolute bottom-[76px] right-3.5 z-[1000] grid h-10 w-10 place-items-center rounded-xl border border-reel bg-bg-alt2/95 text-paper shadow-lg backdrop-blur-sm hover:border-marquee hover:text-marquee lg:bottom-[118px] lg:right-3 lg:h-[34px] lg:w-[34px] lg:rounded-lg"
      :class="{ 'animate-pulse cursor-wait': locating }"
      :disabled="locating"
      @click="locateMe"
    >
      <svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="6.5" />
        <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" stroke-linecap="round" />
        <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      </svg>
    </button>
    <div v-if="!ready" class="absolute inset-0 grid place-items-center bg-bg-alt2/80">
      <span class="font-mono text-xs uppercase tracking-widest text-mist">Loading map…</span>
    </div>
  </div>
</template>

