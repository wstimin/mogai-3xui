<script setup>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal, message } from 'ant-design-vue';
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';

import { theme as themeState, antdThemeConfig } from '@/composables/useTheme.js';
import { useMediaQuery } from '@/composables/useMediaQuery.js';
import AppSidebar from '@/components/AppSidebar.vue';
import CustomStatistic from '@/components/CustomStatistic.vue';
import NodeList from './NodeList.vue';
import NodeFormModal from './NodeFormModal.vue';
import { useNodes } from './useNodes.js';
import { useWebSocket } from '@/composables/useWebSocket.js';

const { t } = useI18n();

const {
  nodes,
  loading,
  fetched,
  totals,
  refresh,
  applyNodesEvent,
  create,
  update,
  remove,
  setEnable,
  testConnection,
  probe,
} = useNodes();

useWebSocket({ nodes: applyNodesEvent });

const { isMobile } = useMediaQuery();
const basePath = window.__X_UI_BASE_PATH__ || '';
const requestUri = window.location.pathname;

const formOpen = ref(false);
const formMode = ref('add');
const formNode = ref(null);
const probingIds = ref(new Set());
const togglingIds = ref(new Set());

function onAdd() {
  formMode.value = 'add';
  formNode.value = null;
  formOpen.value = true;
}

function onEdit(node) {
  formMode.value = 'edit';
  formNode.value = { ...node };
  formOpen.value = true;
}

async function onSave(payload) {
  if (formMode.value === 'edit' && formNode.value?.id) {
    return update(formNode.value.id, payload);
  }
  return create(payload);
}

function onDelete(node) {
  Modal.confirm({
    class: 'node-confirm-modal',
    title: t('pages.nodes.deleteConfirmTitle', { name: node.name }),
    content: t('pages.nodes.deleteConfirmContent'),
    okText: t('delete'),
    okType: 'danger',
    cancelText: t('cancel'),
    onOk: async () => {
      const msg = await remove(node.id);
      if (msg?.success) message.success(t('pages.nodes.toasts.deleted'));
    },
  });
}

async function onProbe(node) {
  if (probingIds.value.has(node.id)) return;
  probingIds.value = new Set(probingIds.value).add(node.id);
  try {
    const msg = await probe(node.id);
    if (msg?.success && msg.obj) {
      if (msg.obj.status === 'online') {
        message.success(t('pages.nodes.connectionOk', { ms: msg.obj.latencyMs }));
      } else {
        message.error(msg.obj.error || t('pages.nodes.toasts.probeFailed'));
      }
    }
  } finally {
    const pending = new Set(probingIds.value);
    pending.delete(node.id);
    probingIds.value = pending;
  }
}

async function onToggleEnable(node, next) {
  if (togglingIds.value.has(node.id)) return;
  togglingIds.value = new Set(togglingIds.value).add(node.id);
  try {
    await setEnable(node.id, next);
  } finally {
    const pending = new Set(togglingIds.value);
    pending.delete(node.id);
    togglingIds.value = pending;
  }
}
</script>

