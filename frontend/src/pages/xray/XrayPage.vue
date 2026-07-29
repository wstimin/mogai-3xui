<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal } from 'ant-design-vue';
import {
  SettingOutlined,
  SwapOutlined,
  UploadOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  CodeOutlined,
  FileTextOutlined,
  SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue';

import { theme as themeState, antdThemeConfig } from '@/composables/useTheme.js';
import { useMediaQuery } from '@/composables/useMediaQuery.js';
import AppSidebar from '@/components/AppSidebar.vue';
import BasicsTab from './BasicsTab.vue';
import RoutingTab from './RoutingTab.vue';
import OutboundsTab from './OutboundsTab.vue';
import BalancersTab from './BalancersTab.vue';
import DnsTab from './DnsTab.vue';
import WarpModal from './WarpModal.vue';
import NordModal from './NordModal.vue';
import { useXraySetting } from './useXraySetting.js';
import { useWebSocket } from '@/composables/useWebSocket.js';

const { t } = useI18n();

const {
  fetched,
  spinning,
  saveDisabled,
  fetchError,
  xraySetting,
  templateSettings,
  outboundTestUrl,
  inboundTags,
  clientReverseTags,
  restartResult,
  outboundsTraffic,
  outboundTestStates,
  fetchAll,
  resetOutboundsTraffic,
  testOutbound,
  saveAll,
  discardChanges,
  resetToDefault,
  restartXray,
  applyOutboundsEvent,
} = useXraySetting();

// Live outbounds traffic — pushed by xray_traffic_job every ~10s.
useWebSocket({ outbounds: applyOutboundsEvent });

async function onTestOutbound(idx) {
  const outbound = templateSettings.value?.outbounds?.[idx];
  if (outbound) await testOutbound(idx, outbound);
}

function onDeleteOutbound(idx) {
  templateSettings.value.outbounds.splice(idx, 1);
  outboundTestStates.value = Object.fromEntries(
    Object.entries(outboundTestStates.value)
      .filter(([k]) => Number(k) !== idx)
      .map(([k, v]) => [Number(k) > idx ? Number(k) - 1 : Number(k), v]),
  );
}

// === Advanced tab — radio-driven view ==============================
// Mirrors the legacy advanced page: a 4-way radio toggles which slice
// of the xray config the textarea edits — the full config, just the
// inbounds, just the outbounds, or just the routing rules. Each slice
// reads/writes through templateSettings so edits propagate to the
// dirty state and structured tabs.
const advSettings = ref('xraySetting');

const advancedText = computed({
  get: () => {
    if (advSettings.value === 'xraySetting') return xraySetting.value;
    const t = templateSettings.value;
    if (!t) return '';
    try {
      switch (advSettings.value) {
        case 'inboundSettings':
          return JSON.stringify(t.inbounds || [], null, 2);
        case 'outboundSettings':
          return JSON.stringify(t.outbounds || [], null, 2);
        case 'routingRuleSettings':
          return JSON.stringify(t.routing?.rules || [], null, 2);
        default:
          return '';
      }
    } catch (_e) {
      return '';
    }
  },
  set: (next) => {
    if (advSettings.value === 'xraySetting') {
      xraySetting.value = next;
      return;
    }
    // Slice edits: parse-then-merge into templateSettings so the
    // structured tabs and the dirty state re-stringify it cleanly.
    let parsed;
    try { parsed = JSON.parse(next); } catch (_e) { return; }
    const t = templateSettings.value;
    if (!t) return;
    switch (advSettings.value) {
      case 'inboundSettings':
        t.inbounds = parsed;
        break;
      case 'outboundSettings':
        t.outbounds = parsed;
        break;
      case 'routingRuleSettings':
        if (!t.routing) t.routing = {};
        t.routing.rules = parsed;
        break;
    }
  },
});

// `WarpExist` / `NordExist` derive from the parsed templateSettings —
// the Basics tab gates its WARP / NordVPN domain selectors on whether
// the matching outbound is provisioned and opens the real setup modal
// when the corresponding outbound is missing.
const warpExist = computed(
  () => !!templateSettings.value?.outbounds?.find((o) => o?.tag === 'warp'),
);
const nordExist = computed(
  () => !!templateSettings.value?.outbounds?.find((o) => o?.tag?.startsWith?.('nord-')),
);

// === WARP / NordVPN provisioning modals ============================
const warpOpen = ref(false);
const nordOpen = ref(false);

function showWarp() { warpOpen.value = true; }
function showNord() { nordOpen.value = true; }

function ensureOutbounds() {
  if (!templateSettings.value) return null;
  if (!Array.isArray(templateSettings.value.outbounds)) {
    templateSettings.value.outbounds = [];
  }
  return templateSettings.value.outbounds;
}

function onAddOutbound(outbound) {
  const list = ensureOutbounds();
  if (list) list.push(outbound);
}
function onResetOutbound({ index, outbound, oldTag, newTag }) {
  const list = ensureOutbounds();
  if (!list || index < 0) return;
  list[index] = outbound;
  // Tag rename across routing rules — preserves Nord's
  // server-switch flow without dangling references.
  if (oldTag && newTag && oldTag !== newTag) {
    const rules = templateSettings.value?.routing?.rules || [];
    for (const r of rules) {
      if (r?.outboundTag === oldTag) r.outboundTag = newTag;
    }
  }
}
function onRemoveOutboundByTag(tag) {
  const list = ensureOutbounds();
  if (!list) return;
  const idx = list.findIndex((o) => o?.tag === tag);
  if (idx >= 0) list.splice(idx, 1);
}
function onRemoveOutboundByIndex(index) {
  const list = ensureOutbounds();
  if (list && index >= 0) list.splice(index, 1);
}
function onRemoveRoutingRules({ prefix }) {
  const rules = templateSettings.value?.routing?.rules;
  if (!Array.isArray(rules)) return;
  templateSettings.value.routing.rules = rules.filter(
    (r) => !r?.outboundTag?.startsWith?.(prefix),
  );
}

const { isMobile } = useMediaQuery();

const basePath = window.__X_UI_BASE_PATH__ || '';
const requestUri = window.location.pathname;

// See SettingsPage scrollTarget — wrap so `document` is in scope.
function scrollTarget() {
  return document.getElementById('content-layout');
}

function confirmRestart() {
  Modal.confirm({
    class: 'xray-confirm-modal',
    title: t('pages.xray.restartConfirmTitle'),
    content: t('pages.xray.restartConfirmDesc'),
    okText: t('pages.xray.restart'),
    cancelText: t('cancel'),
    onOk: () => restartXray(),
  });
}
</script>

<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-layout
      class="xray-page"
      :class="{ 'is-dark': themeState.isDark, 'is-ultra': themeState.isUltra }"
    >
      <AppSidebar :base-path="basePath" :request-uri="requestUri" dashboard-style />

      <a-layout class="content-shell">
        <a-layout-content id="content-layout" class="content-area">
          <a-spin :spinning="spinning || !fetched" :delay="200" :tip="t('loading')" size="large">
            <div v-if="!fetched" class="loading-spacer" />

            <a-result
              v-else-if="fetchError"
              status="error"
              :title="t('somethingWentWrong')"
              :sub-title="fetchError"
            >
              <template #extra>
                <a-button type="primary" @click="fetchAll">{{ t('check') }}</a-button>
              </template>
            </a-result>

            <template v-else>
              <div class="page-heading">
                <div>
                  <h1>{{ t('pages.xray.title') }}</h1>
                  <p>{{ t('pages.xray.subtitle') }}</p>
                </div>
                <div class="heading-actions">
                  <a-button class="restart-button" :disabled="!saveDisabled" @click="confirmRestart">
                    <template #icon><ReloadOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.xray.restart') }}</span>
                  </a-button>
                  <a-popover v-if="restartResult" placement="bottomRight" trigger="click">
                    <template #title>{{ t('pages.xray.restartOutput') }}</template>
                    <template #content>
                      <pre class="restart-result">{{ restartResult }}</pre>
                    </template>
                    <a-tooltip :title="t('pages.xray.restartOutput')">
                      <a-button class="result-button" shape="circle">
                        <template #icon><FileTextOutlined /></template>
                      </a-button>
                    </a-tooltip>
                  </a-popover>
                </div>
              </div>

              <a-row :gutter="[isMobile ? 8 : 16, isMobile ? 0 : 12]">
                <!-- Tabs -->
                <a-col :span="24">
                  <a-back-top :target="scrollTarget" :visibility-height="200" />
                  <div class="xray-workspace">
                  <a-tabs default-active-key="tpl-basic" class="xray-tabs">
                    <a-tab-pane key="tpl-basic" class="tab-pane">
                      <template #tab>
                        <SettingOutlined /> <span>{{ t('pages.xray.basicTemplate') }}</span>
                      </template>
                      <BasicsTab
                        :template-settings="templateSettings"
                        :outbound-test-url="outboundTestUrl"
                        :warp-exist="warpExist"
                        :nord-exist="nordExist"
                        @update:outbound-test-url="(v) => (outboundTestUrl = v)"
                        @show-warp="showWarp"
                        @show-nord="showNord"
                        @reset-default="resetToDefault"
                      />
                    </a-tab-pane>

                    <a-tab-pane key="tpl-routing" class="tab-pane">
                      <template #tab>
                        <SwapOutlined /> <span>{{ t('pages.xray.Routings') }}</span>
                      </template>
                      <RoutingTab
                        :template-settings="templateSettings"
                        :inbound-tags="inboundTags"
                        :client-reverse-tags="clientReverseTags"
                        :is-mobile="isMobile"
                      />
                    </a-tab-pane>

                    <a-tab-pane key="tpl-outbound" class="tab-pane">
                      <template #tab>
                        <UploadOutlined /> <span>{{ t('pages.xray.Outbounds') }}</span>
                      </template>
                      <OutboundsTab
                        :template-settings="templateSettings"
                        :outbounds-traffic="outboundsTraffic"
                        :outbound-test-states="outboundTestStates"
                        :inbound-tags="inboundTags"
                        :is-mobile="isMobile"
                        @reset-traffic="resetOutboundsTraffic"
                        @test="onTestOutbound"
                        @delete="onDeleteOutbound"
                        @show-warp="showWarp"
                        @show-nord="showNord"
                      />
                    </a-tab-pane>

                    <a-tab-pane key="tpl-balancer" class="tab-pane">
                      <template #tab>
                        <ClusterOutlined /> <span>{{ t('pages.xray.Balancers') }}</span>
                      </template>
                      <BalancersTab
                        :template-settings="templateSettings"
                        :client-reverse-tags="clientReverseTags"
                      />
                    </a-tab-pane>

                    <a-tab-pane key="tpl-dns" class="tab-pane">
                      <template #tab>
                        <DatabaseOutlined /> <span>DNS</span>
                      </template>
                      <DnsTab :template-settings="templateSettings" />
                    </a-tab-pane>

                    <a-tab-pane key="tpl-advanced" class="tab-pane">
                      <template #tab>
                        <CodeOutlined /> <span>{{ t('pages.xray.advancedTemplate') }}</span>
                      </template>
                      <div class="advanced-editor">
                        <div class="advanced-header">
                          <div class="advanced-copy">
                            <strong>{{ t('pages.xray.Template') }}</strong>
                            <span>{{ t('pages.xray.TemplateDesc') }}</span>
                          </div>
                          <a-radio-group
                            v-model:value="advSettings"
                            button-style="solid"
                            :size="isMobile ? 'small' : 'middle'"
                            class="advanced-mode"
                          >
                            <a-radio-button value="xraySetting">{{ t('pages.xray.completeTemplate') }}</a-radio-button>
                            <a-radio-button value="inboundSettings">{{ t('pages.xray.Inbounds') }}</a-radio-button>
                            <a-radio-button value="outboundSettings">{{ t('pages.xray.Outbounds') }}</a-radio-button>
                            <a-radio-button value="routingRuleSettings">{{ t('pages.xray.Routings') }}</a-radio-button>
                          </a-radio-group>
                        </div>
                        <div class="editor-surface">
                          <a-textarea
                            v-model:value="advancedText"
                            :auto-size="{ minRows: 18, maxRows: 40 }"
                            spellcheck="false"
                            class="json-editor"
                          />
                        </div>
                      </div>
                    </a-tab-pane>
                  </a-tabs>
                  </div>
                </a-col>
              </a-row>

              <div class="save-bar">
                <div class="save-state">
                  <span class="save-state-dot" :class="{ clean: saveDisabled }" />
                  <div>
                    <strong>{{ saveDisabled ? t('pages.xray.savedState') : t('pages.xray.unsavedState') }}</strong>
                    <span>{{ t('pages.xray.saveHint') }}</span>
                  </div>
                </div>
                <div class="save-actions">
                  <a-button :disabled="saveDisabled" @click="discardChanges">
                    {{ t('pages.xray.discardChanges') }}
                  </a-button>
                  <a-button type="primary" :disabled="saveDisabled" @click="saveAll">
                    <template #icon><SaveOutlined /></template>
                    {{ t('pages.xray.save') }}
                  </a-button>
                </div>
              </div>
            </template>
          </a-spin>
        </a-layout-content>
      </a-layout>

      <WarpModal
        v-model:open="warpOpen"
        :template-settings="templateSettings"
        @add-outbound="onAddOutbound"
        @reset-outbound="onResetOutbound"
        @remove-outbound="onRemoveOutboundByTag"
      />
      <NordModal
        v-model:open="nordOpen"
        :template-settings="templateSettings"
        @add-outbound="onAddOutbound"
        @reset-outbound="onResetOutbound"
        @remove-outbound="onRemoveOutboundByIndex"
        @remove-routing-rules="onRemoveRoutingRules"
      />
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.xray-page {
  --bg-page: #e6e8ec;
  --bg-card: #ffffff;

  min-height: 100vh;
  background: var(--bg-page);
}

.xray-page.is-dark {
  --bg-page: #0a1222;
  --bg-card: #151f31;
}

.xray-page.is-dark.is-ultra {
  --bg-page: #050505;
  --bg-card: #0c0e12;
}

.xray-page :deep(.ant-layout),
.xray-page :deep(.ant-layout-content) {
  background: transparent;
}

.content-shell { background: transparent; }
.loading-spacer { min-height: calc(100vh - 120px); }

.heading-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.xray-workspace {
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.xray-tabs :deep(.ant-tabs-nav) {
  margin: 0;
  padding: 0 16px;
  border-bottom: 1px solid var(--xui-border);
  background: var(--xui-surface-2);
}

.xray-tabs :deep(.ant-tabs-tab) {
  min-height: 54px;
  margin: 0 24px 0 0;
  padding: 14px 0;
}

.xray-tabs :deep(.ant-tabs-tab-btn) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 650;
}

.xray-tabs :deep(.ant-tabs-content-holder) {
  margin-top: 0;
  padding: 16px;
  background: var(--xui-bg);
}

.tab-pane { min-height: 420px; }

.tab-pane :deep(.ant-collapse) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border: 0 !important;
  background: transparent !important;
}

