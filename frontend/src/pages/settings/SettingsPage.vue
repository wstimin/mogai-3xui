<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal } from 'ant-design-vue';
import {
  SettingOutlined,
  SafetyOutlined,
  MessageOutlined,
  CloudServerOutlined,
  CodeOutlined,
  SaveOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue';

import { HttpUtil, PromiseUtil } from '@/utils';
import { theme as themeState, antdThemeConfig } from '@/composables/useTheme.js';
import { useMediaQuery } from '@/composables/useMediaQuery.js';
import AppSidebar from '@/components/AppSidebar.vue';
import { useAllSetting } from './useAllSetting.js';
import GeneralTab from './GeneralTab.vue';
import SecurityTab from './SecurityTab.vue';
import TelegramTab from './TelegramTab.vue';
import SubscriptionGeneralTab from './SubscriptionGeneralTab.vue';
import SubscriptionFormatsTab from './SubscriptionFormatsTab.vue';

const { t } = useI18n();
const {
  fetched,
  spinning,
  saveDisabled,
  allSetting,
  saveAll,
  discardChanges,
} = useAllSetting();
const { isMobile } = useMediaQuery();

const basePath = window.__X_UI_BASE_PATH__ || '';
const requestUri = window.location.pathname;

function scrollTarget() {
  return document.getElementById('content-layout');
}

const entryHost = ref('');
const entryPort = ref('');
const entryIsIP = ref(false);

function isIp(host) {
  if (typeof host !== 'string') return false;
  const v4 = host.split('.');
  if (v4.length === 4 && v4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    return true;
  }
  if (!host.includes(':') || host.includes(':::')) return false;
  const parts = host.split('::');
  if (parts.length > 2) return false;
  const split = (value) => (value ? value.split(':').filter(Boolean) : []);
  const head = split(parts[0]);
  const tail = split(parts[1]);
  const valid = (segment) => /^[0-9a-fA-F]{1,4}$/.test(segment);
  if (![...head, ...tail].every(valid)) return false;
  const groups = head.length + tail.length;
  return parts.length === 2 ? groups < 8 : groups === 8;
}

onMounted(() => {
  entryHost.value = window.location.hostname;
  entryPort.value = window.location.port;
  entryIsIP.value = isIp(entryHost.value);
});

function rebuildUrlAfterRestart() {
  const { webDomain, webPort, webBasePath, webCertFile, webKeyFile } = allSetting;
  const newProtocol = (webCertFile || webKeyFile) ? 'https:' : 'http:';
  let base = webBasePath ? webBasePath.replace(/^\//, '') : '';
  if (base && !base.endsWith('/')) base += '/';

  if (!entryIsIP.value) {
    const url = new URL(window.location.href);
    url.pathname = `/${base}panel/settings`;
    url.protocol = newProtocol;
    return url.toString();
  }

  let finalHost = entryHost.value;
  let finalPort = entryPort.value || '';
  if (webDomain && isIp(webDomain)) finalHost = webDomain;
  if (webPort && Number(webPort) !== Number(entryPort.value)) finalPort = String(webPort);

  const url = new URL(`${newProtocol}//${finalHost}`);
  if (finalPort) url.port = finalPort;
  url.pathname = `/${base}panel/settings`;
  return url.toString();
}

async function restartPanel() {
  const confirmed = await new Promise((resolve) => {
    Modal.confirm({
      class: 'settings-confirm-modal',
      title: t('pages.settings.restartPanel'),
      content: t('pages.settings.restartPanelDesc'),
      okText: t('pages.settings.restartPanel'),
      cancelText: t('cancel'),
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
  if (!confirmed) return;

  spinning.value = true;
  try {
    const msg = await HttpUtil.post('/panel/setting/restartPanel');
    if (!msg?.success) return;
    await PromiseUtil.sleep(5000);
    window.location.replace(rebuildUrlAfterRestart());
  } finally {
    spinning.value = false;
  }
}

const confAlerts = computed(() => {
  const warnings = [];
  if (window.location.protocol !== 'https:') {
    warnings.push(t('pages.settings.securityWarnings.http'));
  }
  if (allSetting.webPort === 2053) {
    warnings.push(t('pages.settings.securityWarnings.port'));
  }
  const shortPath = window.location.pathname.split('/').length < 4;
  if (shortPath && allSetting.webBasePath === '/') {
    warnings.push(t('pages.settings.securityWarnings.basePath'));
  }
  if (allSetting.subEnable) {
    let subPath = allSetting.subPath;
    if (allSetting.subURI) {
      try { subPath = new URL(allSetting.subURI).pathname; } catch (_error) { /* Keep configured path. */ }
    }
    if (subPath === '/sub/') warnings.push(t('pages.settings.securityWarnings.subPath'));
  }
  if (allSetting.subJsonEnable) {
    let jsonPath = allSetting.subJsonPath;
    if (allSetting.subJsonURI) {
      try { jsonPath = new URL(allSetting.subJsonURI).pathname; } catch (_error) { /* Keep configured path. */ }
    }
    if (jsonPath === '/json/') warnings.push(t('pages.settings.securityWarnings.jsonPath'));
  }
  return warnings;
});

const alertVisible = ref(true);
const initialTab = window.location.hash === '#subscription' ? '4' : '1';
</script>

<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-layout class="settings-page" :class="{ 'is-dark': themeState.isDark, 'is-ultra': themeState.isUltra }">
      <AppSidebar :base-path="basePath" :request-uri="requestUri" dashboard-style />

      <a-layout class="content-shell">
        <a-layout-content id="content-layout" class="content-area">
          <a-spin :spinning="spinning || !fetched" :delay="200" :tip="t('loading')" size="large">
            <div v-if="!fetched" class="loading-spacer" />

            <template v-else>
              <div class="page-heading">
                <div>
                  <h1>{{ t('menu.settings') }}</h1>
                  <p>{{ t('pages.settings.subtitle') }}</p>
                </div>
                <a-button class="restart-button" :disabled="!saveDisabled" @click="restartPanel">
                  <template #icon><ReloadOutlined /></template>
                  <span v-if="!isMobile">{{ t('pages.settings.restartPanel') }}</span>
                </a-button>
              </div>

              <a-alert
                v-if="confAlerts.length > 0 && alertVisible"
                type="error"
                show-icon
                closable
                class="conf-alert"
                @close="alertVisible = false"
              >
                <template #message>{{ t('pages.settings.securityWarnings.title') }}</template>
                <template #description>
                  <b>{{ t('pages.settings.securityWarnings.description') }}</b>
                  <ul>
                    <li v-for="(msg, index) in confAlerts" :key="index">{{ msg }}</li>
                  </ul>
                </template>
              </a-alert>

              <a-back-top :target="scrollTarget" :visibility-height="200" />
              <div class="settings-workspace">
                <a-tabs :default-active-key="initialTab" class="settings-tabs">
                  <a-tab-pane key="1" class="tab-pane">
                    <template #tab><SettingOutlined /><span>{{ t('pages.settings.panelSettings') }}</span></template>
                    <GeneralTab :all-setting="allSetting" />
                  </a-tab-pane>
                  <a-tab-pane key="2" class="tab-pane">
                    <template #tab><SafetyOutlined /><span>{{ t('pages.settings.securitySettings') }}</span></template>
                    <SecurityTab :all-setting="allSetting" />
                  </a-tab-pane>
                  <a-tab-pane key="3" class="tab-pane">
                    <template #tab><MessageOutlined /><span>{{ t('pages.settings.TGBotSettings') }}</span></template>
                    <TelegramTab :all-setting="allSetting" />
                  </a-tab-pane>
                  <a-tab-pane id="subscription" key="4" class="tab-pane">
                    <template #tab><CloudServerOutlined /><span>{{ t('pages.settings.subSettings') }}</span></template>
                    <SubscriptionGeneralTab :all-setting="allSetting" />
                  </a-tab-pane>
                  <a-tab-pane v-if="allSetting.subJsonEnable || allSetting.subClashEnable" key="5" class="tab-pane">
                    <template #tab><CodeOutlined /><span>{{ t('pages.settings.subscriptionFormats') }}</span></template>
                    <SubscriptionFormatsTab :all-setting="allSetting" />
                  </a-tab-pane>
                </a-tabs>
              </div>

              <div class="save-bar">
                <div class="save-state">
                  <span class="save-state-dot" :class="{ clean: saveDisabled }" />
                  <div>
                    <strong>{{ saveDisabled ? t('pages.settings.savedState') : t('pages.settings.unsavedState') }}</strong>
                    <span>{{ t('pages.settings.saveHint') }}</span>
                  </div>
                </div>
                <div class="save-actions">
                  <a-button :disabled="saveDisabled" @click="discardChanges">
                    {{ t('pages.settings.discardChanges') }}
                  </a-button>
                  <a-button type="primary" :disabled="saveDisabled" @click="saveAll">
                    <template #icon><SaveOutlined /></template>
                    {{ t('pages.settings.save') }}
                  </a-button>
                </div>
              </div>
            </template>
          </a-spin>
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.settings-page {
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

.settings-page.is-dark.is-ultra {
  background: #050609;
}

.settings-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 72% 42% at 9% -12%, rgba(99, 102, 241, 0.14), transparent 56%),
    radial-gradient(ellipse 52% 38% at 96% 4%, rgba(139, 92, 246, 0.075), transparent 52%);
}

.settings-page :deep(.ant-layout),
.settings-page :deep(.ant-layout-content) {
  background: transparent;
}

.content-shell {
  position: relative;
  z-index: 1;
  background: transparent;
}

.content-area {
  padding: 28px 32px 112px !important;
}

.loading-spacer {
  min-height: calc(100vh - 120px);
}

.page-heading {
  align-items: center;
  margin-bottom: 20px;
}

.page-heading h1 {
  color: #f1f5f9;
  font-size: 24px;
}

.page-heading p {
  max-width: 720px;
  color: #64748b;
}

.restart-button {
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

.conf-alert {
  margin: 4px 0 16px;
  border: 1px solid rgba(239, 68, 68, 0.24) !important;
  border-radius: 12px !important;
  background: rgba(239, 68, 68, 0.075) !important;
}

.conf-alert :deep(.ant-alert-message) {
  color: #fecaca !important;
  font-weight: 700;
}

.conf-alert :deep(.ant-alert-description) {
  color: #94a3b8 !important;
}

.settings-tabs :deep(.ant-tabs-nav) {
  margin: 0 0 18px;
  padding: 4px;
  border: 1px solid var(--xui-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.settings-tabs :deep(.ant-tabs-nav::before),
.settings-tabs :deep(.ant-tabs-ink-bar) {
  display: none;
}

.settings-tabs :deep(.ant-tabs-tab) {
  min-height: 40px;
  margin: 0 3px 0 0;
  padding: 9px 16px;
  border-radius: 9px;
  transition: color 0.18s ease, background 0.18s ease;
}

.settings-tabs :deep(.ant-tabs-tab:hover) {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.035);
}

.settings-tabs :deep(.ant-tabs-tab-active) {
  background: rgba(99, 102, 241, 0.14);
}

.settings-tabs :deep(.ant-tabs-tab-btn) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #64748b;
  font-size: 13px;
  font-weight: 600;
}

.settings-tabs :deep(.ant-tabs-tab-active .ant-tabs-tab-btn) {
  color: #a5b4fc !important;
}

.settings-tabs :deep(.ant-tabs-content-holder) {
  overflow: visible;
  background: transparent;
}

.tab-pane {
  min-height: 420px;
}

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
  border-radius: 14px !important;
  background: rgba(15, 17, 23, 0.82) !important;
  box-shadow: 0 12px 34px rgba(0, 0, 0, 0.16);
  backdrop-filter: blur(16px);
}

.tab-pane :deep(.ant-collapse-header) {
  min-height: 62px;
  align-items: center !important;
  padding: 17px 20px !important;
  color: #f1f5f9 !important;
  font-size: 14px;
  font-weight: 700;
}

.tab-pane :deep(.ant-collapse-expand-icon) {
  color: #64748b;
}

.tab-pane :deep(.ant-collapse-content) {
  border-top: 1px solid var(--xui-border) !important;
  background: rgba(8, 10, 14, 0.44) !important;
}

.tab-pane :deep(.ant-collapse-content-box) {
  padding: 0 !important;
}

.tab-pane :deep(.ant-list-item) {
  min-height: 78px;
  padding: 16px 20px !important;
  border-block-end-color: rgba(255, 255, 255, 0.05) !important;
  transition: background-color 0.16s ease;
}

.tab-pane :deep(.ant-list-item:hover) {
  background: rgba(255, 255, 255, 0.018) !important;
}

.tab-pane :deep(.ant-list-item > .ant-row) {
  width: 100%;
  align-items: center;
}

.tab-pane :deep(.ant-list-item-meta) {
  align-items: center;
}

.tab-pane :deep(.ant-list-item-meta-title) {
  margin-bottom: 3px !important;
  color: #f1f5f9 !important;
  font-size: 13px;
  font-weight: 650;
}

.tab-pane :deep(.ant-list-item-meta-description) {
  color: #64748b !important;
  font-size: 11.5px;
  line-height: 1.55;
}

.tab-pane :deep(.ant-list-item .ant-input),
.tab-pane :deep(.ant-list-item .ant-input-affix-wrapper),
.tab-pane :deep(.ant-list-item .ant-input-number),
.tab-pane :deep(.ant-list-item .ant-select),
.tab-pane :deep(.ant-list-item .ant-picker) {
  width: 100% !important;
}

.tab-pane :deep(:is(.ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select-selector)) {
  min-height: 40px;
  border-color: rgba(255, 255, 255, 0.075) !important;
  border-radius: 10px !important;
  color: #cbd5e1 !important;
  background: rgba(255, 255, 255, 0.035) !important;
  box-shadow: none !important;
}

.tab-pane :deep(:is(.ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select-selector):hover) {
  border-color: rgba(255, 255, 255, 0.14) !important;
}

.tab-pane :deep(.ant-input-affix-wrapper-focused),
.tab-pane :deep(.ant-input-number-focused),
.tab-pane :deep(.ant-select-focused .ant-select-selector),
.tab-pane :deep(.ant-input:focus) {
  border-color: #6366f1 !important;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.14) !important;
}

.tab-pane :deep(.ant-input) {
  color: #cbd5e1 !important;
}

.tab-pane :deep(.ant-switch) {
  min-width: 44px;
  height: 24px;
  background: rgba(255, 255, 255, 0.1);
}

.tab-pane :deep(.ant-switch-checked) {
  background: #6366f1 !important;
}

.tab-pane :deep(.ant-btn) {
  min-height: 38px;
  border-color: rgba(255, 255, 255, 0.08);
  border-radius: 9px;
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.035);
}

.tab-pane :deep(.ant-btn-primary) {
  border-color: transparent !important;
  color: #fff !important;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 16px rgba(99, 102, 241, 0.24);
}

.tab-pane :deep(.ant-divider) {
  color: #64748b;
  border-color: rgba(255, 255, 255, 0.065);
  font-size: 11px;
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
  border-top: 1px solid rgba(255, 255, 255, 0.065);
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
  background: #f59e0b;
  box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.1);
}

.save-state-dot.clean {
  background: #10b981;
  box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.1);
}

.save-state div {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.save-state strong {
  color: #cbd5e1;
  font-size: 12.5px;
}

.save-state span {
  overflow: hidden;
  color: #64748b;
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
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.035);
}

.save-actions :deep(.ant-btn-primary) {
  border-color: transparent !important;
  color: #fff;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 18px rgba(99, 102, 241, 0.28);
}

:global(.ant-modal.settings-confirm-modal .ant-modal-content) {
  border: 1px solid rgba(255, 255, 255, 0.065) !important;
  border-radius: 14px !important;
  color: #cbd5e1;
  background: #0f1117 !important;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.52) !important;
}

:global(.ant-modal.settings-confirm-modal .ant-modal-confirm-title) {
  color: #f1f5f9 !important;
}

:global(.ant-modal.settings-confirm-modal .ant-modal-confirm-content) {
  color: #64748b !important;
}

:global(.ant-modal.settings-confirm-modal .ant-btn-primary) {
  border-color: transparent !important;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
}

@media (max-width: 768px) {
  .content-area {
    padding: 76px 12px 116px !important;
  }

  .page-heading {
    align-items: flex-start;
  }

  .settings-tabs :deep(.ant-tabs-nav) {
    padding: 4px;
  }

  .settings-tabs :deep(.ant-tabs-tab) {
    padding: 8px 11px;
  }

  .tab-pane :deep(.ant-collapse-header) {
    padding: 15px 16px !important;
  }

  .tab-pane :deep(.ant-list-item) {
    padding: 14px 16px !important;
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