<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-layout
      class="nodes-page"
      :class="{ 'is-dark': themeState.isDark, 'is-ultra': themeState.isUltra }"
    >
      <AppSidebar :base-path="basePath" :request-uri="requestUri" dashboard-style />

      <a-layout class="content-shell">
        <a-layout-content id="content-layout" class="content-area">
          <a-spin :spinning="!fetched" :delay="200" :tip="t('loading')" size="large">
            <div v-if="!fetched" class="loading-spacer" />

            <a-row v-else :gutter="[isMobile ? 8 : 16, 12]">
              <a-col :span="24">
                <div class="page-heading">
                  <div>
                    <h1>{{ t('menu.nodes') }}</h1>
                    <p>{{ t('pages.nodes.subtitle') }}</p>
                  </div>
                  <a-button type="primary" class="add-connection-button" @click="onAdd">
                    <template #icon><PlusOutlined /></template>
                    {{ t('pages.nodes.addNode') }}
                  </a-button>
                </div>
              </a-col>

              <a-col :span="24">
                <a-row class="metric-grid" :gutter="[12, 12]">
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic :title="t('pages.nodes.totalNodes')" :value="String(totals.total)">
                        <template #prefix>
                          <span class="metric-icon icon-violet"><ApartmentOutlined /></span>
                        </template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic :title="t('pages.nodes.onlineNodes')" :value="String(totals.online)">
                        <template #prefix>
                          <span class="metric-icon icon-green"><CheckCircleOutlined /></span>
                        </template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic :title="t('pages.nodes.offlineNodes')" :value="String(totals.offline)">
                        <template #prefix>
                          <span class="metric-icon icon-red"><CloseCircleOutlined /></span>
                        </template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic
                        :title="t('pages.nodes.avgLatency')"
                        :value="totals.avgLatency > 0 ? `${totals.avgLatency} ms` : '-'"
                      >
                        <template #prefix>
                          <span class="metric-icon icon-amber"><ThunderboltOutlined /></span>
                        </template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                </a-row>
              </a-col>

              <a-col :span="24">
                <NodeList
                  :nodes="nodes"
                  :loading="loading"
                  :probing-ids="probingIds"
                  :toggling-ids="togglingIds"
                  @add="onAdd"
                  @refresh="refresh"
                  @edit="onEdit"
                  @delete="onDelete"
                  @probe="onProbe"
                  @toggle-enable="onToggleEnable"
                />
              </a-col>
            </a-row>
          </a-spin>
        </a-layout-content>
      </a-layout>

      <NodeFormModal
        v-model:open="formOpen"
        :mode="formMode"
        :node="formNode"
        :test-connection="testConnection"
        :save="onSave"
      />
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.nodes-page {
  --xui-bg: #07080b;
  --xui-surface: rgba(15, 17, 23, 0.94);
  --xui-surface-2: rgba(255, 255, 255, 0.035);
  --xui-surface-3: rgba(255, 255, 255, 0.055);
  --xui-border: rgba(255, 255, 255, 0.065);
  --xui-border-strong: rgba(255, 255, 255, 0.13);
  --xui-primary: #6366f1;
  --xui-primary-soft: rgba(99, 102, 241, 0.14);
  --xui-text-strong: #f1f5f9;
  --xui-text: #cbd5e1;
  --xui-text-muted: #64748b;
  --xui-text-faint: #475569;
  --xui-success: #10b981;
  --xui-warning: #f59e0b;
  --xui-danger: #ef4444;
  --xui-shadow: 0 18px 46px rgba(0, 0, 0, 0.28);

  position: relative;
  min-height: 100vh;
  color: var(--xui-text);
  background: #07080b;
}

.nodes-page.is-dark.is-ultra {
  background: #050609;
}

.nodes-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 72% 42% at 9% -12%, rgba(99, 102, 241, 0.14), transparent 56%),
    radial-gradient(ellipse 52% 38% at 96% 4%, rgba(139, 92, 246, 0.075), transparent 52%);
}

.nodes-page :deep(.ant-layout),
.nodes-page :deep(.ant-layout-content) {
  background: transparent;
}

.content-shell {
  position: relative;
  z-index: 1;
  background: transparent;
}

.content-area {
  padding: 28px 32px 40px !important;
}

.loading-spacer {
  min-height: calc(100vh - 120px);
}

.page-heading {
  align-items: center;
  margin-bottom: 4px;
}

.page-heading h1 {
  color: #f1f5f9;
  font-size: 24px;
}

.page-heading p {
  max-width: 680px;
  color: #64748b;
}

.add-connection-button {
  min-height: 40px;
  border: 0;
  border-radius: 10px;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 18px rgba(99, 102, 241, 0.3);
}

.add-connection-button:hover {
  transform: translateY(-1px);
}

.metric-grid {
  margin: 4px 0 6px;
}

