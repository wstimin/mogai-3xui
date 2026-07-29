<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

// Generic prompt modal — used by features like "import inbound" that
// need a free-form text/textarea input and a confirm callback. The
// parent owns the action; this component only surfaces the value via
// the `confirm` event when the user clicks OK.

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  okText: { type: String, default: 'OK' },
  // 'text' = single-line input; 'textarea' = multi-line.
  type: { type: String, default: 'text', validator: (v) => ['text', 'textarea'].includes(v) },
  initialValue: { type: String, default: '' },
  loading: { type: Boolean, default: false },
});

const emit = defineEmits(['update:open', 'confirm']);
const { t } = useI18n();

const value = ref('');

watch(() => props.open, (next) => {
  if (next) value.value = props.initialValue;
});

function close() { emit('update:open', false); }
function ok() { emit('confirm', value.value); }

// Enter submits when single-line; ctrl+S submits in textarea mode
// (matches legacy keybindings).
function onKeydown(e) {
  if (props.type !== 'textarea' && e.key === 'Enter') {
    e.preventDefault();
    ok();
    return;
  }
  if (props.type === 'textarea' && e.ctrlKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    ok();
  }
}
</script>

<template>
  <a-modal
    :open="open"
    :title="title"
    :ok-text="okText"
    :cancel-text="t('cancel')"
    :mask-closable="false"
    :confirm-loading="loading"
    width="min(680px, calc(100vw - 32px))"
    wrap-class-name="shared-prompt-modal"
    @ok="ok"
    @cancel="close"
  >
    <div class="prompt-input-shell" :class="{ 'is-multiline': type === 'textarea' }">
      <a-textarea
        v-if="type === 'textarea'"
        v-model:value="value"
        :auto-size="{ minRows: 10, maxRows: 20 }"
        autofocus
        @keydown="onKeydown"
      />
      <a-input
        v-else
        v-model:value="value"
        autofocus
        @keydown="onKeydown"
      />
    </div>
  </a-modal>
</template>

<style scoped>
.prompt-input-shell {
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 10px;
  background: var(--xui-surface);
  transition: border-color 0.16s ease, box-shadow 0.16s ease;
}

.prompt-input-shell:focus-within {
  border-color: var(--xui-primary, #6366f1);
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.16);
}

.prompt-input-shell :deep(.ant-input) {
  border: 0;
  border-radius: 0;
  box-shadow: none !important;
  background: transparent;
}

.prompt-input-shell.is-multiline :deep(.ant-input) {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
  resize: vertical;
}

:global(.shared-prompt-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--xui-border);
  border-radius: 14px;
  background: var(--xui-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
}

:global(.shared-prompt-modal .ant-modal-header) {
  margin: 0;
  padding: 17px 20px;
  border-bottom: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.shared-prompt-modal .ant-modal-title) {
  font-size: 15px;
  font-weight: 750;
}

:global(.shared-prompt-modal .ant-modal-body) {
  max-height: min(70vh, 720px);
  padding: 18px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--xui-bg);
}

:global(.shared-prompt-modal .ant-modal-footer) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin: 0;
  padding: 13px 20px;
  border-top: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.shared-prompt-modal .ant-modal-footer .ant-btn) {
  min-width: 84px;
  margin-inline-start: 0 !important;
}

@media (max-width: 576px) {
  :global(.shared-prompt-modal .ant-modal) {
    top: 12px;
    padding-bottom: 12px;
  }

  :global(.shared-prompt-modal .ant-modal-header) {
    padding: 15px 14px;
  }

  :global(.shared-prompt-modal .ant-modal-body) {
    max-height: calc(100vh - 148px);
    padding: 14px;
  }

  :global(.shared-prompt-modal .ant-modal-footer) {
    padding: 11px 14px;
  }

  :global(.shared-prompt-modal .ant-modal-footer .ant-btn) {
    flex: 1;
    min-width: 0;
  }
}
</style>
