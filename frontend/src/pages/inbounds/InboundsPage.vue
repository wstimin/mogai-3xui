<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Modal } from 'ant-design-vue';
import {
  BarsOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons-vue';

import { HttpUtil, SizeFormatter, RandomUtil } from '@/utils';
import { Inbound } from '@/models/inbound.js';
import { theme as themeState, antdThemeConfig } from '@/composables/useTheme.js';
import { useMediaQuery } from '@/composables/useMediaQuery.js';
import AppSidebar from '@/components/AppSidebar.vue';
import CustomStatistic from '@/components/CustomStatistic.vue';
import { useNodeList } from '@/composables/useNodeList.js';
import InboundList from './InboundList.vue';
import { useInbounds } from './useInbounds.js';
import { useWebSocket } from '@/composables/useWebSocket.js';

const InboundFormModal = defineAsyncComponent(() => import('./InboundFormModal.vue'));
const ClientFormModal = defineAsyncComponent(() => import('./ClientFormModal.vue'));
const ClientBulkModal = defineAsyncComponent(() => import('./ClientBulkModal.vue'));
const CopyClientsModal = defineAsyncComponent(() => import('./CopyClientsModal.vue'));
const InboundInfoModal = defineAsyncComponent(() => import('./InboundInfoModal.vue'));
const QrCodeModal = defineAsyncComponent(() => import('./QrCodeModal.vue'));
const TextModal = defineAsyncComponent(() => import('@/components/TextModal.vue'));
const PromptModal = defineAsyncComponent(() => import('@/components/PromptModal.vue'));

const { t } = useI18n();

const {
  fetched,
  dbInbounds,
  clientCount,
  onlineClients,
  totals,
  expireDiff,
  trafficDiff,
  pageSize,
  subSettings,
  tgBotEnable,
  ipLimitEnable,
  remarkModel,
  lastOnlineMap,
  refresh,
  fetchDefaultSettings,
  applyTrafficEvent,
  applyClientStatsEvent,
  applyInvalidate,
} = useInbounds();

// Live updates over WebSocket — replaces the old 5s polling loop.
// The backend pushes traffic + per-client deltas every ~10s; we merge
// them into the local refs in-place so counters and online badges
// update without re-fetching the whole list.
useWebSocket({
  traffic: applyTrafficEvent,
  client_stats: applyClientStatsEvent,
  invalidate: applyInvalidate,
});
const { isMobile } = useMediaQuery();
// Node list lives on the central panel; the Inbounds page consumes
// the id→node map for the new "Node" column. Fetched once on mount.
const { byId: nodesById } = useNodeList();

const basePath = window.__X_UI_BASE_PATH__ || '';
const requestUri = window.location.pathname;

const runningInboundCount = computed(() => {
  const now = Date.now();
  return dbInbounds.value.filter((record) => (
    record.enable && !(record.expiryTime > 0 && record.expiryTime <= now)
  )).length;
});

async function scrollToCurrentHash() {
  await nextTick();
  if (window.location.hash) {
    document.querySelector(window.location.hash)?.scrollIntoView({ behavior: 'smooth' });
  }
}

onMounted(async () => {
  await fetchDefaultSettings();
  await refresh();
  await scrollToCurrentHash();
});

// === Add/Edit modal ===================================================
const formOpen = ref(false);
const formMode = ref('add');
const formDbInbound = ref(null);

// === Client modal (single + bulk) =====================================
const clientOpen = ref(false);
const clientMode = ref('add');
const clientDbInbound = ref(null);
const clientIndex = ref(null);

const bulkOpen = ref(false);
const bulkDbInbound = ref(null);

const copyClientsOpen = ref(false);
const copyClientsTarget = ref(null);

// === Info / QR-code modals ===========================================
const infoOpen = ref(false);
const infoDbInbound = ref(null);
const infoClientIndex = ref(0);

const qrOpen = ref(false);
const qrDbInbound = ref(null);
const qrClient = ref(null);

// hostOverrideFor returns the node's address for a node-managed inbound,
// or '' when the inbound runs locally. Wired into the QR / Info modals
// and into export-all-links functions so generated share links point at
// the node, not the central panel.
function hostOverrideFor(dbInbound) {
  if (!dbInbound || dbInbound.nodeId == null) return '';
  return nodesById.value.get(dbInbound.nodeId)?.address || '';
}

const infoNodeAddress = computed(() => hostOverrideFor(infoDbInbound.value));
const qrNodeAddress = computed(() => hostOverrideFor(qrDbInbound.value));

// === Shared text + prompt modal state =================================
const textOpen = ref(false);
const textTitle = ref('');
const textContent = ref('');
const textFileName = ref('');

const promptOpen = ref(false);
const promptTitle = ref('');
const promptOkText = ref('OK');
const promptType = ref('textarea');
const promptInitial = ref('');
const promptLoading = ref(false);
let promptHandler = null;

function openText({ title, content, fileName = '' }) {
  textTitle.value = title;
  textContent.value = content;
  textFileName.value = fileName;
  textOpen.value = true;
}

function openPrompt({ title, okText, type = 'textarea', value = '', confirm }) {
  promptTitle.value = title;
  promptOkText.value = okText || 'OK';
  promptType.value = type;
  promptInitial.value = value;
  promptHandler = confirm;
  promptOpen.value = true;
}

async function onPromptConfirm(value) {
  if (!promptHandler) { promptOpen.value = false; return; }
  promptLoading.value = true;
  try {
    const ok = await promptHandler(value);
    if (ok !== false) promptOpen.value = false;
  } finally {
    promptLoading.value = false;
  }
}

// === Export helpers — mirror legacy txtModal call sites ==============
function exportInboundLinks(dbInbound) {
  const projected = checkFallback(dbInbound);
  openText({
    title: t('pages.inbounds.exportInboundLinksTitle'),
    content: projected.genInboundLinks(remarkModel.value, hostOverrideFor(dbInbound)),
    fileName: projected.remark || 'inbound',
  });
}

function exportInboundClipboard(dbInbound) {
  openText({
    title: t('pages.inbounds.inboundJsonTitle'),
    content: JSON.stringify(dbInbound, null, 2),
  });
}

function exportInboundSubs(dbInbound) {
  const inbound = dbInbound.toInbound();
  const clients = inbound?.clients || [];
  const subLinks = [];
  for (const c of clients) {
    if (c.subId && subSettings.value.subURI) {
      subLinks.push(subSettings.value.subURI + c.subId);
    }
  }
  openText({
    title: t('pages.inbounds.exportSubscriptionLinksTitle'),
    content: [...new Set(subLinks)].join('\n'),
    fileName: `${dbInbound.remark || 'inbound'}-Subs`,
  });
}

function exportAllLinks() {
  const out = [];
  for (const ib of dbInbounds.value) {
    out.push(ib.genInboundLinks(remarkModel.value, hostOverrideFor(ib)));
  }
  openText({
    title: t('pages.inbounds.exportAllInboundLinksTitle'),
    content: out.join('\r\n'),
    fileName: 'All-Inbounds',
  });
}

function exportAllSubs() {
  const out = [];
  for (const ib of dbInbounds.value) {
    const inbound = ib.toInbound();
    const clients = inbound?.clients || [];
    for (const c of clients) {
      if (c.subId && subSettings.value.subURI) {
        out.push(subSettings.value.subURI + c.subId);
      }
    }
  }
  openText({
    title: t('pages.inbounds.exportAllSubscriptionLinksTitle'),
    content: [...new Set(out)].join('\r\n'),
    fileName: 'All-Inbounds-Subs',
  });
}

function importInbound() {
  openPrompt({
    title: t('pages.inbounds.importInbound'),
    okText: t('pages.inbounds.import'),
    type: 'textarea',
    value: '',
    confirm: async (value) => {
      const msg = await HttpUtil.post('/panel/api/inbounds/import', { data: value });
      if (msg?.success) {
        await refresh();
        return true;
      }
      return false;
    },
  });
}

// `checkFallback` mirrors the legacy helper: when an inbound listens
// on a unix-socket fallback (`@<name>`), point the link generator at
// the root inbound that owns the listen address so QRs/links carry
// the externally-reachable host:port and the right TLS state.
function checkFallback(dbInbound) {
  // We don't keep parsed Inbounds in state right now (the page works
  // off DBInbounds); compute on the fly.
  if (!dbInbound.listen?.startsWith?.('@')) return dbInbound;
  for (const candidate of dbInbounds.value) {
    if (candidate.id === dbInbound.id) continue;
    const parsed = candidate.toInbound();
    if (!parsed.isTcp) continue;
    if (!['trojan', 'vless'].includes(parsed.protocol)) continue;
    const fallbacks = parsed.settings.fallbacks || [];
    if (!fallbacks.find((f) => f.dest === dbInbound.listen)) continue;
    // Build a one-off DBInbound copy with the parent's listen/port +
    // copied stream so the link gen sees the public endpoint.
    const projected = JSON.parse(JSON.stringify(dbInbound));
    projected.listen = candidate.listen;
    projected.port = candidate.port;
    const inheritedStream = parsed.stream;
    const ownInbound = dbInbound.toInbound();
    ownInbound.stream.security = inheritedStream.security;
    ownInbound.stream.tls = inheritedStream.tls;
    ownInbound.stream.externalProxy = inheritedStream.externalProxy;
    projected.streamSettings = ownInbound.stream.toString();
    // Re-wrap so callers get the same DBInbound shape they had.
    return new dbInbound.constructor(projected);
  }
  return dbInbound;
}

function findClientIndex(dbInbound, client) {
  if (!client) return 0;
  const inbound = dbInbound.toInbound();
  const clients = inbound?.clients || [];
  const idx = clients.findIndex((c) => {
    if (!c) return false;
    switch (dbInbound.protocol) {
      case 'trojan':
      case 'shadowsocks':
        return c.password === client.password && c.email === client.email;
      default:
        return c.id === client.id && c.email === client.email;
    }
  });
  return idx >= 0 ? idx : 0;
}

function getClientId(protocol, client) {
  switch (protocol) {
    case 'trojan': return client.password;
    case 'shadowsocks': return client.email;
    case 'hysteria': return client.auth;
    default: return client.id;
  }
}

// === Per-client handlers (called from the expand-row table) =========
function onEditClient({ dbInbound, client }) {
  clientMode.value = 'edit';
  clientDbInbound.value = dbInbound;
  clientIndex.value = findClientIndex(dbInbound, client);
  clientOpen.value = true;
}

function onQrcodeClient({ dbInbound, client }) {
  qrDbInbound.value = checkFallback(dbInbound);
  qrClient.value = client || null;
  qrOpen.value = true;
}

function onInfoClient({ dbInbound, client }) {
  infoDbInbound.value = checkFallback(dbInbound);
  infoClientIndex.value = findClientIndex(dbInbound, client);
  infoOpen.value = true;
}

async function onResetTrafficClient({ dbInbound, client }) {
  const msg = await HttpUtil.post(
    `/panel/api/inbounds/${dbInbound.id}/resetClientTraffic/${client.email}`,
  );
  if (msg?.success) await refresh();
}

async function onDeleteClient({ dbInbound, client }) {
  const clientId = getClientId(dbInbound.protocol, client);
  const msg = await HttpUtil.post(`/panel/api/inbounds/${dbInbound.id}/delClient/${clientId}`);
  if (msg?.success) await refresh();
}

async function onToggleEnableClient({ dbInbound, client, next }) {
  // Mirror legacy: clone the parsed inbound, flip enable on the matching
  // client, and post the whole client back through updateClient. This
  // keeps the wire shape identical to the modal save path.
  const inbound = dbInbound.toInbound();
  const clients = inbound?.clients || [];
  const idx = findClientIndex(dbInbound, client);
  if (idx < 0 || !clients[idx]) return;
  clients[idx].enable = next;
  const clientId = getClientId(dbInbound.protocol, clients[idx]);
  const msg = await HttpUtil.post(`/panel/api/inbounds/updateClient/${clientId}`, {
    id: dbInbound.id,
    settings: `{"clients": [${clients[idx].toString()}]}`,
  });
  if (msg?.success) await refresh();
}

function onAddInbound() {
  formMode.value = 'add';
  formDbInbound.value = null;
  formOpen.value = true;
}

function openEdit(dbInbound) {
  formMode.value = 'edit';
  formDbInbound.value = dbInbound;
  formOpen.value = true;
}

function openAddClient(dbInbound) {
  clientMode.value = 'add';
  clientDbInbound.value = dbInbound;
  clientIndex.value = null;
  clientOpen.value = true;
}

function openAddBulkClient(dbInbound) {
  bulkDbInbound.value = dbInbound;
  bulkOpen.value = true;
}

// Per-row destructive actions go through Modal.confirm (matches legacy).
function confirmDelete(dbInbound) {
  Modal.confirm({
    class: 'inbound-confirm-modal',
    title: `${t('pages.inbounds.deleteInbound')} "${dbInbound.remark}"?`,
    content: t('pages.inbounds.deleteInboundContent'),
    okText: t('delete'),
    okType: 'danger',
    cancelText: t('cancel'),
    onOk: async () => {
      const msg = await HttpUtil.post(`/panel/api/inbounds/del/${dbInbound.id}`);
      if (msg?.success) await refresh();
    },
  });
}

function confirmResetTraffic(dbInbound) {
  Modal.confirm({
    class: 'inbound-confirm-modal',
    title: `${t('pages.inbounds.resetTraffic')} "${dbInbound.remark}"?`,
    content: t('pages.inbounds.resetTrafficContent'),
    okText: t('reset'),
    cancelText: t('cancel'),
    onOk: async () => {
      const msg = await HttpUtil.post(`/panel/api/inbounds/resetTraffic/${dbInbound.id}`);
      if (msg?.success) await refresh();
    },
  });
}

function confirmDelDepleted(dbInboundId) {
  Modal.confirm({
    class: 'inbound-confirm-modal',
    title: t('pages.inbounds.delDepletedClientsTitle'),
    content: t('pages.inbounds.delDepletedClientsContent'),
    okText: t('delete'),
    okType: 'danger',
    cancelText: t('cancel'),
    onOk: async () => {
      const msg = await HttpUtil.post(`/panel/api/inbounds/delDepletedClients/${dbInboundId}`);
      if (msg?.success) await refresh();
    },
  });
}

// Clone — adds a new inbound with the same protocol+stream+sniffing
// but a fresh remark/port and an empty client list.
function confirmClone(dbInbound) {
  Modal.confirm({
    class: 'inbound-confirm-modal',
    title: `${t('pages.inbounds.cloneInbound')} "${dbInbound.remark}"?`,
    content: t('pages.inbounds.cloneInboundContent'),
    okText: t('pages.inbounds.cloneInboundOk'),
    cancelText: t('cancel'),
    onOk: async () => {
      const baseInbound = dbInbound.toInbound();
      const data = {
        up: 0,
        down: 0,
        total: 0,
        remark: `${dbInbound.remark} (${t('pages.inbounds.clone')})`,
        enable: false,
        expiryTime: 0,
        listen: '',
        port: RandomUtil.randomInteger(10000, 60000),
        protocol: baseInbound.protocol,
        settings: Inbound.Settings.getSettings(baseInbound.protocol).toString(),
        streamSettings: baseInbound.stream.toString(),
        sniffing: baseInbound.sniffing.toString(),
      };
      const msg = await HttpUtil.post('/panel/api/inbounds/add', data);
      if (msg?.success) await refresh();
    },
  });
}

function onGeneralAction(key) {
  switch (key) {
    case 'import':
      importInbound();
      break;
    case 'export':
      exportAllLinks();
      break;
    case 'subs':
      exportAllSubs();
      break;
    case 'resetInbounds':
      Modal.confirm({
        class: 'inbound-confirm-modal',
        title: t('pages.inbounds.resetAllTrafficTitle'),
        content: t('pages.inbounds.resetAllTrafficContent'),
        okText: t('reset'),
        cancelText: t('cancel'),
        onOk: async () => {
          const msg = await HttpUtil.post('/panel/api/inbounds/resetAllTraffics');
          if (msg?.success) await refresh();
        },
      });
      break;
    case 'resetClients':
      Modal.confirm({
        class: 'inbound-confirm-modal',
        title: t('pages.inbounds.resetAllClientTrafficTitle'),
        content: t('pages.inbounds.resetAllClientTrafficContent'),
        okText: t('reset'),
        cancelText: t('cancel'),
        onOk: async () => {
          const msg = await HttpUtil.post('/panel/api/inbounds/resetAllClientTraffics/-1');
          if (msg?.success) await refresh();
        },
      });
      break;
    case 'delDepletedClients':
      confirmDelDepleted(-1);
      break;
  }
}

function onRowAction({ key, dbInbound }) {
  switch (key) {
    case 'edit':
      openEdit(dbInbound);
      break;
    case 'addClient':
      openAddClient(dbInbound);
      break;
    case 'addBulkClient':
      openAddBulkClient(dbInbound);
      break;
    case 'showInfo':
      infoDbInbound.value = checkFallback(dbInbound);
      infoClientIndex.value = findClientIndex(dbInbound, null);
      infoOpen.value = true;
      break;
    case 'qrcode':
      qrDbInbound.value = checkFallback(dbInbound);
      qrClient.value = null;
      qrOpen.value = true;
      break;
    case 'export':
      exportInboundLinks(dbInbound);
      break;
    case 'subs':
      exportInboundSubs(dbInbound);
      break;
    case 'clipboard':
      exportInboundClipboard(dbInbound);
      break;
    case 'copyClients':
      copyClientsTarget.value = dbInbound;
      copyClientsOpen.value = true;
      break;
    case 'delete':
      confirmDelete(dbInbound);
      break;
    case 'resetTraffic':
      confirmResetTraffic(dbInbound);
      break;
    case 'clone':
      confirmClone(dbInbound);
      break;
    case 'resetClients':
      Modal.confirm({
        class: 'inbound-confirm-modal',
        title: `${t('pages.inbounds.resetInboundClientTrafficTitle')} "${dbInbound.remark}"?`,
        content: t('pages.inbounds.resetInboundClientTrafficContent'),
        okText: t('reset'),
        cancelText: t('cancel'),
        onOk: async () => {
          const msg = await HttpUtil.post(`/panel/api/inbounds/resetAllClientTraffics/${dbInbound.id}`);
          if (msg?.success) await refresh();
        },
      });
      break;
    case 'delDepletedClients':
      confirmDelDepleted(dbInbound.id);
      break;
  }
}
</script>

<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-layout class="inbounds-page" :class="{ 'is-dark': themeState.isDark, 'is-ultra': themeState.isUltra }">
      <AppSidebar :base-path="basePath" :request-uri="requestUri" dashboard-style />

      <a-layout class="content-shell">
        <a-layout-content id="content-layout" class="content-area">
          <a-spin :spinning="!fetched" :delay="200" :tip="t('loading')" size="large">
            <div v-if="!fetched" class="loading-spacer" />

            <a-row v-else :gutter="[isMobile ? 8 : 16, 12]">
              <a-col :span="24">
                <div class="page-heading">
                  <div>
                    <h1>{{ t('menu.inbounds') }}</h1>
                    <p>{{ t('pages.inbounds.totalUsage') }} · {{ t('pages.inbounds.allTimeTrafficUsage') }}</p>
                  </div>
                </div>
              </a-col>
              <a-col id="traffic" :span="24">
                <a-row class="metric-grid" :gutter="[12, 12]">
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic :title="t('pages.inbounds.inboundCount')" :value="String(dbInbounds.length)">
                        <template #prefix><BarsOutlined style="color: #3b82f6" /></template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic :title="t('pages.index.xrayStatusRunning')" :value="String(runningInboundCount)">
                        <template #prefix><CheckCircleOutlined style="color: #10b981" /></template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic :title="t('pages.index.upload')" :value="SizeFormatter.sizeFormat(totals.up)">
                        <template #prefix><CloudUploadOutlined style="color: #06b6d4" /></template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                  <a-col :xs="12" :lg="6">
                    <a-card class="metric-card" hoverable>
                      <CustomStatistic :title="t('pages.index.download')" :value="SizeFormatter.sizeFormat(totals.down)">
                        <template #prefix><CloudDownloadOutlined style="color: #f59e0b" /></template>
                      </CustomStatistic>
                    </a-card>
                  </a-col>
                </a-row>
              </a-col>

              <!-- Inbound list — toolbar, search/filter, columns, row actions -->
              <a-col :span="24">
                <InboundList :db-inbounds="dbInbounds" :client-count="clientCount" :online-clients="onlineClients"
                  :last-online-map="lastOnlineMap" :is-dark-theme="themeState.isDark"
                  :expire-diff="expireDiff" :traffic-diff="trafficDiff" :page-size="pageSize" :is-mobile="isMobile"
                  :sub-enable="subSettings.enable" :nodes-by-id="nodesById" @refresh="refresh" @add-inbound="onAddInbound"
                  @general-action="onGeneralAction" @row-action="onRowAction" @edit-client="onEditClient"
                  @qrcode-client="onQrcodeClient" @info-client="onInfoClient"
                  @reset-traffic-client="onResetTrafficClient" @delete-client="onDeleteClient"
                  @toggle-enable-client="onToggleEnableClient" />
              </a-col>
            </a-row>
          </a-spin>
        </a-layout-content>
      </a-layout>

      <InboundFormModal v-model:open="formOpen" :mode="formMode" :db-inbound="formDbInbound" @saved="refresh" />
      <ClientFormModal v-model:open="clientOpen" :mode="clientMode" :db-inbound="clientDbInbound"
        :client-index="clientIndex" :sub-enable="subSettings.enable" :tg-bot-enable="tgBotEnable"
        :ip-limit-enable="ipLimitEnable" :traffic-diff="trafficDiff" @saved="refresh" />
      <ClientBulkModal v-model:open="bulkOpen" :db-inbound="bulkDbInbound" :sub-enable="subSettings.enable"
        :tg-bot-enable="tgBotEnable" :ip-limit-enable="ipLimitEnable" @saved="refresh" />
      <CopyClientsModal v-model:open="copyClientsOpen" :target-inbound="copyClientsTarget"
        :db-inbounds="dbInbounds" @saved="refresh" />
      <InboundInfoModal v-model:open="infoOpen" :db-inbound="infoDbInbound" :client-index="infoClientIndex"
        :remark-model="remarkModel" :expire-diff="expireDiff" :traffic-diff="trafficDiff"
        :ip-limit-enable="ipLimitEnable" :tg-bot-enable="tgBotEnable" :sub-settings="subSettings"
        :last-online-map="lastOnlineMap" :node-address="infoNodeAddress" />
      <QrCodeModal v-model:open="qrOpen" :db-inbound="qrDbInbound" :client="qrClient" :remark-model="remarkModel"
        :node-address="qrNodeAddress" />

      <TextModal v-model:open="textOpen" :title="textTitle" :content="textContent" :file-name="textFileName" />
      <PromptModal v-model:open="promptOpen" :title="promptTitle" :ok-text="promptOkText" :type="promptType"
        :initial-value="promptInitial" :loading="promptLoading" @confirm="onPromptConfirm" />
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.inbounds-page {
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
  --bg-page: #07080b;
  --bg-card: rgba(15, 17, 23, 0.82);

  position: relative;
  min-height: 100vh;
  background: var(--bg-page);
  color: var(--xui-text);
}

.inbounds-page.is-dark {
  --bg-page: #07080b;
  --bg-card: rgba(15, 17, 23, 0.82);
}

.inbounds-page.is-dark.is-ultra {
  --bg-page: #050609;
  --bg-card: rgba(12, 14, 19, 0.9);
}

.inbounds-page::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse 72% 42% at 9% -12%, rgba(99, 102, 241, 0.14), transparent 56%),
    radial-gradient(ellipse 52% 38% at 96% 4%, rgba(139, 92, 246, 0.075), transparent 52%);
}