.metric-card {
  min-height: 104px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.065) !important;
  border-radius: 12px !important;
  background: rgba(15, 17, 23, 0.78) !important;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.16) !important;
  backdrop-filter: blur(16px);
}

.metric-card:hover {
  border-color: rgba(255, 255, 255, 0.13) !important;
}

.metric-card :deep(.ant-card-body) {
  min-height: 104px;
  padding: 20px;
}

.metric-card :deep(.ant-statistic-title) {
  margin-bottom: 7px;
  color: #64748b !important;
  font-size: 12px;
}

.metric-card :deep(.ant-statistic-content) {
  color: #f1f5f9 !important;
  font-size: 21px !important;
  font-weight: 750;
}

.metric-card :deep(.ant-statistic-content-prefix) {
  margin-inline-end: 10px;
}

.metric-icon {
  width: 38px;
  height: 38px;
  display: inline-grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 18px;
}

.icon-violet {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.26);
  background: rgba(99, 102, 241, 0.13);
}

.icon-green {
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.11);
}

.icon-red {
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.25);
  background: rgba(239, 68, 68, 0.11);
}

.icon-amber {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.11);
}

:global(.node-form-modal) {
  --xui-bg: #07080b;
  --xui-surface: #0f1117;
  --xui-surface-2: rgba(255, 255, 255, 0.035);
  --xui-surface-3: rgba(255, 255, 255, 0.055);
  --xui-border: rgba(255, 255, 255, 0.065);
  --xui-border-strong: rgba(255, 255, 255, 0.13);
  --xui-primary: #6366f1;
  --xui-primary-soft: rgba(99, 102, 241, 0.14);
  --xui-text-strong: #f1f5f9;
  --xui-text: #cbd5e1;
  --xui-text-muted: #64748b;
  --xui-danger: #ef4444;
}

:global(.node-confirm-modal) {
  --xui-bg: #07080b;
  --xui-surface: #0f1117;
  --xui-surface-2: rgba(255, 255, 255, 0.035);
  --xui-border: rgba(255, 255, 255, 0.065);
  --xui-text-strong: #f1f5f9;
  --xui-text: #cbd5e1;
  --xui-text-muted: #64748b;
  --xui-primary: #6366f1;
}

:global(.ant-modal.node-confirm-modal .ant-modal-content),
:global(.node-form-modal .ant-modal-content) {
  border: 1px solid rgba(255, 255, 255, 0.065) !important;
  border-radius: 14px !important;
  color: #cbd5e1;
  background: #0f1117 !important;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.52) !important;
}

:global(.ant-modal.node-confirm-modal .ant-modal-confirm-title),
:global(.node-form-modal .ant-modal-title) {
  color: #f1f5f9 !important;
}

:global(.ant-modal.node-confirm-modal .ant-modal-confirm-content) {
  color: #64748b !important;
}

:global(.node-form-modal .ant-modal-header),
:global(.node-form-modal .ant-modal-footer) {
  border-color: rgba(255, 255, 255, 0.065) !important;
  background: #0f1117 !important;
}

:global(.node-form-modal .ant-modal-body) {
  color: #cbd5e1;
  background: #090b10 !important;
}

:global(.node-form-modal .ant-btn-primary) {
  border-color: transparent !important;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 16px rgba(99, 102, 241, 0.28);
}

:global(.node-form-modal :is(.ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-select-selector)) {
  border-color: rgba(255, 255, 255, 0.075) !important;
  color: #cbd5e1 !important;
  background: rgba(255, 255, 255, 0.035) !important;
}

@media (max-width: 768px) {
  .content-area {
    padding: 76px 12px 28px !important;
  }

  .page-heading {
    align-items: flex-start;
  }

  .page-heading h1 {
    font-size: 21px;
  }

  .add-connection-button {
    flex: 0 0 auto;
  }

  .metric-card {
    min-height: 94px;
  }

  .metric-card :deep(.ant-card-body) {
    min-height: 94px;
    padding: 15px 13px;
  }
}
</style>
