<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  EditOutlined,
  InfoCircleOutlined,
  QrcodeOutlined,
  RetweetOutlined,
  DeleteOutlined,
  EllipsisOutlined,
} from '@ant-design/icons-vue';
import { Modal } from 'ant-design-vue';

import { SizeFormatter, IntlUtil, ColorUtils } from '@/utils';
import InfinityIcon from '@/components/InfinityIcon.vue';
import { useDatepicker } from '@/composables/useDatepicker.js';

const { datepicker } = useDatepicker();

const { t } = useI18n();

// Per-inbound expand-row content. CSS-grid layout (not a nested
// <a-table>) so it sits flush inside the parent's expanded cell.
// No API calls here — events bubble to the parent's modals.

const props = defineProps({
  dbInbound: { type: Object, required: true },
  isMobile: { type: Boolean, default: false },
  trafficDiff: { type: Number, default: 0 },
  expireDiff: { type: Number, default: 0 },
  onlineClients: { type: Array, default: () => [] },
  lastOnlineMap: { type: Object, default: () => ({}) },
  isDarkTheme: { type: Boolean, default: false },
});

const emit = defineEmits([
  'edit-client',
  'qrcode-client',
  'info-client',
  'reset-traffic-client',
  'delete-client',
  'toggle-enable-client',
]);

const inbound = computed(() => props.dbInbound.toInbound());
const clients = computed(() => inbound.value?.clients || []);

// === Per-client stats lookup =======================================
const statsMap = computed(() => {
  const m = new Map();
  for (const cs of (props.dbInbound.clientStats || [])) m.set(cs.email, cs);
  return m;
});
function statsFor(email) {
  return email ? statsMap.value.get(email) : null;
}

function getUp(email) { return statsFor(email)?.up || 0; }
function getDown(email) { return statsFor(email)?.down || 0; }
function getSum(email) { const s = statsFor(email); return s ? s.up + s.down : 0; }
function getRem(email) {
  const s = statsFor(email);
  if (!s) return 0;
  const r = s.total - s.up - s.down;
  return r > 0 ? r : 0;
}
function getAllTime(email) {
  const s = statsFor(email);
  if (!s) return 0;
  // allTime is the cumulative-historical counter; never let it dip
  // below up+down (manual edits / partial migrations can push it under).
  const current = (s.up || 0) + (s.down || 0);
  return s.allTime > current ? s.allTime : current;
}
function isClientDepleted(email) {
  const s = statsFor(email);
  if (!s) return false;
  const total = s.total ?? 0;
  const used = (s.up ?? 0) + (s.down ?? 0);
  if (total > 0 && used >= total) return true;
  const exp = s.expiryTime ?? 0;
  if (exp > 0 && Date.now() >= exp) return true;
  return false;
}
function isClientOnline(email) {
  return !!email && props.onlineClients.includes(email);
}
function lastOnlineLabel(email) {
  const ts = props.lastOnlineMap[email];
  if (!ts) return '-';
  return IntlUtil.formatDate(ts, datepicker.value);
}

function statsProgress(email) {
  const s = statsFor(email);
  if (!s) return 0;
  if (s.total === 0) return 100;
  return (100 * (s.down + s.up)) / s.total;
}
function expireProgress(expTime, reset) {
  const now = Date.now();
  const remainedSec = expTime < 0 ? -expTime / 1000 : (expTime - now) / 1000;
  const resetSec = reset * 86400;
  if (remainedSec >= resetSec) return 0;
  return 100 * (1 - remainedSec / resetSec);
}
function clientStatsColor(email) {
  return ColorUtils.clientUsageColor(statsFor(email), props.trafficDiff);
}
function statsExpColor(email) {
  // AD-Vue 4 semantic palette mirrors ColorUtils.* so the badge dot
  // matches the row's traffic/expiry tags.
  const PURPLE = '#722ed1', SUCCESS = '#52c41a', WARN = '#faad14', DANGER = '#ff4d4f';
  if (!email) return PURPLE;
  const s = statsFor(email);
  if (!s) return PURPLE;
  const a = ColorUtils.usageColor(s.down + s.up, props.trafficDiff, s.total);
  const b = ColorUtils.usageColor(Date.now(), props.expireDiff, s.expiryTime);
  if (a === 'red' || b === 'red') return DANGER;
  if (a === 'orange' || b === 'orange') return WARN;
  if (a === 'green' || b === 'green') return SUCCESS;
  return PURPLE;
}

