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
  { key: 'all', label: t('pages.inbounds.filterAll') },
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

function onQrAction(record) {
  emit('row-action', { key: 'qrcode', dbInbound: record });
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
        <a-tooltip :title="t('pages.inbounds.refresh')">
          <a-button :aria-label="t('pages.inbounds.refresh')" @click="emit('refresh')">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
      <div class="panel-toolbar__group">
        <a-button class="import-button" @click="emit('general-action', 'import')">
          <template #icon><ImportOutlined /></template>
          {{ t('pages.inbounds.importInbound') }}
        </a-button>
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
              <a-tooltip v-if="record.hasLink() || record.isWireguard" :title="t('qrCode')">
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
  gap: 13px;
}

.inbound-toolbar {
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.search-group :deep(.ant-input-affix-wrapper) {
  width: min(360px, 42vw);
  min-height: 40px;
  padding-inline: 13px;
  border-color: rgba(255, 255, 255, 0.065);
  border-radius: 10px !important;
  background: rgba(255, 255, 255, 0.03) !important;
}

.search-group :deep(.ant-input-prefix) {
  color: #64748b;
}

.inbound-toolbar :deep(.ant-btn) {
  min-height: 40px;
  border-color: rgba(255, 255, 255, 0.065);
  border-radius: 10px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.025);
}

.inbound-toolbar :deep(.ant-btn:hover) {
  color: #f1f5f9;
  border-color: rgba(255, 255, 255, 0.13);
  background: rgba(255, 255, 255, 0.055);
}

.inbound-toolbar :deep(.ant-btn-primary) {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, #6366f1, #7c3aed);
  box-shadow: 0 5px 18px rgba(99, 102, 241, 0.3);
}

.inbound-toolbar :deep(.ant-btn-primary:hover) {
  color: #fff;
  border-color: transparent;
  background: linear-gradient(135deg, #7477f5, #8b4de3);
  transform: translateY(-1px);
}

.filter-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 0 0 2px;
  border: 0;
  background: transparent;
}

.filter-tabs button {
  min-height: 35px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 8px;
  color: #64748b;
  background: transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms ease, border-color 150ms ease, background 150ms ease;
}

.filter-tabs button:hover {
  color: #cbd5e1;
  border-color: rgba(255, 255, 255, 0.13);
  background: rgba(255, 255, 255, 0.035);
}

.filter-tabs button.active {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.32);
  background: rgba(99, 102, 241, 0.14);
}

