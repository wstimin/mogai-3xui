<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  PlusOutlined,
  SearchOutlined,
  MoreOutlined,
  EditOutlined,
  QrcodeOutlined,
  CopyOutlined,
  ExportOutlined,
  ImportOutlined,
  ReloadOutlined,
  RestOutlined,
  RetweetOutlined,
  BlockOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
  FileDoneOutlined,
  RightOutlined,
  PoweroffOutlined,
  LinkOutlined,
} from '@ant-design/icons-vue';

import { HttpUtil, ObjectUtil, SizeFormatter, IntlUtil } from '@/utils';
import { DBInbound } from '@/models/dbinbound.js';
import { Inbound } from '@/models/inbound.js';
import InfinityIcon from '@/components/InfinityIcon.vue';
import ClientRowTable from './ClientRowTable.vue';

const { t } = useI18n();

const props = defineProps({
  dbInbounds: { type: Array, required: true },
  clientCount: { type: Object, required: true },
  onlineClients: { type: Array, required: true },
  lastOnlineMap: { type: Object, default: () => ({}) },
  expireDiff: { type: Number, default: 0 },
  trafficDiff: { type: Number, default: 0 },
  pageSize: { type: Number, default: 0 },
  isMobile: { type: Boolean, default: false },
  isDarkTheme: { type: Boolean, default: false },
  subEnable: { type: Boolean, default: false },
  nodesById: { type: Map, default: () => new Map() },
});

const emit = defineEmits([
  'refresh',
  'add-inbound',
  'general-action',
  'row-action',
  'edit-client',
  'qrcode-client',
  'info-client',
  'reset-traffic-client',
  'delete-client',
  'toggle-enable-client',
]);

const searchKey = ref('');
const statusFilter = ref('all');
const expandedIds = ref(new Set());
const togglingIds = ref(new Set());

function statusOf(record) {
  const now = Date.now();
  if (record.expiryTime > 0 && record.expiryTime <= now) return 'expired';
  if (!record.enable) return 'disabled';
  if (record.expiryTime > now && props.expireDiff > 0 && record.expiryTime - now <= props.expireDiff) {
    return 'expiring';
  }
  return 'running';
}

function statusLabel(record) {
  const status = statusOf(record);
  if (status === 'expired') return t('depleted');
  if (status === 'disabled') return t('disabled');
  if (status === 'expiring') return t('depletingSoon');
  return t('pages.index.xrayStatusRunning');
}

function projectInbound(dbInbound, predicate) {
  const next = new DBInbound(dbInbound);
  let settings;
  try {
    settings = JSON.parse(dbInbound.settings || '{}');
  } catch (_e) {
    settings = {};
  }
  if (!Array.isArray(settings.clients)) return next;
  next.settings = Inbound.Settings.fromJson(dbInbound.protocol, {
    clients: settings.clients.filter(predicate),
  });
  next.invalidateCache();
  return next;
}

const visibleInbounds = computed(() => {
  let rows = props.dbInbounds.filter((record) => (
    statusFilter.value === 'all' || statusOf(record) === statusFilter.value
  ));
  if (!ObjectUtil.isEmpty(searchKey.value)) {
    rows = rows
      .filter((record) => ObjectUtil.deepSearch(record, searchKey.value))
      .map((record) => projectInbound(
        record,
        (client) => ObjectUtil.deepSearch(client, searchKey.value),
      ));
  }
  return rows;
});

const filterItems = computed(() => [
  { key: 'all', label: t('pages.client.selectAll') },
  { key: 'running', label: t('pages.index.xrayStatusRunning') },
  { key: 'disabled', label: t('disabled') },
  { key: 'expiring', label: t('depletingSoon') },
  { key: 'expired', label: t('depleted') },
]);

function toggleExpanded(id) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function isExpanded(id) {
  return expandedIds.value.has(id);
}