const isRemovable = computed(() => clients.value.length > 1);

function totalGbDisplay(client) {
  if (!client.totalGB || client.totalGB <= 0) return '';
  return `${Math.round((client.totalGB / 1073741824) * 100) / 100} GB`;
}

const isUnlimitedTotal = (client) => !client.totalGB || client.totalGB <= 0;

function statusBadgeColor(client) {
  if (!client.enable) return props.isDarkTheme ? '#2c3950' : '#bcbcbc';
  return statsExpColor(client.email);
}

// === Action confirms ==============================================
function confirmReset(client) {
  Modal.confirm({
    class: 'inbound-confirm-modal',
    title: `${t('pages.inbounds.resetTraffic')} — ${client.email}`,
    content: t('pages.inbounds.resetTrafficContent'),
    okText: t('reset'),
    cancelText: t('cancel'),
    onOk: () => emit('reset-traffic-client', { dbInbound: props.dbInbound, client }),
  });
}
function confirmDelete(client) {
  Modal.confirm({
    class: 'inbound-confirm-modal',
    title: `${t('pages.inbounds.deleteClient')} — ${client.email}`,
    content: t('pages.inbounds.deleteClientContent'),
    okText: t('delete'),
    okType: 'danger',
    cancelText: t('cancel'),
    onOk: () => emit('delete-client', { dbInbound: props.dbInbound, client }),
  });
}

// Stable row key for v-for — falls back through email/id/password
// because not every protocol fills the same field.
function rowKey(client) {
  return client.email || client.id || client.password || JSON.stringify(client);
}
</script>

