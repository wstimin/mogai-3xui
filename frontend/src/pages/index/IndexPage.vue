<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal } from 'ant-design-vue';
import {
  AreaChartOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarsOutlined,
  ClockCircleOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  ControlOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  GlobalOutlined,
  ReloadOutlined,
  SwapOutlined,
} from '@ant-design/icons-vue';

import { HttpUtil, SizeFormatter, TimeFormatter } from '@/utils';
import { theme as themeState, antdThemeConfig } from '@/composables/useTheme.js';
import { useStatus } from '@/composables/useStatus.js';
import { useMediaQuery } from '@/composables/useMediaQuery.js';
import AppSidebar from '@/components/AppSidebar.vue';
import TextModal from '@/components/TextModal.vue';
import StatusCard from './StatusCard.vue';
import XrayStatusCard from './XrayStatusCard.vue';
import PanelUpdateModal from './PanelUpdateModal.vue';
import LogModal from './LogModal.vue';
import BackupModal from './BackupModal.vue';
import SystemHistoryModal from './SystemHistoryModal.vue';
import XrayLogModal from './XrayLogModal.vue';
import VersionModal from './VersionModal.vue';

const { t, locale } = useI18n();
const { status, fetched, refresh } = useStatus();
const { isMobile } = useMediaQuery();
const isChinese = computed(() => locale.value === 'zh-CN');
const dashboardCopy = computed(() => (isChinese.value
  ? {
    subtitle: '实时监控服务器资源、网络流量与 Xray 服务状态',
    refresh: '刷新',
    refreshing: '刷新中',
    serviceOnline: 'Xray 运行中',
    serviceStopped: 'Xray 已停止',
    serviceError: 'Xray 异常',
    serviceUnknown: 'Xray 状态未知',
    runtimeOverview: '运行概览',
    networkOverview: '网络与连接',
    currentSpeed: '实时速率',
    accumulatedTraffic: '累计流量',
    publicAddress: '公网地址',
    activeConnections: '活动连接',
    panelService: '面板服务',
  }
  : {
    subtitle: 'Monitor server resources, network traffic, and Xray service status in real time',
    refresh: 'Refresh',
    refreshing: 'Refreshing',
    serviceOnline: 'Xray running',
    serviceStopped: 'Xray stopped',
    serviceError: 'Xray error',
    serviceUnknown: 'Xray status unknown',
    runtimeOverview: 'Runtime overview',
    networkOverview: 'Network and connections',
    currentSpeed: 'Current speed',
    accumulatedTraffic: 'Accumulated traffic',
    publicAddress: 'Public address',
    activeConnections: 'Active connections',
    panelService: 'Panel service',
  }));

const ipLimitEnable = ref(false);
HttpUtil.post('/panel/setting/defaultSettings').then((msg) => {
  if (msg?.success && msg.obj) ipLimitEnable.value = !!msg.obj.ipLimitEnable;
});

const panelUpdateInfo = ref({ currentVersion: '', latestVersion: '', updateAvailable: false });
onMounted(() => {
  HttpUtil.get('/panel/api/server/getPanelUpdateInfo').then((msg) => {
    if (msg?.success && msg.obj) panelUpdateInfo.value = msg.obj;
  });
});

const basePath = window.__X_UI_BASE_PATH__ || '';
const requestUri = window.location.pathname;
const displayVersion = computed(
  () => panelUpdateInfo.value?.currentVersion || window.__X_UI_CUR_VER__ || '?',
);

const showIp = ref(false);
const logsOpen = ref(false);
const backupOpen = ref(false);
const panelUpdateOpen = ref(false);
const sysHistoryOpen = ref(false);
const xrayLogsOpen = ref(false);
const versionOpen = ref(false);
const configTextOpen = ref(false);
const configText = ref('');

const loading = ref(false);
const loadingTip = ref(t('loading'));
const xrayControlLoading = ref('');
const refreshing = ref(false);

const xrayStateClass = computed(() => `state-${status.value.xray.state || 'unknown'}`);
const xrayStatusText = computed(() => {
  if (status.value.xray.state === 'running') return dashboardCopy.value.serviceOnline;
  if (status.value.xray.state === 'stop') return dashboardCopy.value.serviceStopped;
  if (status.value.xray.state === 'error') return dashboardCopy.value.serviceError;
  return dashboardCopy.value.serviceUnknown;
});

