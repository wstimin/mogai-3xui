<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal } from 'ant-design-vue';
import {
  AreaChartOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarsOutlined,
  CloudDownloadOutlined,
  CloudServerOutlined,
  CloudUploadOutlined,
  ControlOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  GlobalOutlined,
  SwapOutlined,
} from '@ant-design/icons-vue';

import { HttpUtil, SizeFormatter, TimeFormatter } from '@/utils';
import { theme as themeState, antdThemeConfig } from '@/composables/useTheme.js';
import { useStatus } from '@/composables/useStatus.js';
import { useMediaQuery } from '@/composables/useMediaQuery.js';
import AppSidebar from '@/components/AppSidebar.vue';
import CustomStatistic from '@/components/CustomStatistic.vue';
import TextModal from '@/components/TextModal.vue';
import StatusCard from './StatusCard.vue';
import XrayStatusCard from './XrayStatusCard.vue';
import PanelUpdateModal from './PanelUpdateModal.vue';
import LogModal from './LogModal.vue';
import BackupModal from './BackupModal.vue';
import SystemHistoryModal from './SystemHistoryModal.vue';
import XrayLogModal from './XrayLogModal.vue';
import VersionModal from './VersionModal.vue';

const { t } = useI18n();
const { status, fetched, refresh } = useStatus();
const { isMobile } = useMediaQuery();

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

function setBusy({ busy, tip }) {
  loading.value = busy;
  if (tip) loadingTip.value = tip;
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
      <AppSidebar :base-path="basePath" :request-uri="requestUri" />

      <a-layout class="content-shell">
        <a-layout-content class="content-area">
          <a-spin :spinning="loading || !fetched" :delay="200" :tip="loading ? loadingTip : t('loading')" size="large">
            <div v-if="!fetched" class="loading-spacer" />

            <div v-else class="dashboard-layout">
              <div class="page-heading dashboard-heading">
                <div>
                  <h1>{{ t('menu.dashboard') }}</h1>
                  <p>X Panel v{{ displayVersion }} · {{ t('pages.index.systemLoad') }}</p>
                </div>
                <div class="heading-actions">
                  <a-button @click="logsOpen = true">
                    <template #icon><BarsOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.index.logs') }}</span>
                  </a-button>
                  <a-button @click="openConfig">
                    <template #icon><ControlOutlined /></template>
                    <span v-if="!isMobile">{{ t('pages.index.config') }}</span>
                  </a-button>
                  <a-button type="primary" @click="backupOpen = true">
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

                <a-card class="operations-card" :title="t('pages.index.operationHours')" hoverable>
                  <template #extra>
                    <a-tooltip :title="t('pages.index.systemHistoryTitle')">
                      <a-button class="icon-button" @click="openSystemHistory">
                        <template #icon><AreaChartOutlined /></template>
                      </a-button>
                    </a-tooltip>
                  </template>
                  <div class="operations-list">
                    <div class="operation-row">
                      <span>Xray</span>
                      <strong>{{ TimeFormatter.formatSecond(status.appStats.uptime) }}</strong>
                    </div>
                    <div class="operation-row">
                      <span>OS</span>
                      <strong>{{ TimeFormatter.formatSecond(status.uptime) }}</strong>
                    </div>
                    <div class="operation-row">
                      <span>{{ t('pages.index.systemLoad') }}</span>
                      <a-tooltip :title="t('pages.index.systemLoadDesc')">
                        <strong>{{ status.loads[0] }} / {{ status.loads[1] }} / {{ status.loads[2] }}</strong>
                      </a-tooltip>
                    </div>
                    <div class="operation-row">
                      <span>{{ t('usage') }}</span>
                      <strong>{{ SizeFormatter.sizeFormat(status.appStats.mem) }} · {{ status.appStats.threads }} {{ t('pages.index.threads') }}</strong>
                    </div>
                  </div>
                </a-card>
              </div>

              <div class="data-grid">
                <a-card class="data-card" :title="t('pages.index.overallSpeed')" hoverable>
                  <div class="stat-pair">
                    <CustomStatistic :title="t('pages.index.upload')" :value="SizeFormatter.sizeFormat(status.netIO.up)">
                      <template #prefix><ArrowUpOutlined class="color-cyan" /></template>
                      <template #suffix>/s</template>
                    </CustomStatistic>
                    <CustomStatistic :title="t('pages.index.download')" :value="SizeFormatter.sizeFormat(status.netIO.down)">
                      <template #prefix><ArrowDownOutlined class="color-blue" /></template>
                      <template #suffix>/s</template>
                    </CustomStatistic>
                  </div>
                </a-card>

                <a-card class="data-card" :title="t('pages.index.totalData')" hoverable>
                  <div class="stat-pair">
                    <CustomStatistic :title="t('pages.index.sent')" :value="SizeFormatter.sizeFormat(status.netTraffic.sent)">
                      <template #prefix><CloudUploadOutlined class="color-green" /></template>
                    </CustomStatistic>
                    <CustomStatistic :title="t('pages.index.received')" :value="SizeFormatter.sizeFormat(status.netTraffic.recv)">
                      <template #prefix><CloudDownloadOutlined class="color-amber" /></template>
                    </CustomStatistic>
                  </div>
                </a-card>

                <a-card class="data-card" :title="t('pages.index.ipAddresses')" hoverable>
                  <template #extra>
                    <a-tooltip :title="t('pages.index.toggleIpVisibility')">
                      <a-button class="icon-button" @click="showIp = !showIp">
                        <template #icon><component :is="showIp ? EyeOutlined : EyeInvisibleOutlined" /></template>
                      </a-button>
                    </a-tooltip>
                  </template>
                  <div class="stat-pair" :class="showIp ? 'ip-visible' : 'ip-hidden'">
                    <CustomStatistic title="IPv4" :value="status.publicIP.ipv4">
                      <template #prefix><GlobalOutlined class="color-blue" /></template>
                    </CustomStatistic>
                    <CustomStatistic title="IPv6" :value="status.publicIP.ipv6">
                      <template #prefix><GlobalOutlined class="color-cyan" /></template>
                    </CustomStatistic>
                  </div>
                </a-card>

                <a-card class="data-card" :title="t('pages.index.connectionCount')" hoverable>
                  <div class="stat-pair">
                    <CustomStatistic title="TCP" :value="status.tcpCount">
                      <template #prefix><SwapOutlined class="color-green" /></template>
                    </CustomStatistic>
                    <CustomStatistic title="UDP" :value="status.udpCount">
                      <template #prefix><SwapOutlined class="color-amber" /></template>
                    </CustomStatistic>
                  </div>
                </a-card>
              </div>

              <a-card class="project-card" title="X Panel" hoverable>
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
  min-height: 100vh;
}