<template>
  <div class="client-list" :class="{ 'is-mobile': isMobile, 'is-dark': isDarkTheme }">
    <!-- ====================== Desktop: grid table ===================== -->
    <template v-if="!isMobile">
      <div class="client-row client-list-header">
        <div class="cell cell-actions">{{ t('pages.settings.actions') }}</div>
        <div class="cell cell-enable">{{ t('enable') }}</div>
        <div class="cell cell-online">{{ t('online') }}</div>
        <div class="cell cell-client">{{ t('pages.inbounds.client') }}</div>
        <div class="cell cell-traffic">{{ t('pages.inbounds.traffic') }}</div>
        <div class="cell cell-alltime">{{ t('pages.inbounds.allTimeTraffic') }}</div>
        <div class="cell cell-expiry">{{ t('pages.inbounds.expireDate') }}</div>
      </div>

      <div v-for="client in clients" :key="rowKey(client)" class="client-row">
        <div class="cell cell-actions">
          <a-tooltip v-if="dbInbound.hasLink()" :title="t('qrCode')">
            <QrcodeOutlined class="row-icon" @click="emit('qrcode-client', { dbInbound, client })" />
          </a-tooltip>
          <a-tooltip :title="t('edit')">
            <EditOutlined class="row-icon" @click="emit('edit-client', { dbInbound, client })" />
          </a-tooltip>
          <a-tooltip :title="t('info')">
            <InfoCircleOutlined class="row-icon" @click="emit('info-client', { dbInbound, client })" />
          </a-tooltip>
          <a-tooltip v-if="client.email" :title="t('pages.inbounds.resetTraffic')">
            <RetweetOutlined class="row-icon" @click="confirmReset(client)" />
          </a-tooltip>
          <a-tooltip v-if="isRemovable" :title="t('delete')">
            <DeleteOutlined class="row-icon danger" @click="confirmDelete(client)" />
          </a-tooltip>
        </div>

        <div class="cell cell-enable">
          <a-switch :checked="client.enable" size="small"
            @change="(next) => emit('toggle-enable-client', { dbInbound, client, next })" />
        </div>

        <div class="cell cell-online">
          <a-popover>
            <template #content>{{ t('lastOnline') }}: {{ lastOnlineLabel(client.email) }}</template>
            <a-tag v-if="client.enable && isClientOnline(client.email)" color="green">{{ t('online') }}</a-tag>
            <a-tag v-else>{{ t('offline') }}</a-tag>
          </a-popover>
        </div>

        <div class="cell cell-client">
          <a-tooltip>
            <template #title>
              <template v-if="isClientDepleted(client.email)">{{ t('depleted') }}</template>
              <template v-else-if="!client.enable">{{ t('disabled') }}</template>
              <template v-else-if="isClientOnline(client.email)">{{ t('online') }}</template>
              <template v-else>{{ t('offline') }}</template>
            </template>
            <a-badge :color="statusBadgeColor(client)" />
          </a-tooltip>
          <div class="client-id-stack">
            <a-tooltip :title="client.email">
              <span class="client-email">{{ client.email }}</span>
            </a-tooltip>
            <span v-if="client.comment && client.comment.trim()" class="client-comment">
              {{ client.comment.length > 50 ? client.comment.substring(0, 47) + '…' : client.comment }}
            </span>
          </div>
        </div>

        <div class="cell cell-traffic">
          <a-popover>
            <template v-if="client.email" #content>
              <table cellpadding="2">
                <tbody>
                  <tr>
                    <td>↑ {{ SizeFormatter.sizeFormat(getUp(client.email)) }}</td>
                    <td>↓ {{ SizeFormatter.sizeFormat(getDown(client.email)) }}</td>
                  </tr>
                  <tr v-if="client.totalGB > 0">
                    <td>{{ t('remained') }}</td>
                    <td>{{ SizeFormatter.sizeFormat(getRem(client.email)) }}</td>
                  </tr>
                </tbody>
              </table>
            </template>
            <div class="usage-bar">
              <span class="usage-text">{{ SizeFormatter.sizeFormat(getSum(client.email)) }}</span>
              <a-progress v-if="!client.enable" :stroke-color="isDarkTheme ? 'rgb(72,84,105)' : '#bcbcbc'"
                :show-info="false" :percent="statsProgress(client.email)" size="small" />
              <a-progress v-else-if="client.totalGB > 0" :stroke-color="clientStatsColor(client.email)"
                :show-info="false" :status="isClientDepleted(client.email) ? 'exception' : ''"
                :percent="statsProgress(client.email)" size="small" />
              <a-progress v-else :show-info="false" :percent="100" stroke-color="#722ed1" size="small" />
              <span class="usage-text">
                <InfinityIcon v-if="isUnlimitedTotal(client)" />
                <template v-else>{{ totalGbDisplay(client) }}</template>
              </span>
            </div>
          </a-popover>
        </div>

        <div class="cell cell-alltime">
          <a-tag>{{ SizeFormatter.sizeFormat(getAllTime(client.email)) }}</a-tag>
        </div>

        <div class="cell cell-expiry">
          <template v-if="client.expiryTime !== 0 && client.reset > 0">
            <a-popover>
              <template #content>
                <span v-if="client.expiryTime < 0">{{ t('pages.client.delayedStart') }}</span>
                <span v-else>{{ IntlUtil.formatDate(client.expiryTime, datepicker) }}</span>
              </template>
              <div class="usage-bar">
                <span class="usage-text">{{ IntlUtil.formatRelativeTime(client.expiryTime) }}</span>
                <a-progress :show-info="false" :status="isClientDepleted(client.email) ? 'exception' : ''"
                  :percent="expireProgress(client.expiryTime, client.reset)" size="small" />
                <span class="usage-text">{{ client.reset }}d</span>
              </div>
            </a-popover>
          </template>
          <a-popover v-else-if="client.expiryTime !== 0">
            <template #content>
              <span v-if="client.expiryTime < 0">{{ t('pages.client.delayedStart') }}</span>
              <span v-else>{{ IntlUtil.formatDate(client.expiryTime) }}</span>
            </template>
            <a-tag :style="{ minWidth: '50px', border: 'none' }"
              :color="ColorUtils.userExpiryColor(expireDiff, client, isDarkTheme)">
              {{ IntlUtil.formatRelativeTime(client.expiryTime) }}
            </a-tag>
          </a-popover>
          <a-tag v-else :color="ColorUtils.userExpiryColor(expireDiff, client, isDarkTheme)"
            :style="{ border: 'none' }" class="infinite-tag">
            <InfinityIcon />
          </a-tag>
        </div>
      </div>
    </template>

    <!-- ====================== Mobile: card list ======================= -->
    <template v-else>
      <div v-for="client in clients" :key="rowKey(client)" class="client-card">
        <div class="client-card-head">
          <a-tooltip>
            <template #title>
              <template v-if="isClientDepleted(client.email)">{{ t('depleted') }}</template>
              <template v-else-if="!client.enable">{{ t('disabled') }}</template>
              <template v-else-if="isClientOnline(client.email)">{{ t('online') }}</template>
              <template v-else>{{ t('offline') }}</template>
            </template>
            <a-badge :color="statusBadgeColor(client)" />
          </a-tooltip>
          <a-tooltip :title="client.email">
            <span class="client-email">{{ client.email }}</span>
          </a-tooltip>
          <div class="client-card-actions">
            <a-switch :checked="client.enable" size="small"
              @change="(next) => emit('toggle-enable-client', { dbInbound, client, next })" />
            <a-dropdown :trigger="['click']" placement="bottomRight">
              <EllipsisOutlined class="row-icon" @click.prevent />
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="dbInbound.hasLink()" @click="emit('qrcode-client', { dbInbound, client })">
                    <QrcodeOutlined /> {{ t('qrCode') }}
                  </a-menu-item>
                  <a-menu-item @click="emit('edit-client', { dbInbound, client })">
                    <EditOutlined /> {{ t('edit') }}
                  </a-menu-item>
                  <a-menu-item @click="emit('info-client', { dbInbound, client })">
                    <InfoCircleOutlined /> {{ t('info') }}
                  </a-menu-item>
                  <a-menu-item v-if="client.email" @click="confirmReset(client)">
                    <RetweetOutlined /> {{ t('pages.inbounds.resetTraffic') }}
                  </a-menu-item>
                  <a-menu-item v-if="isRemovable" @click="confirmDelete(client)">
                    <DeleteOutlined /> <span class="danger">{{ t('delete') }}</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </div>
        </div>

        <div v-if="client.comment && client.comment.trim()" class="client-comment-line">
          {{ client.comment.length > 80 ? client.comment.substring(0, 77) + '…' : client.comment }}
        </div>

        <div class="client-card-foot">
          <div class="stat-row">
            <span class="stat-label">{{ t('pages.inbounds.traffic') }}</span>
            <a-tag :color="clientStatsColor(client.email)">
              {{ SizeFormatter.sizeFormat(getSum(client.email)) }} /
              <InfinityIcon v-if="isUnlimitedTotal(client)" />
              <template v-else>{{ totalGbDisplay(client) }}</template>
            </a-tag>
          </div>
          <div class="stat-row">
            <span class="stat-label">{{ t('pages.inbounds.allTimeTraffic') }}</span>
            <a-tag>{{ SizeFormatter.sizeFormat(getAllTime(client.email)) }}</a-tag>
          </div>
          <div class="stat-row">
            <span class="stat-label">{{ t('online') }}</span>
            <a-tag v-if="client.enable && isClientOnline(client.email)" color="green">{{ t('online') }}</a-tag>
            <a-tag v-else>{{ t('offline') }}</a-tag>
          </div>
          <div class="stat-row">
            <span class="stat-label">{{ t('pages.inbounds.expireDate') }}</span>
            <a-tag v-if="client.expiryTime > 0" :color="ColorUtils.userExpiryColor(expireDiff, client, isDarkTheme)">
              {{ IntlUtil.formatRelativeTime(client.expiryTime) }}
            </a-tag>
            <a-tag v-else-if="client.expiryTime < 0" color="green">
              {{ -client.expiryTime / 86400000 }}d ({{ t('pages.client.delayedStart') }})
            </a-tag>
            <a-tag v-else color="purple"><InfinityIcon /></a-tag>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.client-list {
  margin: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 10px;
  background: rgba(15, 17, 23, 0.62);
  font-size: 13px;
}

