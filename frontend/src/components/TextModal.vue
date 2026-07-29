<script setup>
import { CopyOutlined, DownloadOutlined } from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';

import { ClipboardManager, FileManager } from '@/utils';

// Read-only text modal — used to surface multi-line export blobs
// (subscription URLs, raw inbound JSON, generated share links) the
// way the legacy txtModal did.

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  content: { type: String, default: '' },
  // When set, surfaces a download button that writes `content` to a
  // text file with this name.
  fileName: { type: String, default: '' },
});

const emit = defineEmits(['update:open']);

function close() {
  emit('update:open', false);
}

async function copy(value) {
  const ok = await ClipboardManager.copyText(value || '');
  if (ok) {
    message.success('Copied');
    close();
  }
}

function download(content, name) {
  if (!name) return;
  FileManager.downloadTextFile(content, name);
}
</script>

<template>
  <a-modal
    :open="open"
    :title="title"
    :closable="true"
    width="min(780px, calc(100vw - 32px))"
    wrap-class-name="shared-text-modal"
    @cancel="close"
  >
    <div class="text-modal-editor">
      <a-textarea
        :value="content"
        readonly
        :auto-size="{ minRows: 10, maxRows: 20 }"
        class="text-modal-content"
      />
    </div>
    <template #footer>
      <a-button v-if="fileName" @click="download(content, fileName)">
        <template #icon><DownloadOutlined /></template>
        {{ fileName }}
      </a-button>
      <a-button type="primary" @click="copy(content)">
        <template #icon><CopyOutlined /></template>
        Copy
      </a-button>
    </template>
  </a-modal>
</template>

<style scoped>
.text-modal-editor {
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 10px;
  background: var(--xui-surface);
}

.text-modal-content {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  overflow-y: auto;
  resize: vertical;
}

.text-modal-editor :deep(.ant-input) {
  border: 0;
  border-radius: 0;
  box-shadow: none !important;
  background: transparent;
}

:global(.shared-text-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--xui-border);
  border-radius: 14px;
  background: var(--xui-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
}

:global(.shared-text-modal .ant-modal-header) {
  margin: 0;
  padding: 17px 20px;
  border-bottom: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.shared-text-modal .ant-modal-title) {
  font-size: 15px;
  font-weight: 750;
}

:global(.shared-text-modal .ant-modal-body) {
  max-height: min(70vh, 720px);
  padding: 18px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--xui-bg);
}

:global(.shared-text-modal .ant-modal-footer) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
  padding: 13px 20px;
  border-top: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.shared-text-modal .ant-modal-footer .ant-btn) {
  min-width: 96px;
  margin-inline-start: 0 !important;
}

@media (max-width: 576px) {
  :global(.shared-text-modal .ant-modal) {
    top: 12px;
    padding-bottom: 12px;
  }

  :global(.shared-text-modal .ant-modal-header) {
    padding: 15px 14px;
  }

  :global(.shared-text-modal .ant-modal-body) {
    max-height: calc(100vh - 148px);
    padding: 14px;
  }

  :global(.shared-text-modal .ant-modal-footer) {
    padding: 11px 14px;
  }

  :global(.shared-text-modal .ant-modal-footer .ant-btn) {
    flex: 1;
    min-width: 0;
  }
}
</style>
