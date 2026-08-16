<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RatingBreakdown } from '~/types'

const props = defineProps<{
  ratings: RatingBreakdown | null
  overall: number | null
}>()

const rows = computed(() => [
  { key: 'overall', label: 'Overall', value: props.overall },
  { key: 'ambience', label: 'Ambience', value: props.ratings?.ambience ?? null },
  { key: 'staff', label: 'Staff', value: props.ratings?.staff ?? null },
  { key: 'movieExperience', label: 'Movie experience', value: props.ratings?.movieExperience ?? null },
  { key: 'foodBeverages', label: 'Food & beverages', value: props.ratings?.foodBeverages ?? null },
  { key: 'valueForMoney', label: 'Value for money', value: props.ratings?.valueForMoney ?? null },
])

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
    { threshold: 0.3 },
  )
  io.observe(root.value)
})
onBeforeUnmount(() => io?.disconnect())
</script>

<template>
  <div ref="root" class="grid gap-x-10 gap-y-4 sm:grid-cols-2">
    <div v-for="(r, i) in rows" :key="r.key">
      <div class="flex items-baseline justify-between gap-2">
        <span class="text-[11px] font-medium uppercase tracking-wider text-mist">{{ r.label }}</span>
        <span class="text-sm font-semibold text-paper">{{ r.value != null ? r.value.toFixed(1) : '—' }}</span>
      </div>
      <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-bg">
        <div
          class="h-full rounded-full bg-marquee transition-[width] duration-700 ease-out"
          :style="{
            width: visible && r.value != null ? `${(r.value / 5) * 100}%` : '0%',
            transitionDelay: `${i * 90}ms`,
          }"
        />
      </div>
    </div>
  </div>
</template>