.client-row {
  display: grid;
  grid-template-columns:
    140px
    /* actions */
    60px
    /* enable */
    80px
    /* online */
    minmax(160px, 2fr)
    /* client identity */
    minmax(160px, 2fr)
    /* traffic */
    130px
    /* all-time */
    140px;
  /* expiry */
  gap: 12px;
  align-items: center;
  min-height: 52px;
  padding: 8px 13px;
  border-top: 1px solid rgba(255, 255, 255, 0.045);
  transition: background 150ms ease;
}

.client-row:not(.client-list-header):hover {
  background: rgba(255, 255, 255, 0.024);
}

.client-list-header {
  min-height: 42px;
  color: #64748b;
  font-weight: 600;
  font-size: 10.5px;
  padding-top: 7px;
  padding-bottom: 7px;
  border-top: none;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.022);
}

.cell {
  min-width: 0;
  /* allow grid children to shrink instead of overflowing */
}

.cell-actions,
.cell-enable,
.cell-online,
.cell-alltime {
  text-align: center;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cell-actions {
  justify-content: flex-start;
}

.cell-client {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.cell-traffic,
.cell-expiry {
  text-align: center;
}

.client-list-header .cell {
  text-align: center;
}

.client-list-header .cell-actions,
.client-list-header .cell-client {
  text-align: left;
}

/* Action icons */
.row-icon {
  width: 28px;
  height: 28px;
  display: inline-grid;
  place-items: center;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 7px;
  color: #64748b;
  background: transparent;
  font-size: 14px;
  cursor: pointer;
  transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
}

.row-icon:hover {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.3);
  background: rgba(99, 102, 241, 0.1);
}

.row-icon.danger {
  color: #f87171;
}

.row-icon.danger:hover {
  border-color: rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.1);
}