.inbounds-page :deep(.ant-layout),
.inbounds-page :deep(.ant-layout-content) {
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

.page-heading {
  margin-bottom: 4px;
}

.page-heading h1 {
  color: #f1f5f9;
  font-size: 24px;
}

.page-heading p {
  color: #64748b;
}

.loading-spacer {
  min-height: calc(100vh - 120px);
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

:global(.inbound-form-modal),
:global(.client-form-modal),
:global(.client-bulk-modal),
:global(.copy-clients-modal),
:global(.inbound-info-modal),
:global(.qr-code-modal),
:global(.shared-text-modal),
:global(.shared-prompt-modal) {
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

:global(.inbound-confirm-modal) {
  --xui-bg: #07080b;
  --xui-surface: #0f1117;
  --xui-surface-2: rgba(255, 255, 255, 0.035);
  --xui-border: rgba(255, 255, 255, 0.065);
  --xui-text-strong: #f1f5f9;
  --xui-text: #cbd5e1;
  --xui-text-muted: #64748b;
  --xui-primary: #6366f1;
}

:global(.ant-modal.inbound-confirm-modal .ant-modal-content) {
  border: 1px solid rgba(255, 255, 255, 0.065) !important;
  border-radius: 14px !important;
  color: #cbd5e1;
  background: #0f1117 !important;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.52) !important;
}

:global(.ant-modal.inbound-confirm-modal .ant-modal-confirm-title) {
  color: #f1f5f9 !important;
}

:global(.ant-modal.inbound-confirm-modal .ant-modal-confirm-content) {
  color: #64748b !important;
}

:global(.ant-modal.inbound-confirm-modal .ant-btn-primary:not(.ant-btn-dangerous)) {
  border-color: transparent !important;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
}

:global(:is(.inbound-form-modal, .client-form-modal, .client-bulk-modal, .copy-clients-modal, .inbound-info-modal, .qr-code-modal, .shared-text-modal, .shared-prompt-modal) .ant-modal-content) {
  border-color: rgba(255, 255, 255, 0.065) !important;
  border-radius: 14px !important;
  color: #cbd5e1;
  background: #0f1117 !important;
  box-shadow: 0 28px 80px rgba(0, 0, 0, 0.52) !important;
}

:global(:is(.inbound-form-modal, .client-form-modal, .client-bulk-modal, .copy-clients-modal, .inbound-info-modal, .qr-code-modal, .shared-text-modal, .shared-prompt-modal) .ant-modal-header),
:global(:is(.inbound-form-modal, .client-form-modal, .client-bulk-modal, .copy-clients-modal, .inbound-info-modal, .qr-code-modal, .shared-text-modal, .shared-prompt-modal) .ant-modal-footer) {
  border-color: rgba(255, 255, 255, 0.065) !important;
  background: #0f1117 !important;
}

:global(:is(.inbound-form-modal, .client-form-modal, .client-bulk-modal, .copy-clients-modal, .inbound-info-modal, .qr-code-modal, .shared-text-modal, .shared-prompt-modal) .ant-modal-title) {
  color: #f1f5f9 !important;
}

:global(:is(.inbound-form-modal, .client-form-modal, .client-bulk-modal, .copy-clients-modal, .inbound-info-modal, .qr-code-modal, .shared-text-modal, .shared-prompt-modal) .ant-modal-body) {
  color: #cbd5e1;
  background: #090b10 !important;
}

:global(:is(.inbound-form-modal, .client-form-modal, .client-bulk-modal, .copy-clients-modal, .inbound-info-modal, .qr-code-modal, .shared-text-modal, .shared-prompt-modal) .ant-btn-primary) {
  border-color: transparent !important;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 16px rgba(99, 102, 241, 0.28);
}

:global(:is(.inbound-form-modal, .client-form-modal, .client-bulk-modal, .copy-clients-modal, .inbound-info-modal, .qr-code-modal, .shared-text-modal, .shared-prompt-modal) :is(.ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select-selector)) {
  border-color: rgba(255, 255, 255, 0.075) !important;
  color: #cbd5e1 !important;
  background: rgba(255, 255, 255, 0.035) !important;
}

@media (max-width: 768px) {
  .content-area {
    padding: 76px 12px 28px !important;
  }

  .page-heading h1 {
    font-size: 21px;
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