.tab-pane :deep(.ant-collapse-item) {
  overflow: hidden;
  border: 1px solid var(--xui-border) !important;
  border-radius: 8px !important;
  background: var(--xui-surface) !important;
}

.tab-pane :deep(.ant-collapse-header) {
  min-height: 48px;
  align-items: center !important;
  padding: 13px 16px !important;
  font-size: 13px;
  font-weight: 700;
}

.tab-pane :deep(.ant-collapse-content) {
  border-top: 1px solid var(--xui-border) !important;
  background: var(--xui-surface) !important;
}

.tab-pane :deep(.ant-collapse-content-box) {
  padding: 0 !important;
}

.tab-pane :deep(.ant-list-item) {
  min-height: 66px;
  padding: 13px 16px !important;
  transition: background-color 0.16s ease;
}

.tab-pane :deep(.ant-list-item:hover) {
  background: var(--xui-surface-2) !important;
}

.tab-pane :deep(.ant-list-item-meta-title) {
  margin-bottom: 3px !important;
  color: var(--xui-text-strong) !important;
  font-size: 12px;
  font-weight: 650;
}

.tab-pane :deep(.ant-list-item-meta-description) {
  color: var(--xui-text-muted) !important;
  font-size: 11px;
  line-height: 1.55;
}

.result-button {
  color: var(--xui-primary);
}

