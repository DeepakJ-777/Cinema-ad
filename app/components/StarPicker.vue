<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  label: string
  icon: string
  modelValue: number
}>()

const emit = defineEmits<{ 'update:modelValue': [v: number] }>()

const hover = ref(0)
const shown = computed(() => hover.value || props.modelValue)
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <span class="text-xs font-semibold text-ink/80">{{ icon }} {{ label }}</span>
    <div class="flex gap-0.5" @mouseleave="hover = 0">
      <button
        v-for="n in 5"
        :key="n"
        type="button"
        :aria-label="`Rate ${label} ${n} out of 5`"
        :class="[
          'text-xl leading-none transition-transform hover:scale-110',
          n <= shown ? 'text-curtain-bright' : 'text-ink/25',
        ]"
        @click="emit('update:modelValue', n)"
        @mouseenter="hover = n"
      >
        ★
      </button>
    </div>
  </div>
</template>
