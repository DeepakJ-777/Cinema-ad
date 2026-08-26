<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RatingBreakdown } from '~/types'

const props = defineProps<{
  ratings: RatingBreakdown | null
  overall?: number | null
}>()

const items = computed(() => [
  { key: 'ambience', label: 'Ambience', value: props.ratings?.ambience ?? null },
  { key: 'staff', label: 'Staff & service', value: props.ratings?.staff ?? null },
  { key: 'movieExperience', label: 'Screen & sound', value: props.ratings?.movieExperience ?? null },
  { key: 'foodBeverages', label: 'Food & drinks', value: props.ratings?.foodBeverages ?? null },
  { key: 'valueForMoney', label: 'Value for money', value: props.ratings?.valueForMoney ?? null },
])

function getBarColor(val: number | null): string {
  if (val == null) return 'bg-mist/30'
  if (val >= 4.0) return 'bg-emerald-400'
  if (val >= 3.0) return 'bg-amber-400'
  return 'bg-rose-400'
}

const root = ref<HTMLElement | null>(null)
const visible = ref(false)
let io: IntersectionObserver | null = null

onMounted(() => {
  if (!root.value) return
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some(e => e.isIntersecting)) {
        visible.value = true
        io?.disconnect()
      }
    },
    { threshold: 0.2 },
  )
  io.observe(root.value)
})

onBeforeUnmount(() => io?.disconnect())
</script>

<template>
  <div ref="root" class="space-y-3">
    <!-- 3-Column Grid: 3 cards in Row 1, 2 cards in Row 2 -->
    <div class="grid grid-cols-3 gap-2 sm:gap-2.5">
      <div
        v-for="(r, i) in items"
        :key="r.key"
        class="flex flex-col justify-between rounded-xl sm:rounded-2xl border border-reel/60 bg-bg/80 p-2 sm:p-2.5 transition-colors hover:border-reel"
      >
        <!-- Top: Icon & Text -->
        <div class="flex items-center gap-2 sm:gap-2.5">
          <div class="grid h-7 w-7 sm:h-8 sm:w-8 shrink-0 place-items-center rounded-full border border-lime-500/30 bg-lime-500/10 text-lime-400">
            <!-- Ambience Icon -->
            <svg
              v-if="r.key === 'ambience'"
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>

            <!-- Staff & service Icon -->
            <svg
              v-else-if="r.key === 'staff'"
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>

            <!-- Screen & sound Icon -->
            <svg
              v-else-if="r.key === 'movieExperience'"
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>

            <!-- Food & drinks Icon -->
            <svg
              v-else-if="r.key === 'foodBeverages'"
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M17 3H7l2 15a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z" />
              <line x1="6" y1="7" x2="18" y2="7" />
            </svg>

            <!-- Value for money Icon -->
            <svg
              v-else-if="r.key === 'valueForMoney'"
              viewBox="0 0 24 24"
              class="h-3.5 w-3.5 sm:h-4 sm:w-4"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v12M15 9.5a2.5 2.5 0 0 0-5 0c0 1.5 1 2.5 3 2.5s3 1 3 2.5a2.5 2.5 0 0 1-5 0" />
            </svg>
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-[10.5px] sm:text-[11px] font-medium leading-tight text-mist">{{ r.label }}</p>
            <div class="mt-0.5 flex items-baseline gap-0.5">
              <span class="font-display text-sm sm:text-base font-bold text-paper">{{ r.value != null ? r.value.toFixed(1) : '—' }}</span>
              <span class="text-[9px] sm:text-[10px] text-mist/60">/5</span>
            </div>
          </div>
        </div>

        <!-- Bottom: Dynamic Color Progress Bar -->
        <div class="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            :class="['h-full rounded-full transition-[width] duration-700 ease-out', getBarColor(r.value)]"
            :style="{
              width: visible && r.value != null ? `${(r.value / 5) * 100}%` : '0%',
              transitionDelay: `${i * 60}ms`,
            }"
          />
        </div>
      </div>
    </div>

    <!-- Rating Tier Legend -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-0.5 text-[11px] text-mist">
      <div class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-emerald-400" />
        <span>4.0+ strong</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-amber-400" />
        <span>3.0–3.9 average</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="h-2 w-2 rounded-full bg-rose-400" />
        <span>below 3.0</span>
      </div>
    </div>
  </div>
</template>