function setBusy({ busy, tip }) {
  loading.value = busy;
  if (tip) loadingTip.value = tip;
}

async function refreshStatus() {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    await refresh();
  } finally {
    refreshing.value = false;
  }
}

async function runXrayControl(action) {
  if (xrayControlLoading.value) return;
  xrayControlLoading.value = action;
  try {
    const endpoint = action === 'stop' ? 'stopXrayService' : 'restartXrayService';
    const msg = await HttpUtil.post(`/panel/api/server/${endpoint}`);
    if (msg?.success) await refresh();
  } finally {
    xrayControlLoading.value = '';
  }
}

function confirmXrayControl(action) {
  const actionText = t(action === 'stop' ? 'pages.index.stopXray' : 'pages.index.restartXray');
  Modal.confirm({
    title: `${actionText} Xray?`,
    okText: actionText,
    okType: action === 'stop' ? 'danger' : 'primary',
    cancelText: t('close'),
    onOk: () => runXrayControl(action),
  });
}

function stopXray() { confirmXrayControl('stop'); }
function restartXray() { confirmXrayControl('restart'); }
function openSystemHistory() { sysHistoryOpen.value = true; }
function openXrayLogs() { xrayLogsOpen.value = true; }
function openVersionSwitch() { versionOpen.value = true; }