.inbound-cards {
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.inbound-card {
  position: relative;
  overflow: hidden;
  display: flex;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 14px;
  background: rgba(15, 17, 23, 0.82);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(18px);
  animation: card-enter 320ms ease both;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.inbound-card:hover {
  border-color: rgba(255, 255, 255, 0.115);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.23);
  transform: translateY(-1px);
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}

.status-rail {
  width: 3px;
  flex: 0 0 3px;
  background: #10b981;
  box-shadow: 0 0 14px rgba(16, 185, 129, 0.38);
}

.inbound-card.status-disabled .status-rail { background: #475569; box-shadow: none; }
.inbound-card.status-expiring .status-rail { background: #f59e0b; box-shadow: 0 0 14px rgba(245, 158, 11, 0.32); }
.inbound-card.status-expired .status-rail { background: #ef4444; box-shadow: 0 0 14px rgba(239, 68, 68, 0.32); }

.card-main {
  min-width: 0;
  flex: 1;
  padding: 13px 14px 12px;
}

.card-header {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.expand-button {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  flex: 0 0 28px;
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 8px;
  color: #64748b;
  background: transparent;
  cursor: pointer;
}

.expand-button:hover {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.3);
  background: rgba(99, 102, 241, 0.1);
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
  gap: 6px;
}

.title-line h2 {
  min-width: 0;
  max-width: 420px;
  margin: 0 4px 0 0;
  overflow: hidden;
  color: #f1f5f9;
  font-size: 15px;
  line-height: 24px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.badge,
.special-tag {
  display: inline-flex;
  align-items: center;
  min-height: 21px;
  padding: 1px 7px;
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 6px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.035);
  font-size: 11.5px;
  font-weight: 550;
}

.badge.protocol { color: #a5b4fc; border-color: rgba(99, 102, 241, 0.3); background: rgba(99, 102, 241, 0.13); }
.badge.status-running { color: #34d399; border-color: rgba(16, 185, 129, 0.28); background: rgba(16, 185, 129, 0.1); }
.badge.status-disabled { color: #94a3b8; background: rgba(100, 116, 139, 0.11); }
.badge.status-expiring { color: #fbbf24; border-color: rgba(245, 158, 11, 0.3); background: rgba(245, 158, 11, 0.1); }
.badge.status-expired { color: #f87171; border-color: rgba(239, 68, 68, 0.3); background: rgba(239, 68, 68, 0.1); }
.badge.port { color: #cbd5e1; font-variant-numeric: tabular-nums; }

.meta-line {
  gap: 5px 14px;
  margin-top: 5px;
  color: #64748b;
  font-size: 12px;
}

.meta-line > span:not(.special-tag)::before {
  content: '';
  width: 4px;
  height: 4px;
  display: inline-block;
  margin: 0 7px 2px 0;
  border-radius: 50%;
  background: #475569;
}

.special-tag {
  min-height: 20px;
  padding: 1px 6px;
  color: #c4b5fd;
  border-color: rgba(139, 92, 246, 0.28);
  background: rgba(139, 92, 246, 0.09);
}

.primary-actions {
  justify-content: flex-end;
  flex: 0 0 auto;
  gap: 5px;
}

.primary-actions :deep(.icon-action) {
  width: 30px;
  height: 30px;
  padding: 0;
  color: #64748b;
  border-color: rgba(255, 255, 255, 0.065);
  border-radius: 8px;
  background: transparent;
}

.primary-actions :deep(.icon-action:hover) { color: #f1f5f9; border-color: rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.055); }
.primary-actions :deep(.qr:hover),
.primary-actions :deep(.copy:hover),
.primary-actions :deep(.edit:hover) { color: #a5b4fc; border-color: rgba(99, 102, 241, 0.32); background: rgba(99, 102, 241, 0.12); }
.primary-actions :deep(.power.enabled) { color: #34d399; }
.primary-actions :deep(.power:hover) { color: #fbbf24; border-color: rgba(245, 158, 11, 0.28); background: rgba(245, 158, 11, 0.1); }
.primary-actions :deep(.delete:hover) { color: #f87171; border-color: rgba(239, 68, 68, 0.28); background: rgba(239, 68, 68, 0.1); }

.traffic-section {
  width: min(540px, 100%);
  margin: 9px 0 0 37px;
}

.traffic-labels {
  gap: 8px;
  margin-bottom: 2px;
  color: #64748b;
  font-size: 11px;
}

.traffic-labels strong {
  color: #cbd5e1;
  font-weight: 600;
}

.traffic-labels span:last-child {
  margin-left: auto;
}

.traffic-section :deep(.ant-progress-inner) {
  background: rgba(255, 255, 255, 0.055);
}

.client-panel {
  margin: 12px -14px -12px -17px;
  padding: 13px 14px 14px 17px;
  border-top: 1px solid rgba(255, 255, 255, 0.055);
  background: rgba(0, 0, 0, 0.18);
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

  .inbound-toolbar :deep(.ant-btn) {
    min-width: 0;
  }

  .card-main {
    padding: 12px 11px;
  }

  .title-line h2 {
    width: 100%;
    max-width: calc(100vw - 112px);
  }

  .primary-actions {
    padding-left: 0;
  }

  .primary-actions :deep(.icon-action) {
    width: 30px;
    height: 30px;
  }

  .traffic-section,
  .traffic-section {
    margin-left: 0;
  }

  .client-panel {
    margin-right: -11px;
    margin-bottom: -12px;
    margin-left: -14px;
    padding-right: 11px;
    padding-left: 14px;
  }
}
</style>