.restart-result {
  max-width: 480px;
  white-space: pre-wrap;
  font-size: 12px;
  margin: 0;
}

.json-editor {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}

.advanced-editor {
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
}

.advanced-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--xui-border);
  background: var(--xui-surface-2);
}

.advanced-mode {
  flex: 0 0 auto;
}

.editor-surface {
  padding: 12px;
  background: var(--xui-bg);
}

.editor-surface :deep(textarea.ant-input) {
  resize: vertical;
  color: var(--xui-text);
  border-color: var(--xui-border);
  background: var(--xui-surface-2);
}

@media (max-width: 768px) {
  .page-heading {
    align-items: flex-start;
  }

  .heading-actions {
    flex: 0 0 auto;
  }

  .xray-tabs :deep(.ant-tabs-nav) {
    padding: 0 10px;
  }

  .xray-tabs :deep(.ant-tabs-tab) {
    margin-right: 16px;
  }

  .xray-tabs :deep(.ant-tabs-content-holder) {
    padding: 10px;
  }

  .advanced-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .advanced-mode {
    display: flex;
    width: 100%;
    overflow-x: auto;
  }
}
</style>

<style scoped>
.xray-page {
  --xui-bg: #07080b;
  --xui-surface: rgba(15, 17, 23, 0.88);
  --xui-surface-2: rgba(255, 255, 255, 0.035);
  --xui-surface-3: rgba(255, 255, 255, 0.055);
  --xui-border: rgba(255, 255, 255, 0.065);
  --xui-border-strong: rgba(255, 255, 255, 0.13);
  --xui-primary: #6366f1;
  --xui-primary-soft: rgba(99, 102, 241, 0.14);
  --xui-text-strong: #f1f5f9;
  --xui-text: #cbd5e1;
  --xui-text-muted: #64748b;
  --xui-success: #10b981;
  --xui-warning: #f59e0b;
  --xui-danger: #ef4444;
  position: relative;
  min-height: 100vh;
  color: var(--xui-text);
  background: #07080b;
}