async function openConfig() {
  loading.value = true;
  try {
    const msg = await HttpUtil.get('/panel/api/server/getConfigJson');
    if (!msg?.success) return;
    configText.value = JSON.stringify(msg.obj, null, 2);
    configTextOpen.value = true;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-layout class="index-page" :class="{ 'is-dark': themeState.isDark, 'is-ultra': themeState.isUltra }">
      <AppSidebar :base-path="basePath" :request-uri="requestUri" dashboard-style />

      <a-layout class="content-shell">
        <a-layout-content class="content-area">
          <a-spin :spinning="loading || !fetched" :delay="200" :tip="loading ? loadingTip : t('loading')" size="large">
            <div v-if="!fetched" class="loading-spacer" />

            <div v-else class="dashboard-layout">
              <div class="page-heading dashboard-heading">
                <div>
                  <h1>{{ t('menu.dashboard') }}</h1>
                  <p>{{ dashboardCopy.subtitle }}</p>
                </div>
                <div class="heading-actions">
                  <div class="service-pill" :class="xrayStateClass">
                    <span class="service-dot" />
                    <span>{{ xrayStatusText }}</span>
                  </div>
                  <a-button class="dashboard-button refresh-button" :loading="refreshing" @click="refreshStatus">
                    <template #icon><ReloadOutlined /></template>
                    <span v-if="!isMobile">{{ refreshing ? dashboardCopy.refreshing : dashboardCopy.refresh }}</span>
                  </a-button>
                  <a-button class="dashboard-button" @click="logsOpen = true">
                    <template #icon><BarsOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.index.logs') }}</span>
                  </a-button>
                  <a-button class="dashboard-button" @click="openConfig">
                    <template #icon><ControlOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.index.config') }}</span>
                  </a-button>
                  <a-button class="dashboard-button primary-action" type="primary" @click="backupOpen = true">
                    <template #icon><CloudServerOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.index.backupTitle') }}</span>
                  </a-button>
                </div>
              </div>

              <StatusCard :status="status" :is-mobile="isMobile" />

              <div class="primary-grid">
                <XrayStatusCard :status="status" :is-mobile="isMobile" :ip-limit-enable="ipLimitEnable"
                  :control-loading="xrayControlLoading" @stop-xray="stopXray" @restart-xray="restartXray"
                  @open-xray-logs="openXrayLogs" @open-logs="logsOpen = true"
                  @open-version-switch="openVersionSwitch" />

                <a-card class="dashboard-card operations-card" hoverable>
                  <template #title>
                    <div class="card-title-block">
                      <span class="card-title-icon tone-purple"><ClockCircleOutlined /></span>
                      <div>
                        <strong>{{ dashboardCopy.runtimeOverview }}</strong>
                        <span>{{ t('pages.index.operationHours') }}</span>
                      </div>
                    </div>
                  </template>
                  <template #extra>
                    <a-tooltip :title="t('pages.index.systemHistoryTitle')">
                      <a-button class="icon-button" @click="openSystemHistory">
                        <template #icon><AreaChartOutlined /></template>
                      </a-button>
                    </a-tooltip>
                  </template>
                  <div class="operations-list">
                    <div class="operation-row">
                      <span><i class="operation-dot dot-primary" />Xray</span>
                      <strong>{{ TimeFormatter.formatSecond(status.appStats.uptime) }}</strong>
                    </div>
                    <div class="operation-row">
                      <span><i class="operation-dot dot-success" />OS</span>
                      <strong>{{ TimeFormatter.formatSecond(status.uptime) }}</strong>
                    </div>
                    <div class="operation-row">
                      <span><i class="operation-dot dot-warning" />{{ t('pages.index.systemLoad') }}</span>
                      <a-tooltip :title="t('pages.index.systemLoadDesc')">
                        <strong>{{ status.loads[0] }} / {{ status.loads[1] }} / {{ status.loads[2] }}</strong>
                      </a-tooltip>
                    </div>
                    <div class="operation-row">
                      <span><i class="operation-dot dot-purple" />{{ dashboardCopy.panelService }}</span>
                      <strong>{{ SizeFormatter.sizeFormat(status.appStats.mem) }} · {{ status.appStats.threads }} {{ t('pages.index.threads') }}</strong>
                    </div>
                  </div>
                </a-card>
              </div>

              <section class="network-section">
                <div class="section-heading">
                  <div>
                    <h2>{{ dashboardCopy.networkOverview }}</h2>
                    <p>{{ t('pages.index.overallSpeed') }} · {{ t('pages.index.totalData') }}</p>
                  </div>
                </div>

                <div class="data-grid">
                <a-card class="dashboard-card data-card" hoverable>
                  <div class="data-card-heading">
                    <div>
                      <span>{{ dashboardCopy.currentSpeed }}</span>
                      <strong>{{ t('pages.index.overallSpeed') }}</strong>
                    </div>
                    <span class="data-card-icon tone-primary"><ArrowUpOutlined /></span>
                  </div>
                  <div class="metric-list">
                    <div class="metric-row">
                      <span><ArrowUpOutlined class="color-cyan" />{{ t('pages.index.upload') }}</span>
                      <strong>{{ SizeFormatter.sizeFormat(status.netIO.up) }}<small>/s</small></strong>
                    </div>
                    <div class="metric-row">
                      <span><ArrowDownOutlined class="color-blue" />{{ t('pages.index.download') }}</span>
                      <strong>{{ SizeFormatter.sizeFormat(status.netIO.down) }}<small>/s</small></strong>
                    </div>
                  </div>
                </a-card>

                <a-card class="dashboard-card data-card" hoverable>
                  <div class="data-card-heading">
                    <div>
                      <span>{{ dashboardCopy.accumulatedTraffic }}</span>
                      <strong>{{ t('pages.index.totalData') }}</strong>
                    </div>
                    <span class="data-card-icon tone-success"><CloudDownloadOutlined /></span>
                  </div>
                  <div class="metric-list">
                    <div class="metric-row">
                      <span><CloudUploadOutlined class="color-green" />{{ t('pages.index.sent') }}</span>
                      <strong>{{ SizeFormatter.sizeFormat(status.netTraffic.sent) }}</strong>
                    </div>
                    <div class="metric-row">
                      <span><CloudDownloadOutlined class="color-amber" />{{ t('pages.index.received') }}</span>
                      <strong>{{ SizeFormatter.sizeFormat(status.netTraffic.recv) }}</strong>
                    </div>
                  </div>
                </a-card>

                <a-card class="dashboard-card data-card ip-card" hoverable>
                  <div class="data-card-heading">
                    <div>
                      <span>{{ dashboardCopy.publicAddress }}</span>
                      <strong>{{ t('pages.index.ipAddresses') }}</strong>
                    </div>
                    <div class="data-card-actions">
                      <a-tooltip :title="t('pages.index.toggleIpVisibility')">
                        <a-button class="icon-button" @click="showIp = !showIp">
                          <template #icon><component :is="showIp ? EyeOutlined : EyeInvisibleOutlined" /></template>
                        </a-button>
                      </a-tooltip>
                      <span class="data-card-icon tone-warning"><GlobalOutlined /></span>
                    </div>
                  </div>
                  <div class="metric-list" :class="showIp ? 'ip-visible' : 'ip-hidden'">
                    <div class="metric-row ip-row"><span>IPv4</span><strong>{{ status.publicIP.ipv4 }}</strong></div>
                    <div class="metric-row ip-row"><span>IPv6</span><strong>{{ status.publicIP.ipv6 }}</strong></div>
                  </div>
                </a-card>

                <a-card class="dashboard-card data-card" hoverable>
                  <div class="data-card-heading">
                    <div>
                      <span>{{ dashboardCopy.activeConnections }}</span>
                      <strong>{{ t('pages.index.connectionCount') }}</strong>
                    </div>
                    <span class="data-card-icon tone-purple"><SwapOutlined /></span>
                  </div>
                  <div class="metric-list">
                    <div class="metric-row"><span><SwapOutlined class="color-green" />TCP</span><strong>{{ status.tcpCount }}</strong></div>
                    <div class="metric-row"><span><SwapOutlined class="color-amber" />UDP</span><strong>{{ status.udpCount }}</strong></div>
                  </div>
                </a-card>
                </div>
              </section>

              <a-card class="dashboard-card project-card" title="X Panel" hoverable>
                <div class="project-row">
                  <div class="project-links">
                    <a href="https://github.com/wstimin/mogai-3xui/releases" target="_blank" rel="noopener noreferrer">
                      <a-tag color="green">v{{ displayVersion }}</a-tag>
                    </a>
                    <a href="https://t.me/XrayUI" target="_blank" rel="noopener noreferrer">
                      <a-tag color="cyan">@XrayUI</a-tag>
                    </a>
                    <a href="https://github.com/wstimin/mogai-3xui/wiki" target="_blank" rel="noopener noreferrer">
                      <a-tag color="blue">{{ t('pages.index.documentation') }}</a-tag>
                    </a>
                  </div>
                  <a-button v-if="panelUpdateInfo.updateAvailable" type="primary" @click="panelUpdateOpen = true">
                    <template #icon><CloudDownloadOutlined /></template>
                    {{ t('pages.index.updatePanel') }} · {{ panelUpdateInfo.latestVersion }}
                  </a-button>
                  <a-tag v-else color="green">{{ t('pages.index.panelUpToDate') }}</a-tag>
                </div>
              </a-card>
            </div>
          </a-spin>
        </a-layout-content>
      </a-layout>

      <PanelUpdateModal v-model:open="panelUpdateOpen" :info="panelUpdateInfo" @busy="setBusy" />
      <LogModal v-model:open="logsOpen" />
      <BackupModal v-model:open="backupOpen" :base-path="basePath" @busy="setBusy" />
      <SystemHistoryModal v-model:open="sysHistoryOpen" :status="status" />
      <XrayLogModal v-model:open="xrayLogsOpen" />
      <VersionModal v-model:open="versionOpen" :status="status" @busy="setBusy" />
      <TextModal v-model:open="configTextOpen" :title="t('pages.index.config')" :content="configText"
        file-name="config.json" />
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.index-page {
  --dashboard-bg: #08090c;
  --dashboard-sidebar: #0c0e13;
  --dashboard-card: rgba(18, 21, 28, 0.75);
  --dashboard-card-solid: #12151c;
  --dashboard-border: rgba(255, 255, 255, 0.06);
  --dashboard-border-hover: rgba(255, 255, 255, 0.12);
  --dashboard-primary: #6366f1;
  --dashboard-primary-bright: #818cf8;
  --dashboard-purple: #a78bfa;
  --dashboard-success: #10b981;
  --dashboard-warning: #f59e0b;
  --dashboard-danger: #ef4444;
  --dashboard-text: #f1f5f9;
  --dashboard-muted: #64748b;
  --xui-bg: var(--dashboard-bg);
  --xui-sidebar: var(--dashboard-sidebar);
  --xui-surface: var(--dashboard-card-solid);
  --xui-surface-2: rgba(255, 255, 255, 0.025);
  --xui-surface-3: rgba(255, 255, 255, 0.045);
  --xui-border: var(--dashboard-border);
  --xui-border-strong: var(--dashboard-border-hover);
  --xui-text-strong: var(--dashboard-text);
  --xui-text: #cbd5e1;
  --xui-text-muted: var(--dashboard-muted);
  --xui-text-faint: #475569;
  --xui-primary: var(--dashboard-primary);
  --xui-primary-soft: rgba(99, 102, 241, 0.16);
  position: relative;
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(ellipse 80% 50% at 10% -20%, rgba(99, 102, 241, 0.18), transparent 68%),
    radial-gradient(ellipse 60% 40% at 90% 10%, rgba(139, 92, 246, 0.12), transparent 68%),
    radial-gradient(ellipse 50% 30% at 50% 100%, rgba(16, 185, 129, 0.06), transparent 72%),
    var(--dashboard-bg) !important;
}

.index-page::before {
  content: '';
  position: fixed;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  opacity: 0.45;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.014) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.014) 1px, transparent 1px);
  background-size: 48px 48px;
}

