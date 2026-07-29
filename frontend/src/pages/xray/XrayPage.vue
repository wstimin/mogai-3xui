<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal, message } from 'ant-design-vue';
import {
  SettingOutlined,
  SwapOutlined,
  UploadOutlined,
  ClusterOutlined,
  DatabaseOutlined,
  CodeOutlined,
  QuestionCircleOutlined,
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
// dirty-poll and structured tabs.
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
    // structured tabs and the dirty-poll re-stringify it cleanly.
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
// the matching outbound is provisioned, falling back to a "configure"
// button that today just toasts (the modals land in 6-v).
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

// `message` is used by some of the in-progress UX flows (kept around
// because future provisioning errors will surface through it).
void message;
const { isMobile } = useMediaQuery();

const basePath = window.__X_UI_BASE_PATH__ || '';
const requestUri = window.location.pathname;

// See SettingsPage scrollTarget — wrap so `document` is in scope.
function scrollTarget() {
  return document.getElementById('content-layout');
}

function confirmRestart() {
  Modal.confirm({
    title: 'Restart xray?',
    content: 'Reloads the xray service with the saved configuration.',
    okText: 'Restart',
    cancelText: 'Cancel',
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
      <AppSidebar :base-path="basePath" :request-uri="requestUri" />

      <a-layout class="content-shell">
        <a-layout-content id="content-layout" class="content-area">
          <a-spin :spinning="spinning || !fetched" :delay="200" tip="Loading…" size="large">
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
                  <h1>{{ t('menu.xray') }}</h1>
                  <p>{{ t('pages.xray.basicTemplate') }} / {{ t('pages.xray.advancedTemplate') }}</p>
                </div>
                <div class="heading-actions">
                  <a-button type="primary" :disabled="saveDisabled" @click="saveAll">
                    <template #icon><SaveOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.xray.save') }}</span>
                  </a-button>
                  <a-button danger :disabled="!saveDisabled" @click="confirmRestart">
                    <template #icon><ReloadOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.xray.restart') }}</span>
                  </a-button>
                  <a-popover v-if="restartResult" placement="bottomRight" trigger="click">
                    <template #title>Xray restart output</template>
                    <template #content>
                      <pre class="restart-result">{{ restartResult }}</pre>
                    </template>
                    <a-tooltip title="Xray restart output">
                      <a-button class="result-button" shape="circle">
                        <template #icon><QuestionCircleOutlined /></template>
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
                          <a-list-item-meta
                            :title="t('pages.xray.Template')"
                            :description="t('pages.xray.TemplateDesc')"
                          />
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
