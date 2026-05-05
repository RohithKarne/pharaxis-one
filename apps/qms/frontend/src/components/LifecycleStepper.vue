<script setup>
import { computed } from 'vue'

const props = defineProps({
  states: {
    type: Array,
    default: () => []
    // Each item: { key: string, label: string }
  },
  current: {
    type: String,
    default: ''
  }
})

const currentIndex = computed(() => props.states.findIndex(s => s.key === props.current))

function getStatus(index) {
  if (index < currentIndex.value) return 'done'
  if (index === currentIndex.value) return 'active'
  return 'pending'
}
</script>

<template>
  <div class="flex items-center overflow-x-auto gap-0 py-0.5 min-w-0">
    <template v-for="(state, index) in states" :key="state.key">
      <!-- Connector line between states -->
      <div
        v-if="index > 0"
        class="h-px flex-1 min-w-3 max-w-8 shrink"
        :class="index <= currentIndex ? 'bg-amber-400' : 'bg-slate-200'"
      />

      <!-- State node -->
      <div class="flex items-center gap-1 shrink-0">
        <span
          class="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none"
          :class="{
            'bg-amber-500 text-white shadow-sm': getStatus(index) === 'active',
            'bg-slate-400 text-white': getStatus(index) === 'done',
            'bg-white border-2 border-slate-300 text-slate-400': getStatus(index) === 'pending'
          }"
        >
          <span v-if="getStatus(index) === 'done'">✓</span>
          <span v-else>{{ index + 1 }}</span>
        </span>
        <span
          class="text-xs whitespace-nowrap"
          :class="{
            'text-amber-700 font-semibold': getStatus(index) === 'active',
            'text-slate-400': getStatus(index) === 'done',
            'text-slate-400': getStatus(index) === 'pending'
          }"
        >
          {{ state.label }}
        </span>
      </div>
    </template>
  </div>
</template>
