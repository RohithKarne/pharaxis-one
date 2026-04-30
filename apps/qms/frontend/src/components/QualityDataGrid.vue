<script setup>
import { computed, onMounted, ref, watch } from 'vue';

const props = defineProps({
  columns: {
    type: Array,
    default: () => []
  },
  rows: {
    type: Array,
    default: () => []
  },
  rowKey: {
    type: String,
    default: 'id'
  },
  pageSize: {
    type: Number,
    default: 10
  },
  storageKey: {
    type: String,
    default: ''
  },
  emptyText: {
    type: String,
    default: 'No records found.'
  }
});

const emit = defineEmits(['row-click']);

const query = ref('');
const sortKey = ref('');
const sortDirection = ref('asc');
const page = ref(1);
const pageSizeLocal = ref(props.pageSize);
const viewName = ref('');
const savedViews = ref([]);

const activeColumns = computed(() => props.columns.filter((column) => Boolean(column?.key)));

const filteredRows = computed(() => {
  const source = Array.isArray(props.rows) ? props.rows : [];
  const needle = query.value.trim().toLowerCase();
  if (!needle) return source;

  return source.filter((row) =>
    activeColumns.value.some((column) => String(row?.[column.key] ?? '').toLowerCase().includes(needle))
  );
});

const sortedRows = computed(() => {
  const source = [...filteredRows.value];
  if (!sortKey.value) return source;

  return source.sort((left, right) => {
    const leftValue = String(left?.[sortKey.value] ?? '').toLowerCase();
    const rightValue = String(right?.[sortKey.value] ?? '').toLowerCase();
    if (leftValue === rightValue) return 0;
    const comparison = leftValue > rightValue ? 1 : -1;
    return sortDirection.value === 'asc' ? comparison : -comparison;
  });
});

const totalPages = computed(() => Math.max(1, Math.ceil(sortedRows.value.length / pageSizeLocal.value)));

const pagedRows = computed(() => {
  const start = (page.value - 1) * pageSizeLocal.value;
  return sortedRows.value.slice(start, start + pageSizeLocal.value);
});

function movePage(delta) {
  page.value = Math.min(totalPages.value, Math.max(1, page.value + delta));
}

function toggleSort(columnKey) {
  if (!columnKey) return;
  if (sortKey.value === columnKey) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
    return;
  }
  sortKey.value = columnKey;
  sortDirection.value = 'asc';
}

function onRowClick(row) {
  emit('row-click', row);
}

function loadSavedViews() {
  if (!props.storageKey) return;
  try {
    const raw = localStorage.getItem(props.storageKey);
    savedViews.value = raw ? JSON.parse(raw) : [];
  } catch {
    savedViews.value = [];
  }
}

function persistSavedViews() {
  if (!props.storageKey) return;
  localStorage.setItem(props.storageKey, JSON.stringify(savedViews.value));
}

function saveCurrentView() {
  if (!props.storageKey || !viewName.value.trim()) return;
  const normalized = viewName.value.trim();
  const view = {
    name: normalized,
    query: query.value,
    sortKey: sortKey.value,
    sortDirection: sortDirection.value,
    pageSize: pageSizeLocal.value
  };

  savedViews.value = [
    view,
    ...savedViews.value.filter((item) => item.name.toLowerCase() !== normalized.toLowerCase())
  ].slice(0, 8);
  persistSavedViews();
  viewName.value = '';
}

function applyView(savedView) {
  if (!savedView) return;
  query.value = savedView.query || '';
  sortKey.value = savedView.sortKey || '';
  sortDirection.value = savedView.sortDirection || 'asc';
  pageSizeLocal.value = Number(savedView.pageSize) || props.pageSize;
  page.value = 1;
}

function removeView(name) {
  savedViews.value = savedViews.value.filter((item) => item.name !== name);
  persistSavedViews();
}

watch([query, sortKey, sortDirection, pageSizeLocal], () => {
  page.value = 1;
});

watch(totalPages, () => {
  if (page.value > totalPages.value) page.value = totalPages.value;
});

onMounted(() => {
  loadSavedViews();
});
</script>

<template>
  <section class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <input
        v-model="query"
        class="rounded border border-slate-300 px-3 py-1.5 text-xs"
        type="search"
        placeholder="Search in grid"
      />
      <select v-model.number="pageSizeLocal" class="rounded border border-slate-300 px-2 py-1.5 text-xs">
        <option :value="10">10 rows</option>
        <option :value="20">20 rows</option>
        <option :value="50">50 rows</option>
      </select>
      <input
        v-if="storageKey"
        v-model="viewName"
        class="rounded border border-slate-300 px-2 py-1.5 text-xs"
        placeholder="Saved view name"
      />
      <button
        v-if="storageKey"
        type="button"
        class="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700"
        @click="saveCurrentView"
      >
        Save View
      </button>
      <select
        v-if="storageKey && savedViews.length > 0"
        class="rounded border border-slate-300 px-2 py-1.5 text-xs"
        @change="applyView(savedViews.find((view) => view.name === $event.target.value))"
      >
        <option value="">Load saved view</option>
        <option v-for="view in savedViews" :key="view.name" :value="view.name">{{ view.name }}</option>
      </select>
      <button
        v-if="storageKey && savedViews.length > 0"
        type="button"
        class="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold text-slate-700"
        @click="removeView(savedViews[0]?.name)"
      >
        Remove Latest View
      </button>
    </div>

    <div class="overflow-auto rounded border border-slate-200 bg-white">
      <table class="min-w-full border-collapse text-sm">
        <thead class="bg-slate-50">
          <tr>
            <th
              v-for="column in activeColumns"
              :key="column.key"
              class="border-b border-slate-200 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-slate-600"
            >
              <button
                v-if="column.sortable !== false"
                type="button"
                class="inline-flex items-center gap-1 text-left"
                @click="toggleSort(column.key)"
              >
                <span>{{ column.label }}</span>
                <span v-if="sortKey === column.key">{{ sortDirection === 'asc' ? '↑' : '↓' }}</span>
              </button>
              <span v-else>{{ column.label }}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in pagedRows"
            :key="row[rowKey]"
            class="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
            @click="onRowClick(row)"
          >
            <td v-for="column in activeColumns" :key="column.key" class="px-3 py-2 text-sm text-slate-700">
              <slot :name="`cell-${column.key}`" :row="row" :value="row[column.key]">
                {{ row[column.key] }}
              </slot>
            </td>
          </tr>
          <tr v-if="pagedRows.length === 0">
            <td :colspan="Math.max(1, activeColumns.length)" class="px-3 py-4 text-center text-sm text-slate-500">
              {{ emptyText }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center justify-between text-xs text-slate-600">
      <p>Rows: {{ sortedRows.length }} • Page {{ page }} of {{ totalPages }}</p>
      <div class="flex items-center gap-2">
        <button type="button" class="rounded border border-slate-300 px-2 py-1" :disabled="page <= 1" @click="movePage(-1)">
          Prev
        </button>
        <button
          type="button"
          class="rounded border border-slate-300 px-2 py-1"
          :disabled="page >= totalPages"
          @click="movePage(1)"
        >
          Next
        </button>
      </div>
    </div>
  </section>
</template>