.index-page :deep(.ant-layout),
.index-page :deep(.ant-layout-content),
.content-shell {
  position: relative;
  z-index: 1;
  background: transparent !important;
}

.content-area {
  padding: 30px 32px 40px !important;
}

.loading-spacer {
  min-height: calc(100vh - 120px);
}

.dashboard-layout {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.dashboard-heading {
  align-items: center;
  margin-bottom: 0;
}

.dashboard-heading h1 {
  color: var(--dashboard-text);
  font-size: 25px;
  font-weight: 700;
}

.dashboard-heading p {
  margin-top: 5px;
  color: var(--dashboard-muted);
}

.heading-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.service-pill {
  min-height: 36px;
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 14px;
  border: 1px solid rgba(100, 116, 139, 0.22);
  border-radius: 999px;
  color: #94a3b8;
  background: rgba(100, 116, 139, 0.1);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.service-pill.state-running {
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.25);
  background: rgba(16, 185, 129, 0.12);
}

.service-pill.state-stop {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.25);
  background: rgba(245, 158, 11, 0.11);
}

.service-pill.state-error {
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.26);
  background: rgba(239, 68, 68, 0.11);
}

.service-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.18);
}

.service-pill.state-running .service-dot { box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.22); }
.service-pill.state-stop .service-dot { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.2); }
.service-pill.state-error .service-dot { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2); }

