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

const { fetched, spinning, saveDisabled, allSetting, saveAll } = useAllSetting();
const { isMobile } = useMediaQuery();

const basePath = window.__X_UI_BASE_PATH__ || '';
const requestUri = window.location.pathname;

// AD-Vue 4's <a-back-top> calls `target()` after mount to find the
// scrolled element. Inline-arrow `() => document.getElementById(...)`
// in the template threw "Cannot read properties of undefined (reading
// 'getElementById')" because of how Vue 3 evaluates the expression
// outside the script-setup scope — wrap in a regular function so
// `document` resolves to the window global at call time.
function scrollTarget() {
  return document.getElementById('content-layout');
}

// `entry*` mirrors the URL the user opened the panel with so the page
// can rebuild it after a restart that may change host/port/scheme.
const entryHost = ref('');
const entryPort = ref('');
const entryIsIP = ref(false);

function isIp(h) {
  if (typeof h !== 'string') return false;
  // IPv4: four dot-separated octets 0-255.
  const v4 = h.split('.');
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return true;
  // IPv6: hex groups, optional single :: compression.
  if (!h.includes(':') || h.includes(':::')) return false;
  const parts = h.split('::');
  if (parts.length > 2) return false;
  const split = (s) => (s ? s.split(':').filter(Boolean) : []);
  const head = split(parts[0]);
  const tail = split(parts[1]);
  const valid = (seg) => /^[0-9a-fA-F]{1,4}$/.test(seg);
  if (![...head, ...tail].every(valid)) return false;
  const groups = head.length + tail.length;
  return parts.length === 2 ? groups < 8 : groups === 8;
}

onMounted(() => {
  entryHost.value = window.location.hostname;
  entryPort.value = window.location.port;
  entryIsIP.value = isIp(entryHost.value);
});

// Rebuild the URL after a restart — host/port/scheme may have changed
// (cert toggled on, port edited, base path edited).
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
      title: 'Restart panel',
      content: 'Restart the panel now? Your session will reconnect once it comes back.',
      okText: 'Restart',
      cancelText: 'Cancel',
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

// Conf alerts mirror the legacy banner — pure derivation off allSetting.
const confAlerts = computed(() => {
  const out = [];
  if (window.location.protocol !== 'https:') {
    out.push('Panel is served over plain HTTP — set up TLS for production.');
  }
  if (allSetting.webPort === 2053) {
    out.push('Default port 2053 is well-known — change it to a random port.');
  }
  const segs = window.location.pathname.split('/').length < 4;
  if (segs && allSetting.webBasePath === '/') {
    out.push('Default base path "/" is well-known — change it to a random path.');
  }
  if (allSetting.subEnable) {
    let subPath = allSetting.subPath;
    if (allSetting.subURI) {
      try { subPath = new URL(allSetting.subURI).pathname; } catch (_e) { }
    }
    if (subPath === '/sub/') {
      out.push('Default subscription path "/sub/" is well-known — change it.');
    }
  }
  if (allSetting.subJsonEnable) {
    let p = allSetting.subJsonPath;
    if (allSetting.subJsonURI) {
      try { p = new URL(allSetting.subJsonURI).pathname; } catch (_e) { }
    }
    if (p === '/json/') {
      out.push('Default JSON subscription path "/json/" is well-known — change it.');
    }
  }
  return out;
});

const alertVisible = ref(true);
const initialTab = window.location.hash === '#subscription' ? '4' : '1';
</script>