async function onSwitchEnable(record, next) {
  if (togglingIds.value.has(record.id)) return;
  togglingIds.value = new Set(togglingIds.value).add(record.id);
  try {
    const formData = new FormData();
    formData.append('enable', String(next));
    const msg = await HttpUtil.post(`/panel/api/inbounds/setEnable/${record.id}`, formData);
    if (msg?.success) emit('refresh');
  } finally {
    const pending = new Set(togglingIds.value);
    pending.delete(record.id);
    togglingIds.value = pending;
  }
}

function safeInbound(record) {
  try {
    return record.toInbound();
  } catch (_e) {
    return null;
  }
}

function transportLabel(record) {
  const inbound = safeInbound(record);
  if (!inbound?.stream) return '-';
  const parts = [String(inbound.stream.network || 'tcp').toUpperCase()];
  if (inbound.stream.isReality) parts.push('Reality');
  else if (inbound.stream.isTls) parts.push('TLS');
  return parts.join(' + ');
}

function specialTags(record) {
  const inbound = safeInbound(record);
  const tags = [];
  if (inbound?.stream?.network === 'ws') tags.push('CDN');
  if (inbound?.stream?.isReality) tags.push('Reality');
  if ((inbound?.clients || []).some((client) => !!client.flow)) tags.push('Flow');
  return tags;
}

function showQrCodeMenu(record) {
  if (record.isWireguard) return true;
  if (!record.isSS) return false;
  const inbound = safeInbound(record);
  return !!inbound && !inbound.isSSMultiUser;
}

function onQrAction(record) {
  if (showQrCodeMenu(record)) {
    emit('row-action', { key: 'qrcode', dbInbound: record });
  } else if (record.isMultiUser()) {
    toggleExpanded(record.id);
  } else {
    emit('row-action', { key: 'showInfo', dbInbound: record });
  }
}

function trafficPercent(record) {
  if (!record.total || record.total <= 0) return 0;
  return Math.min(100, Math.round(((record.up + record.down) / record.total) * 100));
}

function trafficColor(record) {
  const percent = trafficPercent(record);
  if (percent >= 90) return '#ef4444';
  if (percent >= 70) return '#f59e0b';
  return '#3b82f6';
}

function expiryText(record) {
  return record.expiryTime > 0 ? IntlUtil.formatRelativeTime(record.expiryTime) : t('unlimited');
}

function clientTotal(record) {
  return props.clientCount[record.id]?.clients || 0;
}

function nodeText(record) {
  if (record.nodeId == null) return t('pages.inbounds.localPanel');
  return props.nodesById.get(record.nodeId)?.name || `#${record.nodeId}`;
}
</script>

