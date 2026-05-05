<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] }, // [{ key, label }]
  canCreate: { type: Boolean, default: true },
  defaultExpanded: { type: Boolean, default: true }
})

const emit = defineEmits(['create', 'row-click'])

const expanded = ref(props.defaultExpanded)
const panelSearch = ref('')

const filteredItems = computed(() => {
  const q = panelSearch.value.trim().toLowerCase()
  if (!q) return props.items
  return props.items.filter(row =>
    props.columns.some(col => String(row[col.key] ?? '').toLowerCase().includes(q))
  )
})
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-slate-200 bg-white">
    <!-- Panel header -->
    <div
      class="flex cursor-pointer select-none items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5"
      @click="expanded = !expanded"
    >
      <div class="flex items-center gap-2">
        <span
          class="text-xs text-slate-400 transition-transform duration-150"
          :class="expanded ? '' : '-rotate-90'"
        >▼</span>
        <span class="text-sm font-semibold text-slate-800">{{ title }}</span>
        <span class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-200 px-1.5 text-xs font-medium text-slate-600">
          {{ items.length }}
        </span>
      </div>
      <div class="flex items-center gap-2" @click.stop>
        <input
          v-model="panelSearch"
          class="w-36 rounded border border-slate-300 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
          type="search"
          placeholder="Search…"
        />
        <button
          v-if="canCreate"
          type="button"
          class="rounded border border-indigo-500 px-2.5 py-1 text-xs font-semibold text-indigo-600 hover:bg-indigo-50 transition-colors"
          @click="emit('create')"
        >
          + Create
        </button>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
        >
          Show in Tab
        </button>
      </div>
    </div>

    <!-- Panel table body -->
    <div v-if="expanded" class="overflow-x-auto">
      <table v-if="columns.length > 0" class="min-w-full border-collapse text-sm">
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col.key"
              class="border-b border-slate-100 bg-white px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
            >
              {{ col.label }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, idx) in filteredItems"
            :key="row.id || idx"
            class="cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
            @click="emit('row-click', row)"
          >
            <td
              v-for="col in columns"
              :key="col.key"
              class="px-4 py-2.5 text-sm text-slate-700"
            >
              <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
                {{ row[col.key] ?? '—' }}
              </slot>
            </td>
          </tr>
          <tr v-if="filteredItems.length === 0">
            <td :colspan="Math.max(1, columns.length)" class="px-4 py-4 text-center text-sm text-slate-400">
              No records.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
