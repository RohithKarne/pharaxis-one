<script setup>
import LifecycleStepper from './LifecycleStepper.vue'

const props = defineProps({
  breadcrumb: { type: String, default: '' },
  docNumber: { type: String, default: '' },
  title: { type: String, default: '' },
  status: { type: String, default: '' },
  position: { type: Number, default: null },
  total: { type: Number, default: null },
  lifecycleStates: { type: Array, default: () => [] },
  canEdit: { type: Boolean, default: true }
})

const emit = defineEmits(['back', 'prev', 'next', 'edit', 'copy', 'action'])

const STATUS_CLASSES = {
  Open: 'bg-blue-50 text-blue-700 border-blue-200',
  Triage: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Containment: 'bg-orange-50 text-orange-700 border-orange-200',
  Investigation: 'bg-purple-50 text-purple-700 border-purple-200',
  QAReview: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  CapaLinked: 'bg-amber-50 text-amber-700 border-amber-200',
  Closed: 'bg-green-50 text-green-700 border-green-200',
  Reopened: 'bg-red-50 text-red-700 border-red-200',
  // CAPA
  Draft: 'bg-slate-50 text-slate-600 border-slate-200',
  InReview: 'bg-blue-50 text-blue-700 border-blue-200',
  Approved: 'bg-green-50 text-green-700 border-green-200',
  InImplementation: 'bg-purple-50 text-purple-700 border-purple-200',
  // Audit
  Planned: 'bg-sky-50 text-sky-700 border-sky-200',
  InProgress: 'bg-purple-50 text-purple-700 border-purple-200',
  FindingsCaptured: 'bg-orange-50 text-orange-700 border-orange-200',
  ResponseInProgress: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  // Complaints / NC
  Escalated: 'bg-red-50 text-red-700 border-red-200',
  Dispositioned: 'bg-teal-50 text-teal-700 border-teal-200',
  // Change Control
  Initiated: 'bg-teal-50 text-teal-700 border-teal-200',
  ImpactAssessment: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Implementation: 'bg-purple-50 text-purple-700 border-purple-200'
}

function statusClass(s) {
  return STATUS_CLASSES[s] || 'bg-slate-50 text-slate-600 border-slate-200'
}

function formatStatus(s) {
  if (!s) return ''
  // Split camelCase into readable label: QAReview → QA Review, CapaLinked → CAPA Linked
  return s
    .replace(/([A-Z])/g, ' $1')
    .replace(/^Capa /i, 'CAPA ')
    .replace(/^Qa /i, 'QA ')
    .trim()
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <!-- Top utility row: breadcrumb + position counter + action toolbar -->
    <div class="flex items-center justify-between border-b border-slate-100 px-5 py-2">
      <!-- Breadcrumb -->
      <nav class="flex items-center gap-1.5 text-xs text-slate-500">
        <button
          type="button"
          class="font-medium text-indigo-600 hover:underline focus:outline-none"
          @click="emit('back')"
        >
          {{ breadcrumb.split(' / ')[0] }}
        </button>
        <span v-if="breadcrumb.includes('/')">
          /
          <span class="ml-1 text-slate-700 font-medium">
            {{ breadcrumb.split(' / ').slice(1).join(' / ') }}
          </span>
        </span>
      </nav>

      <div class="flex items-center gap-3">
        <!-- Record position counter -->
        <span v-if="position !== null && total !== null" class="text-xs text-slate-500 tabular-nums">
          {{ position }} of {{ total }} records in this list
        </span>
        <div v-if="position !== null && total !== null" class="flex items-center gap-0.5">
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-sm text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            :disabled="position <= 1"
            @click="emit('prev')"
          >‹</button>
          <button
            type="button"
            class="flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-sm text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
            :disabled="position >= total"
            @click="emit('next')"
          >›</button>
        </div>

        <!-- Action toolbar -->
        <div class="flex items-center gap-1 border-l border-slate-200 pl-3">
          <button
            type="button"
            title="Workflow action"
            class="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
            @click="emit('action')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M3 8h8M8 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            v-if="canEdit"
            type="button"
            title="Edit"
            class="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
            @click="emit('edit')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            title="Copy"
            class="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
            @click="emit('copy')"
          >
            <svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="5" y="5" width="8" height="8" rx="1" stroke-linecap="round"/>
              <path d="M3 11V3h8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <button
            type="button"
            title="More actions"
            class="flex h-7 w-7 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <span class="text-base leading-none tracking-widest">···</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Record identity: doc number + status badge + title -->
    <div class="px-5 pt-3 pb-2">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-2xl font-bold tracking-tight text-slate-900">{{ docNumber }}</h2>
        <span
          class="rounded-full border px-3 py-0.5 text-xs font-semibold"
          :class="statusClass(status)"
        >
          {{ formatStatus(status) }}
        </span>
      </div>
      <p v-if="title" class="mt-0.5 text-sm text-slate-500 leading-snug">{{ title }}</p>
    </div>

    <!-- Lifecycle stepper -->
    <div v-if="lifecycleStates.length > 0" class="border-t border-slate-100 px-5 py-2.5">
      <LifecycleStepper :states="lifecycleStates" :current="status" />
    </div>
  </div>
</template>