.index-page :deep(.ant-layout),
.index-page :deep(.ant-layout-content),
.content-shell {
  background: transparent !important;
}

.loading-spacer {
  min-height: calc(100vh - 120px);
}

.dashboard-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dashboard-heading {
  align-items: center;
  margin-bottom: 0;
}

.heading-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.primary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
  gap: 16px;
}

.operations-card {
  height: 100%;
}

.operations-list {
  display: flex;
  flex-direction: column;
}

.operation-row {
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--xui-border);
}

.operation-row:last-child {
  border-bottom: 0;
}

.operation-row span {
  color: var(--xui-text-muted);
  font-size: 12px;
}

.operation-row strong {
  min-width: 0;
  overflow: hidden;
  color: var(--xui-text-strong);
  font-size: 13px;
  font-weight: 700;
  text-align: right;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.data-card {
  min-width: 0;
}

.stat-pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.stat-pair > * {
  min-width: 0;
}

.stat-pair > * + * {
  padding-left: 12px;
  border-left: 1px solid var(--xui-border);
}

.icon-button {
  width: 34px;
  height: 34px;
  padding: 0;
}

.color-blue { color: #60a5fa; }
.color-cyan { color: #22d3ee; }
.color-green { color: #34d399; }
.color-amber { color: #fbbf24; }

.ip-hidden :deep(.ant-statistic-content-value) {
  filter: blur(6px);
  transition: filter 0.2s ease;
}

.ip-visible :deep(.ant-statistic-content-value) {
  filter: none;
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

:deep(.data-card .ant-card-body) {
  min-height: 88px;
  display: flex;
  align-items: center;
}

:deep(.data-card .ant-statistic-content) {
  overflow: hidden;
  font-size: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stat-pair.ip-hidden :deep(.ant-statistic-content),
.stat-pair.ip-visible :deep(.ant-statistic-content) {
  font-size: 13px;
  line-height: 1.35;
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
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

  .data-grid {
    grid-template-columns: 1fr;
  }

  .project-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