.dashboard-button {
  min-height: 36px;
  color: #94a3b8;
  border-color: var(--dashboard-border);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.dashboard-button:hover,
.dashboard-button:focus {
  color: var(--dashboard-text) !important;
  border-color: var(--dashboard-border-hover) !important;
  background: rgba(255, 255, 255, 0.05) !important;
}

.dashboard-button.primary-action {
  color: #fff;
  border: 0;
  background: linear-gradient(135deg, var(--dashboard-primary), #7c3aed) !important;
  box-shadow: 0 5px 16px rgba(99, 102, 241, 0.3);
}

.dashboard-button.primary-action:hover,
.dashboard-button.primary-action:focus {
  color: #fff !important;
  transform: translateY(-1px);
  box-shadow: 0 8px 22px rgba(99, 102, 241, 0.38);
}

:deep(.dashboard-card.ant-card) {
  overflow: hidden;
  border: 1px solid var(--dashboard-border) !important;
  border-radius: 18px !important;
  background: var(--dashboard-card) !important;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14) !important;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}

:deep(.dashboard-card.ant-card-hoverable:hover) {
  transform: translateY(-3px);
  border-color: var(--dashboard-border-hover) !important;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3) !important;
}

:deep(.dashboard-card .ant-card-head) {
  min-height: 66px;
  padding: 0 22px;
  border-bottom-color: var(--dashboard-border) !important;
}

:deep(.dashboard-card .ant-card-body) {
  padding: 22px;
}

.primary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 20px;
}

.operations-card {
  height: 100%;
}

.operations-list {
  display: flex;
  flex-direction: column;
}

.card-title-block {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-title-block > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-title-block strong {
  color: var(--dashboard-text);
  font-size: 14px;
  font-weight: 650;
}

.card-title-block span:not(.card-title-icon) {
  color: var(--dashboard-muted);
  font-size: 11px;
  font-weight: 500;
}

.card-title-icon,
.data-card-icon {
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
}

.card-title-icon {
  width: 38px;
  height: 38px;
  font-size: 17px;
}

.operation-row {
  min-height: 51px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--dashboard-border);
}