.xray-page.is-dark.is-ultra {
  background: #050609;
}

.xray-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 72% 42% at 9% -12%, rgba(99, 102, 241, 0.14), transparent 56%),
    radial-gradient(ellipse 52% 38% at 96% 4%, rgba(139, 92, 246, 0.075), transparent 52%);
}

.content-shell {
  position: relative;
  z-index: 1;
}

.content-area {
  padding: 28px 32px 112px !important;
}

.page-heading {
  align-items: center;
  margin-bottom: 20px;
}

.page-heading h1 {
  color: var(--xui-text-strong);
  font-size: 24px;
}

.page-heading p {
  max-width: 760px;
  color: var(--xui-text-muted);
}

.restart-button,
.result-button {
  min-height: 40px;
  border-color: rgba(255, 255, 255, 0.08) !important;
  border-radius: 10px;
  color: #94a3b8 !important;
  background: rgba(255, 255, 255, 0.03) !important;
}

.restart-button:not(:disabled):hover {
  border-color: rgba(245, 158, 11, 0.32) !important;
  color: #fbbf24 !important;
  background: rgba(245, 158, 11, 0.08) !important;
}

.result-button:hover {
  border-color: rgba(99, 102, 241, 0.35) !important;
  color: #a5b4fc !important;
  background: rgba(99, 102, 241, 0.1) !important;
}

