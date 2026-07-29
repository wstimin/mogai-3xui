<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'ant-design-vue';

import { HttpUtil } from '@/utils';
import { Protocols, TLS_FLOW_CONTROL } from '@/models/inbound.js';

const { t } = useI18n();

const props = defineProps({
  open: { type: Boolean, default: false },
  targetInbound: { type: Object, default: null },
  dbInbounds: { type: Array, default: () => [] },
});

const emit = defineEmits(['update:open', 'saved']);

const sourceInboundId = ref(null);
const selectedEmails = ref([]);
const flow = ref('');
const saving = ref(false);

const sourceOptions = computed(() => props.dbInbounds.filter((record) => (
  record.id !== props.targetInbound?.id && record.isMultiUser()
)));

const sourceInbound = computed(() => (
  sourceOptions.value.find((record) => record.id === sourceInboundId.value) || null
));

const sourceClients = computed(() => {
  try {
    return sourceInbound.value?.toInbound()?.clients || [];
  } catch (_error) {
    return [];
  }
});

const flowOptions = Object.values(TLS_FLOW_CONTROL);
const showFlow = computed(() => props.targetInbound?.protocol === Protocols.VLESS);

watch(() => props.open, (next) => {
  if (!next) return;
  sourceInboundId.value = null;
  selectedEmails.value = [];
  flow.value = '';
});

watch(sourceInboundId, () => {
  selectedEmails.value = sourceClients.value
    .map((client) => client.email)
    .filter(Boolean);
});

function close() {
  emit('update:open', false);
}

function selectAll() {
  selectedEmails.value = sourceClients.value
    .map((client) => client.email)
    .filter(Boolean);
}

function clearAll() {
  selectedEmails.value = [];
}

async function submit() {
  if (!props.targetInbound || !sourceInboundId.value) return;
  saving.value = true;
  try {
    const msg = await HttpUtil.post(
      `/panel/api/inbounds/${props.targetInbound.id}/copyClients`,
      {
        sourceInboundId: sourceInboundId.value,
        clientEmails: selectedEmails.value,
        flow: showFlow.value ? flow.value : '',
      },
    );
    if (msg?.success) {
      const added = msg.obj?.added || [];
      const errors = msg.obj?.errors || [];
      if (added.length > 0) {
        message.success(`${t('pages.client.copyResultSuccess')}: ${added.length}`);
      } else {
        message.info(t('pages.client.copyResultNone'));
      }
      if (errors.length > 0) {
        message.warning(`${t('pages.client.copyResultErrors')}: ${errors.join('; ')}`);
      }
      emit('saved');
      close();
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <a-modal :open="open" :title="t('pages.client.copyFromInbound')"
    :ok-text="t('pages.client.copySelected')" :cancel-text="t('close')"
    :confirm-loading="saving" :ok-button-props="{ disabled: !sourceInboundId || selectedEmails.length === 0 }"
    :mask-closable="false" width="min(680px, calc(100vw - 32px))" wrap-class-name="copy-clients-modal"
    @ok="submit" @cancel="close">
    <a-form :colon="false" layout="vertical" class="copy-form">
      <a-form-item :label="t('pages.client.copySource')">
        <a-select v-model:value="sourceInboundId" :placeholder="t('pages.client.copySelectSourceFirst')">
          <a-select-option v-for="record in sourceOptions" :key="record.id" :value="record.id">
            {{ record.remark || `Inbound #${record.id}` }} ({{ String(record.protocol).toUpperCase() }} :{{ record.port }})
          </a-select-option>
        </a-select>
      </a-form-item>

      <template v-if="sourceInbound">
        <div class="client-list-heading">
          <span>{{ t('clients') }} ({{ selectedEmails.length }}/{{ sourceClients.length }})</span>
          <a-space>
            <a-button size="small" @click="selectAll">{{ t('pages.client.selectAll') }}</a-button>
            <a-button size="small" @click="clearAll">{{ t('pages.client.clearAll') }}</a-button>
          </a-space>
        </div>

        <a-checkbox-group v-model:value="selectedEmails" class="client-list">
          <label v-for="client in sourceClients" :key="client.email" class="client-option">
            <a-checkbox :value="client.email" />
            <span class="client-email">{{ client.email }}</span>
            <span class="client-preview">{{ client.email }}_{{ targetInbound?.id }}</span>
          </label>
        </a-checkbox-group>

        <a-form-item v-if="showFlow" :label="t('pages.client.copyFlowLabel')"
          :extra="t('pages.client.copyFlowHint')" class="flow-field">
          <a-select v-model:value="flow">
            <a-select-option value="">{{ t('none') }}</a-select-option>
            <a-select-option v-for="item in flowOptions" :key="item" :value="item">{{ item }}</a-select-option>
          </a-select>
        </a-form-item>
      </template>
    </a-form>
  </a-modal>
</template>

<style scoped>
.client-list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 4px 0 10px;
  color: var(--xui-text-strong);
  font-weight: 650;
}

.client-list {
  width: 100%;
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface-2);
}

.client-option {
  min-width: 0;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  color: var(--xui-text);
  cursor: pointer;
}

.client-option + .client-option {
  border-top: 1px solid var(--xui-border);
}

.client-option:hover {
  background: var(--xui-surface-3);
}

.client-option:has(.ant-checkbox-checked) {
  background: var(--xui-primary-soft);
}

.client-email,
.client-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.client-preview {
  color: var(--xui-text-muted);
  font-size: 12px;
}

.flow-field {
  margin-top: 18px;
}

.copy-form :deep(.ant-form-item-label > label) {
  color: var(--xui-text-muted);
  font-size: 12px;
  font-weight: 650;
}

.copy-form :deep(.ant-select) {
  width: 100%;
}

:global(.copy-clients-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
}

:global(.copy-clients-modal .ant-modal-header) {
  margin: 0;
  padding: 17px 20px;
  border-bottom: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.copy-clients-modal .ant-modal-title) {
  font-size: 15px;
  font-weight: 750;
}

:global(.copy-clients-modal .ant-modal-body) {
  max-height: min(70vh, 700px);
  padding: 18px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--xui-bg);
}

:global(.copy-clients-modal .ant-modal-footer) {
  margin: 0;
  padding: 13px 20px;
  border-top: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.copy-clients-modal .ant-modal-footer .ant-btn) {
  min-width: 84px;
}

@media (max-width: 576px) {
  .client-list-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .client-option {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .client-preview {
    display: none;
  }

  :global(.copy-clients-modal .ant-modal) {
    top: 12px;
    padding-bottom: 12px;
  }

  :global(.copy-clients-modal .ant-modal-body) {
    max-height: calc(100vh - 148px);
    padding: 14px;
  }

  :global(.copy-clients-modal .ant-modal-footer) {
    display: flex;
    padding: 11px 14px;
  }

  :global(.copy-clients-modal .ant-modal-footer .ant-btn) {
    flex: 1;
    min-width: 0;
  }
}
</style>
