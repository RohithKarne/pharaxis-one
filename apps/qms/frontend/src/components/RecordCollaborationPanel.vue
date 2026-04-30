<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
  recordKey: {
    type: String,
    required: true
  },
  comments: {
    type: Array,
    default: () => []
  },
  attachments: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  }
});

const emit = defineEmits(['add-comment', 'add-attachment']);

const commentText = ref('');
const attachmentName = ref('');
const attachmentRef = ref('');

const title = computed(() => `Collaboration • ${props.recordKey}`);

function submitComment() {
  const text = commentText.value.trim();
  if (!text || props.disabled) return;
  emit('add-comment', text);
  commentText.value = '';
}

function submitAttachment() {
  const name = attachmentName.value.trim();
  if (!name || props.disabled) return;
  emit('add-attachment', {
    name,
    ref: attachmentRef.value.trim() || null
  });
  attachmentName.value = '';
  attachmentRef.value = '';
}
</script>

<template>
  <section class="rounded border border-slate-200 bg-white p-3">
    <h4 class="text-sm font-semibold text-slate-900">{{ title }}</h4>

    <div class="mt-2 grid gap-2">
      <textarea
        v-model="commentText"
        class="rounded border border-slate-300 px-2 py-1 text-xs"
        rows="2"
        placeholder="Add comment"
        :disabled="disabled"
      />
      <button
        class="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
        :disabled="disabled"
        @click="submitComment"
      >
        Add Comment
      </button>
    </div>

    <ul class="mt-2 max-h-24 space-y-1 overflow-auto text-xs">
      <li v-for="comment in comments" :key="comment.id" class="rounded border border-slate-200 px-2 py-1">
        <p class="font-semibold text-slate-700">{{ comment.author }}</p>
        <p class="text-slate-600">{{ comment.text }}</p>
        <p class="text-slate-500">{{ comment.createdAt }}</p>
      </li>
      <li v-if="comments.length === 0" class="text-slate-500">No comments yet.</li>
    </ul>

    <div class="mt-3 grid gap-2">
      <input
        v-model="attachmentName"
        class="rounded border border-slate-300 px-2 py-1 text-xs"
        placeholder="Attachment display name"
        :disabled="disabled"
      />
      <input
        v-model="attachmentRef"
        class="rounded border border-slate-300 px-2 py-1 text-xs"
        placeholder="Reference link or object key"
        :disabled="disabled"
      />
      <button
        class="rounded border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700"
        :disabled="disabled"
        @click="submitAttachment"
      >
        Add Attachment
      </button>
    </div>

    <ul class="mt-2 max-h-24 space-y-1 overflow-auto text-xs">
      <li v-for="attachment in attachments" :key="attachment.id" class="rounded border border-slate-200 px-2 py-1">
        <p class="font-semibold text-slate-700">{{ attachment.name }}</p>
        <p class="text-slate-600">{{ attachment.ref || 'No ref' }}</p>
        <p class="text-slate-500">{{ attachment.createdAt }}</p>
      </li>
      <li v-if="attachments.length === 0" class="text-slate-500">No attachments yet.</li>
    </ul>
  </section>
</template>