.xray-workspace {
  overflow: visible;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
}

.xray-tabs :deep(.ant-tabs-nav) {
  margin: 0 0 18px;
  padding: 4px;
  border: 1px solid var(--xui-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.xray-tabs :deep(.ant-tabs-nav::before),
.xray-tabs :deep(.ant-tabs-ink-bar) {
  display: none;
}

.xray-tabs :deep(.ant-tabs-tab) {
  min-height: 40px;
  margin: 0 3px 0 0;
  padding: 9px 16px;
  border-radius: 9px;
  transition: color 0.18s ease, background 0.18s ease;
}

.xray-tabs :deep(.ant-tabs-tab:hover) {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.035);
}

.xray-tabs :deep(.ant-tabs-tab-active) {
  background: var(--xui-primary-soft);
}

.xray-tabs :deep(.ant-tabs-tab-btn) {
  color: var(--xui-text-muted);
  font-size: 13px;
  font-weight: 600;
}

.xray-tabs :deep(.ant-tabs-tab-active .ant-tabs-tab-btn) {
  color: #a5b4fc !important;
}

.xray-tabs :deep(.ant-tabs-content-holder) {
  overflow: visible;
  padding: 0;
  background: transparent;
}

.tab-pane :deep(.ant-collapse-item) {
  border-radius: 14px !important;
  background: rgba(15, 17, 23, 0.82) !important;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(16px);
}

.tab-pane :deep(.ant-collapse-header) {
  min-height: 62px;
  padding: 17px 20px !important;
  color: var(--xui-text-strong) !important;
  font-size: 14px;
}

.tab-pane :deep(.ant-collapse-expand-icon) {
  color: var(--xui-text-muted);
}

.tab-pane :deep(.ant-collapse-content) {
  background: rgba(8, 10, 14, 0.44) !important;
}

.tab-pane :deep(.ant-list-item) {
  min-height: 78px;
  padding: 16px 20px !important;
  border-block-end-color: rgba(255, 255, 255, 0.05) !important;
}

.tab-pane :deep(.ant-list-item-meta-title) {
  color: var(--xui-text-strong) !important;
  font-size: 13px;
}

.tab-pane :deep(.ant-list-item-meta-description) {
  color: var(--xui-text-muted) !important;
  font-size: 11.5px;
}

.tab-pane :deep(:is(.ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select-selector)) {
  min-height: 40px;
  border-color: rgba(255, 255, 255, 0.075) !important;
  border-radius: 10px !important;
  color: var(--xui-text) !important;
  background: rgba(255, 255, 255, 0.035) !important;
  box-shadow: none !important;
}

.tab-pane :deep(.ant-input-affix-wrapper-focused),
.tab-pane :deep(.ant-input-number-focused),
.tab-pane :deep(.ant-select-focused .ant-select-selector),
.tab-pane :deep(.ant-input:focus) {
  border-color: var(--xui-primary) !important;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.14) !important;
}