<template>
  <section id="clients" class="inbound-list-shell">
    <div class="panel-toolbar inbound-toolbar">
      <div class="panel-toolbar__group search-group">
        <a-input v-model:value="searchKey" :placeholder="t('search')" allow-clear>
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-tooltip title="Refresh">
          <a-button aria-label="Refresh" @click="emit('refresh')">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
      <div class="panel-toolbar__group">
        <a-dropdown :trigger="['click']">
          <a-button>
            <template #icon><MoreOutlined /></template>
            {{ t('pages.inbounds.generalActions') }}
          </a-button>
          <template #overlay>
            <a-menu @click="({ key }) => emit('general-action', key)">
              <a-menu-item key="import"><ImportOutlined /> {{ t('pages.inbounds.importInbound') }}</a-menu-item>
              <a-menu-item key="export"><ExportOutlined /> {{ t('pages.inbounds.export') }}</a-menu-item>
              <a-menu-item v-if="subEnable" key="subs"><LinkOutlined /> {{ t('pages.settings.subSettings') }}</a-menu-item>
              <a-menu-divider />
              <a-menu-item key="resetInbounds"><ReloadOutlined /> {{ t('pages.inbounds.resetAllTraffic') }}</a-menu-item>
              <a-menu-item key="resetClients"><FileDoneOutlined /> {{ t('pages.inbounds.resetAllClientTraffics') }}</a-menu-item>
              <a-menu-item key="delDepletedClients" class="danger-item"><RestOutlined /> {{ t('pages.inbounds.delDepletedClients') }}</a-menu-item>
            </a-menu>
          </template>
        </a-dropdown>
        <a-button type="primary" @click="emit('add-inbound')">
          <template #icon><PlusOutlined /></template>
          {{ t('pages.inbounds.addInbound') }}
        </a-button>
      </div>
    </div>

    <div class="filter-tabs" role="tablist" aria-label="Inbound status filter">
      <button v-for="item in filterItems" :key="item.key" type="button"
        :class="{ active: statusFilter === item.key }" @click="statusFilter = item.key">
        {{ item.label }}
      </button>
    </div>

    <div class="inbound-cards">
      <a-empty v-if="visibleInbounds.length === 0" :description="t('noData')" />

      <article v-for="record in visibleInbounds" :key="record.id" class="inbound-card"
        :class="`status-${statusOf(record)}`">
        <div class="status-rail" />
        <div class="card-main">
          <header class="card-header">
            <button v-if="record.isMultiUser()" type="button" class="expand-button"
              :aria-expanded="isExpanded(record.id)" @click="toggleExpanded(record.id)">
              <RightOutlined :class="{ expanded: isExpanded(record.id) }" />
            </button>
            <div class="identity">
              <div class="title-line">
                <h2>{{ record.remark || `Inbound #${record.id}` }}</h2>
                <span class="badge protocol">{{ String(record.protocol).toUpperCase() }}</span>
                <span class="badge" :class="`status-${statusOf(record)}`">{{ statusLabel(record) }}</span>
                <span class="badge port">:{{ record.port }}</span>
              </div>
              <div class="meta-line">
                <span>{{ transportLabel(record) }}</span>
                <span>{{ clientTotal(record) }} {{ t('clients') }}</span>
                <span>{{ expiryText(record) }}</span>
                <span v-if="nodesById.size">{{ nodeText(record) }}</span>
                <span v-for="tag in specialTags(record)" :key="tag" class="special-tag">{{ tag }}</span>
              </div>
            </div>

            <div class="primary-actions">
              <a-tooltip :title="t('qrCode')">
                <a-button class="icon-action qr" @click="onQrAction(record)"><template #icon><QrcodeOutlined /></template></a-button>
              </a-tooltip>
              <a-tooltip :title="t('pages.inbounds.export')">
                <a-button class="icon-action copy" @click="emit('row-action', { key: 'export', dbInbound: record })"><template #icon><CopyOutlined /></template></a-button>
              </a-tooltip>
              <a-tooltip :title="t('edit')">
                <a-button class="icon-action edit" @click="emit('row-action', { key: 'edit', dbInbound: record })"><template #icon><EditOutlined /></template></a-button>
              </a-tooltip>
              <a-tooltip :title="record.enable ? t('pages.index.stopXray') : t('pages.index.xrayStatusRunning')">
                <a-button class="icon-action power" :class="{ enabled: record.enable }"
                  :loading="togglingIds.has(record.id)"
                  @click="onSwitchEnable(record, !record.enable)"><template #icon><PoweroffOutlined /></template></a-button>
              </a-tooltip>
              <a-tooltip :title="t('delete')">
                <a-button danger class="icon-action delete" @click="emit('row-action', { key: 'delete', dbInbound: record })"><template #icon><DeleteOutlined /></template></a-button>
              </a-tooltip>
              <a-dropdown :trigger="['click']" placement="bottomRight">
                <a-button class="icon-action"><template #icon><MoreOutlined /></template></a-button>
                <template #overlay>
                  <a-menu @click="({ key }) => emit('row-action', { key, dbInbound: record })">
                    <a-menu-item v-if="record.isMultiUser()" key="addClient"><UserAddOutlined /> {{ t('pages.client.add') }}</a-menu-item>
                    <a-menu-item v-if="record.isMultiUser()" key="addBulkClient"><UsergroupAddOutlined /> {{ t('pages.client.bulk') }}</a-menu-item>
                    <a-menu-item v-if="record.isMultiUser()" key="copyClients"><CopyOutlined /> {{ t('pages.client.copyFromInbound') }}</a-menu-item>
                    <a-menu-item v-if="!record.isMultiUser()" key="showInfo"><InfoCircleOutlined /> {{ t('info') }}</a-menu-item>
                    <a-menu-item key="clipboard"><CopyOutlined /> {{ t('pages.inbounds.exportInbound') }}</a-menu-item>
                    <a-menu-item v-if="subEnable && record.isMultiUser()" key="subs"><LinkOutlined /> {{ t('pages.settings.subSettings') }}</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item key="resetTraffic"><RetweetOutlined /> {{ t('pages.inbounds.resetTraffic') }}</a-menu-item>
                    <a-menu-item v-if="record.isMultiUser()" key="resetClients"><FileDoneOutlined /> {{ t('pages.inbounds.resetInboundClientTraffics') }}</a-menu-item>
                    <a-menu-item key="clone"><BlockOutlined /> {{ t('pages.inbounds.clone') }}</a-menu-item>
                    <a-menu-item v-if="record.isMultiUser()" key="delDepletedClients" class="danger-item"><RestOutlined /> {{ t('pages.inbounds.delDepletedClients') }}</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </div>
          </header>

          <div class="traffic-section">
            <div class="traffic-labels">
              <span>{{ t('pages.inbounds.traffic') }}</span>
              <strong>
                {{ SizeFormatter.sizeFormat(record.up + record.down) }} /
                <template v-if="record.total > 0">{{ SizeFormatter.sizeFormat(record.total) }}</template>
                <InfinityIcon v-else />
              </strong>
              <span v-if="record.total > 0">{{ trafficPercent(record) }}%</span>
            </div>
            <a-progress :percent="trafficPercent(record)" :show-info="false" size="small"
              :stroke-color="trafficColor(record)" />
          </div>

          <div v-if="record.isMultiUser() && isExpanded(record.id)" class="client-panel">
            <ClientRowTable :db-inbound="record" :is-mobile="isMobile" :traffic-diff="trafficDiff"
              :expire-diff="expireDiff" :online-clients="onlineClients" :last-online-map="lastOnlineMap"
              :is-dark-theme="isDarkTheme" @edit-client="(p) => emit('edit-client', p)"
              @qrcode-client="(p) => emit('qrcode-client', p)" @info-client="(p) => emit('info-client', p)"
              @reset-traffic-client="(p) => emit('reset-traffic-client', p)"
              @delete-client="(p) => emit('delete-client', p)"
              @toggle-enable-client="(p) => emit('toggle-enable-client', p)" />
          </div>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.inbound-list-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.search-group :deep(.ant-input-affix-wrapper) {
  width: min(360px, 44vw);
}