<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-layout class="settings-page" :class="{ 'is-dark': themeState.isDark, 'is-ultra': themeState.isUltra }">
      <AppSidebar :base-path="basePath" :request-uri="requestUri" />

      <a-layout class="content-shell">
        <a-layout-content id="content-layout" class="content-area">
          <a-spin :spinning="spinning || !fetched" :delay="200" tip="Loading…" size="large">
            <div v-if="!fetched" class="loading-spacer" />

            <template v-else>
              <div class="page-heading">
                <div>
                  <h1>{{ t('menu.settings') }}</h1>
                  <p>{{ t('pages.settings.infoDesc') }}</p>
                </div>
                <div class="heading-actions">
                  <a-button type="primary" :disabled="saveDisabled" @click="saveAll">
                    <template #icon><SaveOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.settings.save') }}</span>
                  </a-button>
                  <a-button danger :disabled="!saveDisabled" @click="restartPanel">
                    <template #icon><ReloadOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.settings.restartPanel') }}</span>
                  </a-button>
                </div>
              </div>

              <a-alert v-if="confAlerts.length > 0 && alertVisible" type="error" show-icon closable class="conf-alert"
                @close="alertVisible = false">
                <template #message>Security warnings</template>
                <template #description>
                  <b>Your panel may be exposed:</b>
                  <ul>
                    <li v-for="(msg, i) in confAlerts" :key="i">{{ msg }}</li>
                  </ul>
                </template>
              </a-alert>

              <a-row :gutter="[isMobile ? 8 : 16, isMobile ? 0 : 12]">
                <a-col :span="24">
                  <a-back-top :target="scrollTarget" :visibility-height="200" />
                  <div class="settings-workspace">
                  <a-tabs :default-active-key="initialTab" class="settings-tabs">
                    <a-tab-pane key="1" class="tab-pane">
                      <template #tab>
                        <SettingOutlined />
                        <span>{{ t('pages.settings.panelSettings') }}</span>
                      </template>
                      <GeneralTab :all-setting="allSetting" />
                    </a-tab-pane>
                    <a-tab-pane key="2" class="tab-pane">
                      <template #tab>
                        <SafetyOutlined />
                        <span>{{ t('pages.settings.securitySettings') }}</span>
                      </template>
                      <SecurityTab :all-setting="allSetting" />
                    </a-tab-pane>
                    <a-tab-pane key="3" class="tab-pane">
                      <template #tab>
                        <MessageOutlined />
                        <span>{{ t('pages.settings.TGBotSettings') }}</span>
                      </template>
                      <TelegramTab :all-setting="allSetting" />
                    </a-tab-pane>
                    <a-tab-pane id="subscription" key="4" class="tab-pane">
                      <template #tab>
                        <CloudServerOutlined />
                        <span>{{ t('pages.settings.subSettings') }}</span>
                      </template>
                      <SubscriptionGeneralTab :all-setting="allSetting" />
                    </a-tab-pane>
                    <a-tab-pane v-if="allSetting.subJsonEnable || allSetting.subClashEnable" key="5" class="tab-pane">
                      <template #tab>
                        <CodeOutlined />
                        <span>{{ t('pages.settings.subSettings') }} (Formats)</span>
                      </template>
                      <SubscriptionFormatsTab :all-setting="allSetting" />
                    </a-tab-pane>
                  </a-tabs>
                  </div>
                </a-col>
              </a-row>
            </template>
          </a-spin>
        </a-layout-content>
      </a-layout>
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.settings-page {
  --bg-page: #e6e8ec;
  --bg-card: #ffffff;

  min-height: 100vh;
  background: var(--bg-page);
}

.settings-page.is-dark {
  --bg-page: #0a1222;
  --bg-card: #151f31;
}

.settings-page.is-dark.is-ultra {
  --bg-page: #050505;
  --bg-card: #0c0e12;
}

.settings-page :deep(.ant-layout),
.settings-page :deep(.ant-layout-content) {
  background: transparent;
}

.content-shell {
  background: transparent;
}

.loading-spacer {
  min-height: calc(100vh - 120px);
}

.conf-alert {
  margin-bottom: 16px;
}

.heading-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.settings-workspace {
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.settings-tabs :deep(.ant-tabs-nav) {
  margin: 0;
  padding: 0 16px;
  border: 0;
  border-bottom: 1px solid var(--xui-border);
  border-radius: 0;
  background: var(--xui-surface-2);
}

.settings-tabs :deep(.ant-tabs-tab) {
  min-height: 54px;
  margin: 0 24px 0 0;
  padding: 14px 0;
}

.settings-tabs :deep(.ant-tabs-tab-btn) {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 650;
}

.settings-tabs :deep(.ant-tabs-content-holder) {
  margin-top: 0;
  padding: 16px;
  background: var(--xui-bg);
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

.tab-pane :deep(.ant-list-item > .ant-row) {
  width: 100%;
  align-items: center;
}

.tab-pane :deep(.ant-list-item-meta) {
  align-items: center;
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

.tab-pane :deep(.ant-list-item .ant-input),
.tab-pane :deep(.ant-list-item .ant-input-affix-wrapper),
.tab-pane :deep(.ant-list-item .ant-input-number),
.tab-pane :deep(.ant-list-item .ant-select),
.tab-pane :deep(.ant-list-item .ant-picker) {
  width: 100% !important;
}

.tab-pane :deep(.ant-divider) {
  color: var(--xui-text-muted);
  border-color: var(--xui-border);
  font-size: 11px;
}

@media (max-width: 768px) {
  .page-heading {
    align-items: flex-start;
  }

  .heading-actions {
    flex: 0 0 auto;
  }

  .settings-tabs :deep(.ant-tabs-nav) {
    padding: 0 10px;
  }

  .settings-tabs :deep(.ant-tabs-tab) {
    margin-right: 16px;
  }

  .settings-tabs :deep(.ant-tabs-content-holder) {
    padding: 10px;
  }
}
</style>