.tab-pane :deep(.ant-switch) {
  min-width: 44px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
}

.tab-pane :deep(.ant-switch-checked) {
  background: var(--xui-primary) !important;
}

.tab-pane :deep(.ant-btn) {
  min-height: 38px;
  border-color: rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  color: var(--xui-text);
  background: rgba(255, 255, 255, 0.035);
}

.tab-pane :deep(.ant-btn-primary) {
  border-color: transparent !important;
  color: #fff !important;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 16px rgba(99, 102, 241, 0.24);
}

.tab-pane :deep(.ant-table-wrapper) {
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 12px;
}

.tab-pane :deep(.ant-table),
.tab-pane :deep(.ant-table-container),
.tab-pane :deep(.ant-table-content) {
  color: var(--xui-text);
  background: transparent !important;
}

.tab-pane :deep(.ant-table-thead > tr > th) {
  color: var(--xui-text-muted) !important;
  background: rgba(255, 255, 255, 0.035) !important;
}

.tab-pane :deep(.ant-table-tbody > tr > td) {
  border-color: var(--xui-border) !important;
  background: rgba(15, 17, 23, 0.72);
}

.tab-pane :deep(.ant-table-tbody > tr:hover > td) {
  background: rgba(255, 255, 255, 0.035) !important;
}

.advanced-editor {
  border-radius: 14px;
  background: rgba(15, 17, 23, 0.82);
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.16);
}

.advanced-header {
  padding: 18px 20px;
  border-color: var(--xui-border);
  background: rgba(255, 255, 255, 0.025);
}