.filter-tabs {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 4px;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface-2);
}

.filter-tabs button {
  min-height: 34px;
  padding: 0 14px;
  border: 0;
  border-radius: 6px;
  color: var(--xui-text-muted);
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
}

.filter-tabs button:hover,
.filter-tabs button.active {
  color: #fff;
  background: var(--xui-primary);
}

.inbound-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.inbound-card {
  position: relative;
  overflow: hidden;
  display: flex;
  min-width: 0;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.inbound-card:hover {
  border-color: var(--xui-border-strong);
  box-shadow: var(--xui-shadow);
}

.status-rail {
  width: 4px;
  flex: 0 0 4px;
  background: var(--xui-success);
}

.inbound-card.status-disabled .status-rail { background: #738196; }
.inbound-card.status-expiring .status-rail { background: var(--xui-warning); }
.inbound-card.status-expired .status-rail { background: var(--xui-danger); }

.card-main {
  min-width: 0;
  flex: 1;
  padding: 18px 20px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.expand-button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  margin-top: 1px;
  border: 1px solid var(--xui-border);
  border-radius: 6px;
  color: var(--xui-text-muted);
  background: var(--xui-surface-2);
  cursor: pointer;
}

.expand-button span {
  transition: transform 150ms ease;
}

.expand-button span.expanded {
  transform: rotate(90deg);
}

.identity {
  min-width: 0;
  flex: 1;
}

.title-line,
.meta-line,
.primary-actions,
.traffic-labels {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
}

.title-line {
  gap: 7px;
}

.title-line h2 {
  min-width: 0;
  max-width: 420px;
  margin: 0 4px 0 0;
  overflow: hidden;
  color: var(--xui-text-strong);
  font-size: 16px;
  line-height: 28px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge,
.special-tag {
  display: inline-flex;
  align-items: center;
  min-height: 23px;
  padding: 2px 8px;
  border: 1px solid var(--xui-border);
  border-radius: 5px;
  color: var(--xui-text-muted);
  background: var(--xui-surface-2);
  font-size: 11px;
}

.badge.protocol { color: #8ec5ff; border-color: rgba(59, 130, 246, 0.38); background: rgba(59, 130, 246, 0.12); }
.badge.status-running { color: #63e6be; border-color: rgba(16, 185, 129, 0.34); background: rgba(16, 185, 129, 0.1); }
.badge.status-disabled { color: #b3bfce; }
.badge.status-expiring { color: #ffd166; border-color: rgba(245, 158, 11, 0.36); background: rgba(245, 158, 11, 0.1); }
.badge.status-expired { color: #ff8a8a; border-color: rgba(239, 68, 68, 0.36); background: rgba(239, 68, 68, 0.1); }
.badge.port { color: #b7c7dc; }

.meta-line {
  gap: 7px 16px;
  margin-top: 9px;
  color: var(--xui-text-muted);
  font-size: 12px;
}

.meta-line > span:not(.special-tag)::before {
  content: '';
  width: 4px;
  height: 4px;
  display: inline-block;
  margin: 0 7px 2px 0;
  border-radius: 50%;
  background: var(--xui-text-faint);
}

.special-tag {
  min-height: 20px;
  padding: 1px 6px;
  color: #67e8f9;
  border-color: rgba(6, 182, 212, 0.34);
  background: rgba(6, 182, 212, 0.08);
}

.primary-actions {
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 6px;
}

.primary-actions :deep(.icon-action) {
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--xui-text-muted);
  border-color: var(--xui-border);
  background: var(--xui-surface-2);
}

.primary-actions :deep(.icon-action:hover) { color: #fff; border-color: var(--xui-primary); background: var(--xui-primary); }
.primary-actions :deep(.power.enabled:hover) { border-color: var(--xui-warning); background: var(--xui-warning); }
.primary-actions :deep(.delete:hover) { border-color: var(--xui-danger); background: var(--xui-danger); }

.traffic-section {
  width: min(580px, 100%);
  margin: 16px 0 0 40px;
}

.traffic-labels {
  gap: 10px;
  margin-bottom: 4px;
  color: var(--xui-text-muted);
  font-size: 11px;
}

.traffic-labels strong {
  color: var(--xui-text);
  font-weight: 600;
}

.traffic-labels span:last-child {
  margin-left: auto;
}

.traffic-section :deep(.ant-progress-inner) {
  background: var(--xui-surface-3);
}

.client-panel {
  margin: 16px 0 0 40px;
  padding-top: 16px;
  border-top: 1px solid var(--xui-border);
}

.danger-item {
  color: var(--xui-danger) !important;
}

@media (max-width: 980px) {
  .card-header {
    flex-wrap: wrap;
  }

  .primary-actions {
    width: 100%;
    padding-left: 40px;
    justify-content: flex-start;
  }
}

@media (max-width: 768px) {
  .search-group,
  .search-group :deep(.ant-input-affix-wrapper) {
    width: 100%;
  }

  .panel-toolbar__group:last-child :deep(.ant-btn) {
    flex: 1;
  }

  .card-main {
    padding: 14px 12px;
  }

  .title-line h2 {
    width: 100%;
    max-width: calc(100vw - 112px);
  }

  .primary-actions {
    padding-left: 0;
  }

  .primary-actions :deep(.icon-action) {
    width: 32px;
    height: 32px;
  }

  .traffic-section,
  .client-panel {
    margin-left: 0;
  }
}
</style>
