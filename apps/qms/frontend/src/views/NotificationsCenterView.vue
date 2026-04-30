<script setup>
import { computed, onMounted, ref } from 'vue';
import QualityDataGrid from '../components/QualityDataGrid.vue';
import { apiRequest } from '../services/api';

const loading = ref(false);
const error = ref('');
const message = ref('');
const selectedId = ref('');
const inApp = ref([]);
const emails = ref([]);
const outbox = ref([]);

const columns = [
  { key: 'readState', label: 'State' },
  { key: 'title', label: 'Title' },
  { key: 'eventType', label: 'Event Type' },
  { key: 'createdAt', label: 'Created At' }
];

const selected = computed(() => inApp.value.find((item) => item.id === selectedId.value) || null);
const unreadCount = computed(() => inApp.value.filter((item) => !item.isRead).length);
const emailFailures = computed(() => emails.value.filter((item) => item.deliveryStatus === 'Failed').length);
const outboxFailures = computed(() => outbox.value.filter((item) => item.publishStatus === 'Failed').length);

function toDate(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace('T', ' ').slice(0, 19);
}

async function loadNotifications() {
  loading.value = true;
  error.value = '';
  try {
    const payload = await apiRequest('/platform/notifications');
    inApp.value = (payload.inApp || []).map((item) => ({
      id: item.id,
      eventType: item.event_type,
      title: item.title,
      message: item.message,
      payloadJson: item.payload_json || {},
      isRead: Boolean(item.is_read),
      readState: item.is_read ? 'Read' : 'Unread',
      createdAt: toDate(item.created_at)
    }));
    emails.value = (payload.emails || []).map((item) => ({
      id: item.id,
      recipientEmail: item.recipient_email,
      subject: item.subject,
      deliveryStatus: item.delivery_status,
      createdAt: toDate(item.created_at)
    }));
    outbox.value = (payload.outbox || []).map((item) => ({
      id: item.id,
      topicKey: item.topic_key,
      publishStatus: item.publish_status,
      createdAt: toDate(item.created_at)
    }));

    if (!selectedId.value && inApp.value.length > 0) {
      selectedId.value = inApp.value[0].id;
    }
  } catch (requestError) {
    error.value = requestError.message;
  } finally {
    loading.value = false;
  }
}

async function markRead(notificationId) {
  if (!notificationId) return;
  message.value = '';
  error.value = '';
  const previous = [...inApp.value];
  inApp.value = inApp.value.map((item) =>
    item.id === notificationId ? { ...item, isRead: true, readState: 'Read' } : item
  );
  try {
    await apiRequest(`/platform/notifications/${notificationId}/read`, { method: 'PATCH' });
    message.value = 'Notification marked as read.';
  } catch (requestError) {
    inApp.value = previous;
    error.value = requestError.message;
  }
}

async function markAllRead() {
  message.value = '';
  error.value = '';
  const previous = [...inApp.value];
  inApp.value = inApp.value.map((item) => ({ ...item, isRead: true, readState: 'Read' }));
  try {
    const payload = await apiRequest('/platform/notifications/read-all', { method: 'PATCH' });
    message.value = `${payload.updatedCount || 0} notifications marked as read.`;
  } catch (requestError) {
    inApp.value = previous;
    error.value = requestError.message;
  }
}

onMounted(loadNotifications);
</script>

<template>
  <section class="space-y-4">
    <header class="rounded-2xl border border-slate-200 bg-white p-5">
      <p class="text-xs uppercase tracking-[0.14em] text-slate-500">Operational Messaging</p>
      <h2 class="mt-1 text-2xl font-bold text-slate-900">Notifications Center</h2>
      <p class="mt-2 text-sm text-slate-600">
        Centralized in-app alerts, email queue visibility, and outbox publish status with unread control.
      </p>
      <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span class="rounded border border-slate-300 bg-slate-50 px-2 py-1">Unread: {{ unreadCount }}</span>
        <span class="rounded border border-slate-300 bg-slate-50 px-2 py-1">Email Failures: {{ emailFailures }}</span>
        <span class="rounded border border-slate-300 bg-slate-50 px-2 py-1">Outbox Failures: {{ outboxFailures }}</span>
      </div>
    </header>

    <section class="grid gap-4 xl:grid-cols-[1.2fr_minmax(0,1fr)]">
      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-lg font-semibold text-slate-900">In-App Notifications</h3>
          <div class="flex items-center gap-2">
            <button class="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" @click="markAllRead">
              Mark All Read
            </button>
            <button class="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700" @click="loadNotifications">
              Refresh
            </button>
          </div>
        </div>

        <div v-if="loading" class="mb-3 space-y-2">
          <div class="qms-skeleton h-6 rounded"></div>
          <div class="qms-skeleton h-6 rounded"></div>
          <div class="qms-skeleton h-6 rounded"></div>
        </div>

        <QualityDataGrid
          :columns="columns"
          :rows="inApp"
          row-key="id"
          storage-key="qms_notifications_views"
          empty-text="No notifications found."
          @row-click="selectedId = $event.id"
        >
          <template #cell-readState="{ row }">
            <span
              class="rounded px-2 py-0.5 text-xs font-semibold"
              :class="row.isRead ? 'bg-slate-100 text-slate-700' : 'bg-amber-100 text-amber-800'"
            >
              {{ row.readState }}
            </span>
          </template>
        </QualityDataGrid>
      </article>

      <article class="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 class="text-lg font-semibold text-slate-900">Notification Detail</h3>
        <p v-if="!selected" class="mt-3 text-sm text-slate-600">Select a notification to view payload.</p>
        <template v-else>
          <div class="mt-3 rounded border border-slate-200 px-3 py-2 text-sm">
            <p><span class="font-semibold">Title:</span> {{ selected.title }}</p>
            <p><span class="font-semibold">Event:</span> {{ selected.eventType }}</p>
            <p><span class="font-semibold">Created:</span> {{ selected.createdAt }}</p>
            <p class="mt-2"><span class="font-semibold">Message:</span> {{ selected.message }}</p>
          </div>
          <pre class="mt-3 max-h-48 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">{{
            JSON.stringify(selected.payloadJson, null, 2)
          }}</pre>
          <button
            v-if="!selected.isRead"
            class="mt-3 rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
            @click="markRead(selected.id)"
          >
            Mark Read
          </button>
        </template>

        <div class="mt-4 space-y-2">
          <h4 class="text-sm font-semibold text-slate-900">Email Queue Snapshot</h4>
          <ul class="max-h-24 space-y-1 overflow-auto text-xs text-slate-700">
            <li v-for="row in emails.slice(0, 6)" :key="row.id" class="rounded border border-slate-200 px-2 py-1">
              {{ row.deliveryStatus }} • {{ row.recipientEmail }} • {{ row.createdAt }}
            </li>
            <li v-if="emails.length === 0" class="text-slate-600">No email notifications.</li>
          </ul>
        </div>

        <div class="mt-4 space-y-2">
          <h4 class="text-sm font-semibold text-slate-900">Outbox Snapshot</h4>
          <ul class="max-h-24 space-y-1 overflow-auto text-xs text-slate-700">
            <li v-for="row in outbox.slice(0, 6)" :key="row.id" class="rounded border border-slate-200 px-2 py-1">
              {{ row.publishStatus }} • {{ row.topicKey }} • {{ row.createdAt }}
            </li>
            <li v-if="outbox.length === 0" class="text-slate-600">No outbox records.</li>
          </ul>
        </div>
      </article>
    </section>

    <p v-if="message" class="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{{ message }}</p>
    <p v-if="error" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ error }}</p>
  </section>
</template>