.advanced-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.advanced-copy strong {
  color: var(--xui-text-strong);
  font-size: 14px;
}

.advanced-copy span {
  color: var(--xui-text-muted);
  font-size: 12px;
}

.advanced-mode :deep(.ant-radio-button-wrapper) {
  border-color: rgba(255, 255, 255, 0.07) !important;
  color: var(--xui-text-muted);
  background: rgba(255, 255, 255, 0.025);
}

.advanced-mode :deep(.ant-radio-button-wrapper-checked) {
  color: #a5b4fc !important;
  background: var(--xui-primary-soft) !important;
}

.editor-surface {
  padding: 14px;
  background: #0a0c11;
}

.editor-surface :deep(textarea.ant-input) {
  min-height: 480px;
  border-radius: 10px !important;
  color: #dbeafe !important;
  background: #0c0e14 !important;
  line-height: 1.65;
}

.save-bar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 260px;
  z-index: 50;
  min-height: 78px;
  padding: 14px 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  border-top: 1px solid var(--xui-border);
  background: rgba(7, 8, 11, 0.9);
  box-shadow: 0 -12px 34px rgba(0, 0, 0, 0.2);
  backdrop-filter: blur(18px);
}

.save-state {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 11px;
}

.save-state-dot {
  width: 9px;
  height: 9px;
  flex: 0 0 9px;
  border-radius: 50%;
  background: var(--xui-warning);
  box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.1);
}

.save-state-dot.clean {
  background: var(--xui-success);
  box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.1);
}

.save-state div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.save-state strong {
  color: var(--xui-text);
  font-size: 12.5px;
}

.save-state span {
  overflow: hidden;
  color: var(--xui-text-muted);
  font-size: 11.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.save-actions {
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
}

.save-actions :deep(.ant-btn) {
  min-height: 40px;
  border-color: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: var(--xui-text);
  background: rgba(255, 255, 255, 0.035);
}

.save-actions :deep(.ant-btn-primary) {
  border-color: transparent !important;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 18px rgba(99, 102, 241, 0.28);
}

:global(.ant-modal.xray-confirm-modal .ant-modal-content),
:global(.ant-modal.xray-form-modal .ant-modal-content) {
  border: 1px solid rgba(255, 255, 255, 0.065) !important;
  border-radius: 14px !important;
  color: #cbd5e1;
  background: #0f1117 !important;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.52) !important;
}

:global(.ant-modal.xray-form-modal .ant-modal-header) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.065);
  background: transparent !important;
}

:global(.ant-modal.xray-form-modal .ant-modal-title),
:global(.ant-modal.xray-confirm-modal .ant-modal-confirm-title) {
  color: #f1f5f9 !important;
}

:global(.ant-modal.xray-form-modal .ant-modal-close),
:global(.ant-modal.xray-confirm-modal .ant-modal-confirm-content),
:global(.ant-modal.xray-form-modal .ant-form-item-label > label) {
  color: #64748b !important;
}

:global(.ant-modal.xray-form-modal :is(.ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-select-selector, .ant-input-group-addon)) {
  border-color: rgba(255, 255, 255, 0.075) !important;
  color: #cbd5e1 !important;
  background: rgba(255, 255, 255, 0.035) !important;
  box-shadow: none !important;
}

:global(.ant-modal.xray-form-modal .ant-divider) {
  border-color: rgba(255, 255, 255, 0.065);
}

:global(.ant-modal.xray-form-modal .ant-btn-primary),
:global(.ant-modal.xray-confirm-modal .ant-btn-primary) {
  border-color: transparent !important;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
}

@media (max-width: 768px) {
  .content-area {
    padding: 76px 12px 116px !important;
  }

  .xray-tabs :deep(.ant-tabs-tab) {
    margin-right: 2px;
    padding: 8px 11px;
  }

  .advanced-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .advanced-mode {
    width: 100%;
  }

  .save-bar {
    left: 0;
    min-height: 88px;
    padding: 12px;
  }

  .save-state span {
    display: none;
  }

  .save-actions {
    gap: 7px;
  }
}
</style>