.operation-row:last-child {
  border-bottom: 0;
}

.operation-row span {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: #94a3b8;
  font-size: 12px;
}

.operation-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--dashboard-text);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.operation-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 7px;
  border-radius: 50%;
}

.dot-primary { background: var(--dashboard-primary); box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.16); }
.dot-success { background: var(--dashboard-success); box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16); }
.dot-warning { background: var(--dashboard-warning); box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.14); }
.dot-purple { background: var(--dashboard-purple); box-shadow: 0 0 0 3px rgba(167, 139, 250, 0.14); }

.network-section {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.section-heading h2 {
  margin: 0;
  color: var(--dashboard-text);
  font-size: 16px;
  font-weight: 650;
}

.section-heading p {
  margin: 4px 0 0;
  color: var(--dashboard-muted);
  font-size: 12px;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.data-card {
  min-width: 0;
}

.data-card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 20px;
}

.data-card-heading > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.data-card-heading .data-card-actions {
  min-width: auto;
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.data-card-heading span:not(.data-card-icon) {
  color: var(--dashboard-muted);
  font-size: 11px;
}

.data-card-heading strong {
  color: var(--dashboard-text);
  font-size: 14px;
  font-weight: 650;
}

.data-card-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  font-size: 17px;
}

.tone-primary { color: #a5b4fc; border-color: rgba(99, 102, 241, 0.18); background: rgba(99, 102, 241, 0.14); }
.tone-success { color: #34d399; border-color: rgba(16, 185, 129, 0.18); background: rgba(16, 185, 129, 0.13); }
.tone-warning { color: #fbbf24; border-color: rgba(245, 158, 11, 0.18); background: rgba(245, 158, 11, 0.13); }
.tone-purple { color: #c4b5fd; border-color: rgba(167, 139, 250, 0.18); background: rgba(167, 139, 250, 0.13); }

.metric-list {
  display: flex;
  flex-direction: column;
}

.metric-row {
  min-width: 0;
  min-height: 39px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--dashboard-border);
}

.metric-row:last-child {
  border-bottom: 0;
}

.metric-row > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: #94a3b8;
  font-size: 12px;
}

.metric-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--dashboard-text);
  font-size: 14px;
  font-weight: 650;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-row small {
  margin-left: 3px;
  color: var(--dashboard-muted);
  font-size: 10px;
  font-weight: 500;
}

.icon-button {
  width: 34px;
  height: 34px;
  padding: 0;
  color: #94a3b8;
  border-color: var(--dashboard-border);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.025);
}

.icon-button:hover,
.icon-button:focus {
  color: #c4b5fd !important;
  border-color: rgba(167, 139, 250, 0.3) !important;
  background: rgba(167, 139, 250, 0.08) !important;
}

.color-blue { color: #60a5fa; }
.color-cyan { color: #22d3ee; }
.color-green { color: #34d399; }
.color-amber { color: #fbbf24; }

.ip-hidden .ip-row strong {
  filter: blur(6px);
  transition: filter 0.2s ease;
}

.ip-visible .ip-row strong {
  filter: none;
}

.ip-row strong {
  max-width: 72%;
  font-size: 12px;
}

.project-row,
.project-links {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.project-row {
  justify-content: space-between;
}

.project-links a {
  display: inline-flex;
}

.project-links :deep(.ant-tag) {
  margin-inline-end: 0;
}

:deep(.project-card .ant-tag) {
  border-radius: 7px;
}

@media (max-width: 1280px) {
  .data-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 960px) {
  .primary-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .content-area {
    padding: 76px 16px 24px !important;
  }

  .dashboard-heading {
    align-items: flex-start;
  }

  .heading-actions {
    flex: 0 0 auto;
  }
}

@media (max-width: 576px) {
  .dashboard-heading {
    flex-direction: column;
  }

  .heading-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .service-pill {
    width: 100%;
    justify-content: center;
  }

  .dashboard-button {
    flex: 1;
  }

  .data-grid {
    grid-template-columns: 1fr;
  }

  .project-row {
    align-items: stretch;
    flex-direction: column;
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.dashboard-card.ant-card),
  .dashboard-button {
    transition: none;
  }
}
</style>