.danger {
  color: #ff4d4f;
}

/* Client identity stack (badge + email + comment) */
.client-id-stack {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.client-email {
  color: #cbd5e1;
  font-weight: 550;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

.client-comment {
  color: #64748b;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: inline-block;
}

/* Traffic / expiry inline bar:  text  |  progress  |  text */
.usage-bar {
  display: grid;
  grid-template-columns: minmax(50px, auto) minmax(40px, 1fr) minmax(40px, auto);
  align-items: center;
  gap: 6px;
}

.usage-text {
  color: #94a3b8;
  font-size: 12px;
  white-space: nowrap;
}

.usage-bar :deep(.ant-progress) {
  margin: 0;
  line-height: 1;
}

.usage-bar :deep(.ant-progress-inner) {
  background: rgba(255, 255, 255, 0.055);
}

.client-list :deep(.ant-tag) {
  margin-inline-end: 0;
  border-color: rgba(255, 255, 255, 0.055);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.035);
}

.client-list :deep(.ant-switch) {
  background: #334155;
}

.client-list :deep(.ant-switch-checked) {
  background: #10b981;
}

.infinite-tag {
  min-width: 50px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* Strip AD-Vue's default expanded-cell padding so the desktop grid
 * sits flush against the inbound row's left/right edges. */
:deep(.ant-table-expanded-row > .ant-table-cell) {
  padding: 0 !important;
}

/* ===== Mobile card list =========================================== */
.client-list.is-mobile {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  overflow: visible;
  border: 0;
  background: transparent;
}

.client-card {
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: rgba(15, 17, 23, 0.72);
}

.client-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.client-card-head .client-email {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.client-card-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.client-card-actions .row-icon {
  width: 32px;
  height: 32px;
  font-size: 17px;
}

.client-comment-line {
  color: #64748b;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.client-card-foot {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.client-card-foot .stat-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.client-card-foot .stat-label {
  color: #64748b;
  font-size: 10px;
  text-transform: uppercase;
  min-width: 96px;
  flex-shrink: 0;
}
.client-card-foot :deep(.ant-tag) {
  margin: 0;
}

/* Bigger status badge for thumb-readable state at a glance. */
.client-card-head :deep(.ant-badge-status-dot) {
  width: 9px;
  height: 9px;
}
</style>
