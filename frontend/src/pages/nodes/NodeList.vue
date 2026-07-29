<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ApiOutlined,
  ClockCircleOutlined,
  CodeOutlined,
  DeleteOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  HistoryOutlined,
  LinkOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import NodeHistoryPanel from './NodeHistoryPanel.vue';

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  probingIds: { type: Set, default: () => new Set() },
  togglingIds: { type: Set, default: () => new Set() },
});

const emit = defineEmits(['add', 'refresh', 'edit', 'delete', 'probe', 'toggle-enable']);
const { t } = useI18n();
const expandedIds = ref(new Set());
const searchKey = ref('');
const statusFilter = ref('all');

const dataSource = computed(() => props.nodes.map((node) => ({
  ...node,
  url: `${node.scheme}://${node.address}:${node.port}${node.basePath || '/'}`,
})));

const filterItems = computed(() => [
  { key: 'all', label: t('pages.nodes.filterAll') },
  { key: 'online', label: t('pages.nodes.statusValues.online') },
  { key: 'offline', label: t('pages.nodes.statusValues.offline') },
  { key: 'disabled', label: t('disabled') },
]);

const visibleNodes = computed(() => {
  const query = searchKey.value.trim().toLocaleLowerCase();
  return dataSource.value.filter((node) => {
    if (statusFilter.value === 'disabled' && node.enable) return false;
    if (statusFilter.value === 'online' && (!node.enable || node.status !== 'online')) return false;
    if (statusFilter.value === 'offline' && (!node.enable || node.status !== 'offline')) return false;
    if (!query) return true;

    return [node.name, node.remark, node.address, node.url, node.xrayVersion]
      .some((value) => String(value || '').toLocaleLowerCase().includes(query));
  });
});

function toggleExpanded(id) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  expandedIds.value = next;
}

function isExpanded(id) {
  return expandedIds.value.has(id);
}

function relativeTime(unixSeconds) {
  if (!unixSeconds) return t('pages.nodes.never');
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000 - unixSeconds));
  if (diffSec < 5) return t('pages.nodes.justNow');
  if (diffSec < 60) return `${diffSec}s`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h`;
  return `${Math.floor(diffSec / 86400)}d`;
}

function formatUptime(secs) {
  if (!secs) return '-';
  const days = Math.floor(secs / 86400);
  const hours = Math.floor((secs % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const mins = Math.floor((secs % 3600) / 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatPct(value) {
  return typeof value === 'number' && !Number.isNaN(value) ? `${value.toFixed(1)}%` : '-';
}

function progressValue(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function progressClass(value) {
  if (value >= 90) return 'danger';
  if (value >= 70) return 'warning';
  return '';
}

function avatarText(node) {
  const source = String(node.name || node.address || 'XP').trim();
  const words = source.split(/[\s_-]+/).filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function statusKey(node) {
  return node.enable ? (node.status || 'unknown') : 'disabled';
}

function statusLabel(node) {
  return node.enable
    ? t(`pages.nodes.statusValues.${node.status || 'unknown'}`)
    : t('disabled');
}
</script>

<template>
  <section class="node-list-shell">
    <div class="panel-toolbar node-toolbar">
      <div class="panel-toolbar__group search-group">
        <a-input v-model:value="searchKey" :placeholder="t('pages.nodes.searchPlaceholder')" allow-clear>
          <template #prefix><SearchOutlined /></template>
        </a-input>
        <a-tooltip :title="t('pages.nodes.refresh')">
          <a-button :aria-label="t('pages.nodes.refresh')" :loading="loading" @click="emit('refresh')">
            <template #icon><ReloadOutlined /></template>
          </a-button>
        </a-tooltip>
      </div>
      <span class="result-count">{{ visibleNodes.length }} / {{ dataSource.length }}</span>
    </div>

    <div class="filter-tabs" role="tablist" :aria-label="t('pages.nodes.status')">
      <button
        v-for="item in filterItems"
        :key="item.key"
        type="button"
        :class="{ active: statusFilter === item.key }"
        @click="statusFilter = item.key"
      >
        {{ item.label }}
      </button>
    </div>

    <a-spin :spinning="loading">
      <div class="node-grid">
        <a-empty
          v-if="visibleNodes.length === 0 && dataSource.length > 0"
          class="empty-filter"
          :description="t('noData')"
        />

        <article
          v-for="node in visibleNodes"
          :key="node.id"
          class="node-card"
          :class="`status-${statusKey(node)}`"
        >
          <div class="node-card-main">
            <header class="node-top">
              <div class="node-identity">
                <div class="node-avatar">{{ avatarText(node) }}</div>
                <div class="node-copy">
                  <div class="node-name-line">
                    <h2>{{ node.name }}</h2>
                    <a-tooltip v-if="node.lastError" :title="node.lastError">
                      <ExclamationCircleOutlined class="warning-icon" />
                    </a-tooltip>
                  </div>
                  <a :href="node.url" target="_blank" rel="noopener noreferrer" class="node-url">
                    <LinkOutlined />
                    <span>{{ node.address }}:{{ node.port }}</span>
                  </a>
                </div>
              </div>
              <span class="status-badge" :class="`status-${statusKey(node)}`">
                <span class="status-dot" />{{ statusLabel(node) }}
              </span>
            </header>

            <p v-if="node.remark" class="node-remark">{{ node.remark }}</p>

            <div class="resource-grid">
              <div class="resource-metric">
                <div class="metric-heading">
                  <span>CPU</span>
                  <strong>{{ formatPct(node.cpuPct) }}</strong>
                </div>
                <div class="progress-track">
                  <i :class="progressClass(node.cpuPct)" :style="{ width: `${progressValue(node.cpuPct)}%` }" />
                </div>
              </div>
              <div class="resource-metric">
                <div class="metric-heading">
                  <span>{{ t('pages.nodes.mem') }}</span>
                  <strong>{{ formatPct(node.memPct) }}</strong>
                </div>
                <div class="progress-track memory">
                  <i :class="progressClass(node.memPct)" :style="{ width: `${progressValue(node.memPct)}%` }" />
                </div>
              </div>
              <div class="resource-metric latency-metric">
                <div class="metric-heading">
                  <span>{{ t('pages.nodes.latency') }}</span>
                  <strong>{{ node.latencyMs > 0 ? `${node.latencyMs} ms` : '-' }}</strong>
                </div>
                <div class="latency-mark"><ThunderboltOutlined /></div>
              </div>
            </div>

            <div class="detail-row">
              <span><ClockCircleOutlined /> {{ t('pages.nodes.uptime') }} <strong>{{ formatUptime(node.uptimeSecs) }}</strong></span>
              <span><ApiOutlined /> {{ String(node.scheme || 'https').toUpperCase() }} <strong>{{ node.basePath || '/' }}</strong></span>
              <span><CodeOutlined /> Xray <strong>{{ node.xrayVersion || '-' }}</strong></span>
            </div>

            <footer class="node-footer">
              <span class="heartbeat">
                <ClockCircleOutlined />
                {{ t('pages.nodes.lastHeartbeat') }} <strong>{{ relativeTime(node.lastHeartbeat) }}</strong>
              </span>
              <div class="node-actions">
                <a-tooltip :title="t('pages.nodes.history')">
                  <a-button
                    class="icon-action history"
                    :class="{ active: isExpanded(node.id) }"
                    :aria-pressed="isExpanded(node.id)"
                    @click="toggleExpanded(node.id)"
                  >
                    <template #icon><HistoryOutlined /></template>
                  </a-button>
                </a-tooltip>
                <a-tooltip :title="t('pages.nodes.probe')">
                  <a-button
                    class="icon-action probe"
                    :loading="probingIds.has(node.id)"
                    :disabled="togglingIds.has(node.id)"
                    @click="emit('probe', node)"
                  >
                    <template #icon><ThunderboltOutlined /></template>
                  </a-button>
                </a-tooltip>
                <a-tooltip :title="t('edit')">
                  <a-button
                    class="icon-action edit"
                    :disabled="probingIds.has(node.id) || togglingIds.has(node.id)"
                    @click="emit('edit', node)"
                  >
                    <template #icon><EditOutlined /></template>
                  </a-button>
                </a-tooltip>
                <a-tooltip :title="node.enable ? t('pages.nodes.disable') : t('pages.nodes.enable')">
                  <a-switch
                    :checked="node.enable"
                    :loading="togglingIds.has(node.id)"
                    :disabled="probingIds.has(node.id)"
                    size="small"
                    @change="(value) => emit('toggle-enable', node, value)"
                  />
                </a-tooltip>
                <a-tooltip :title="t('delete')">
                  <a-button
                    danger
                    class="icon-action delete"
                    :disabled="probingIds.has(node.id) || togglingIds.has(node.id)"
                    @click="emit('delete', node)"
                  >
                    <template #icon><DeleteOutlined /></template>
                  </a-button>
                </a-tooltip>
              </div>
            </footer>
          </div>

          <div v-if="isExpanded(node.id)" class="history-panel">
            <NodeHistoryPanel :node="node" />
          </div>
        </article>

        <button type="button" class="node-card add-card" @click="emit('add')">
          <span class="add-icon"><PlusOutlined /></span>
          <strong>{{ t('pages.nodes.addNode') }}</strong>
          <span>{{ t('pages.nodes.addCardHint') }}</span>
        </button>
      </div>
    </a-spin>
  </section>
</template>

<style scoped>
.node-list-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.node-toolbar {
  min-height: 42px;
  padding: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.search-group :deep(.ant-input-affix-wrapper) {
  width: min(380px, 48vw);
  min-height: 40px;
  padding-inline: 13px;
  border-color: rgba(255, 255, 255, 0.065);
  border-radius: 10px !important;
  background: rgba(255, 255, 255, 0.03) !important;
}

.search-group :deep(.ant-input-prefix) {
  color: #64748b;
}

.node-toolbar :deep(.ant-btn) {
  width: 40px;
  min-height: 40px;
  padding: 0;
  border-color: rgba(255, 255, 255, 0.065);
  border-radius: 10px;
  color: #64748b;
  background: rgba(255, 255, 255, 0.025);
}

.node-toolbar :deep(.ant-btn:hover) {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.3);
  background: rgba(99, 102, 241, 0.1);
}

.result-count {
  color: #64748b;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.filter-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
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

.node-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 16px;
}

.empty-filter {
  grid-column: 1 / -1;
  padding: 52px 20px;
}

.node-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 14px;
  color: #cbd5e1;
  background: rgba(15, 17, 23, 0.82);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.14);
  backdrop-filter: blur(18px);
  animation: card-enter 320ms ease both;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.node-card::before {
  content: '';
  position: absolute;
  top: -38px;
  right: -38px;
  width: 130px;
  height: 130px;
  pointer-events: none;
  background: radial-gradient(circle, rgba(99, 102, 241, 0.09), transparent 70%);
}

.node-card.status-online::before {
  background: radial-gradient(circle, rgba(16, 185, 129, 0.1), transparent 70%);
}

.node-card.status-offline::before {
  background: radial-gradient(circle, rgba(239, 68, 68, 0.09), transparent 70%);
}

.node-card:hover {
  border-color: rgba(255, 255, 255, 0.115);
  box-shadow: 0 18px 42px rgba(0, 0, 0, 0.23);
  transform: translateY(-2px);
}

@keyframes card-enter {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}

.node-card-main {
  position: relative;
  z-index: 1;
  padding: 19px;
}

.node-top,
.node-identity,
.node-name-line,
.node-url,
.metric-heading,
.detail-row,
.node-footer,
.heartbeat,
.node-actions {
  display: flex;
  align-items: center;
}

.node-top {
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.node-identity {
  min-width: 0;
  gap: 12px;
}

.node-avatar {
  width: 42px;
  height: 42px;
  flex: 0 0 42px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  font-size: 13px;
  font-weight: 750;
  background: linear-gradient(145deg, #6366f1, #8b5cf6);
  box-shadow: 0 7px 18px rgba(99, 102, 241, 0.24);
}

.status-online .node-avatar {
  background: linear-gradient(145deg, #10b981, #059669);
  box-shadow: 0 7px 18px rgba(16, 185, 129, 0.18);
}

.status-offline .node-avatar,
.status-disabled .node-avatar {
  background: linear-gradient(145deg, #64748b, #475569);
  box-shadow: none;
}

.node-copy {
  min-width: 0;
}

.node-name-line {
  min-width: 0;
  gap: 7px;
}

.node-name-line h2 {
  min-width: 0;
  max-width: 250px;
  margin: 0;
  overflow: hidden;
  color: #f1f5f9;
  font-size: 15px;
  line-height: 22px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.warning-icon {
  color: #f59e0b;
}

.node-url {
  max-width: 100%;
  gap: 5px;
  margin-top: 3px;
  overflow: hidden;
  color: #64748b;
  font-size: 11.5px;
}

.node-url span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-url:hover {
  color: #a5b4fc;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
  min-height: 24px;
  padding: 3px 9px;
  border: 1px solid rgba(255, 255, 255, 0.065);
  border-radius: 999px;
  color: #94a3b8;
  background: rgba(255, 255, 255, 0.035);
  font-size: 11px;
  font-weight: 600;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.status-badge.status-online {
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.26);
  background: rgba(16, 185, 129, 0.1);
}

.status-badge.status-online .status-dot {
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.15);
}

.status-badge.status-offline {
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.26);
  background: rgba(239, 68, 68, 0.1);
}

.status-badge.status-disabled,
.status-badge.status-unknown {
  color: #94a3b8;
  background: rgba(100, 116, 139, 0.1);
}

.node-remark {
  min-height: 18px;
  margin: 11px 0 0 54px;
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-top: 15px;
}

.resource-metric {
  min-width: 0;
  min-height: 69px;
  padding: 10px 11px;
  border: 1px solid rgba(255, 255, 255, 0.045);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.025);
}

.metric-heading {
  justify-content: space-between;
  gap: 6px;
}

.metric-heading span {
  overflow: hidden;
  color: #64748b;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-heading strong {
  color: #e2e8f0;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}

.progress-track {
  height: 4px;
  margin-top: 12px;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.055);
}

.progress-track i {
  height: 100%;
  display: block;
  border-radius: inherit;
  background: linear-gradient(90deg, #6366f1, #818cf8);
}

.progress-track.memory i {
  background: linear-gradient(90deg, #10b981, #34d399);
}

.progress-track i.warning,
.progress-track.memory i.warning {
  background: linear-gradient(90deg, #f59e0b, #fbbf24);
}

.progress-track i.danger,
.progress-track.memory i.danger {
  background: linear-gradient(90deg, #ef4444, #fb7185);
}

.latency-metric {
  position: relative;
  overflow: hidden;
}

.latency-mark {
  margin-top: 9px;
  color: rgba(245, 158, 11, 0.62);
  font-size: 17px;
}

.detail-row {
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 14px;
  color: #64748b;
  font-size: 11px;
}

.detail-row > span {
  min-width: 0;
}

.detail-row strong {
  margin-left: 3px;
  color: #94a3b8;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.node-footer {
  justify-content: space-between;
  gap: 10px;
  margin-top: 15px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.055);
}

.heartbeat {
  min-width: 0;
  gap: 5px;
  color: #64748b;
  font-size: 11px;
}

.heartbeat strong {
  color: #94a3b8;
  font-weight: 600;
}

.node-actions {
  flex: 0 0 auto;
  gap: 5px;
}

.node-actions :deep(.icon-action) {
  width: 31px;
  height: 31px;
  padding: 0;
  color: #64748b;
  border-color: rgba(255, 255, 255, 0.065);
  border-radius: 8px;
  background: transparent;
}

.node-actions :deep(.icon-action:hover),
.node-actions :deep(.icon-action.active) {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.32);
  background: rgba(99, 102, 241, 0.12);
}

.node-actions :deep(.probe:hover) {
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.28);
  background: rgba(245, 158, 11, 0.1);
}

.node-actions :deep(.delete:hover) {
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.1);
}

.node-actions :deep(.ant-btn[disabled]) {
  color: #475569;
  border-color: rgba(255, 255, 255, 0.04);
  background: transparent;
}

.history-panel {
  position: relative;
  z-index: 1;
  padding: 15px 19px 19px;
  border-top: 1px solid rgba(255, 255, 255, 0.055);
  background: rgba(0, 0, 0, 0.18);
}

.add-card {
  min-height: 312px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.09);
  color: #64748b;
  background: rgba(15, 17, 23, 0.25);
  cursor: pointer;
  font-family: inherit;
}

.add-card::before {
  display: none;
}

.add-card:hover {
  color: #a5b4fc;
  border-color: rgba(99, 102, 241, 0.34);
  background: rgba(99, 102, 241, 0.08);
}

.add-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  border: 1px dashed rgba(255, 255, 255, 0.17);
  border-radius: 14px;
  font-size: 20px;
}

.add-card:hover .add-icon {
  border-color: rgba(99, 102, 241, 0.42);
}

.add-card strong {
  color: #94a3b8;
  font-size: 13.5px;
}

.add-card:hover strong {
  color: #c4b5fd;
}

.add-card > span:last-child {
  max-width: 230px;
  font-size: 11px;
  line-height: 1.5;
}

@media (max-width: 768px) {
  .node-toolbar,
  .search-group,
  .search-group :deep(.ant-input-affix-wrapper) {
    width: 100%;
  }

  .result-count {
    align-self: flex-end;
  }

  .node-grid {
    grid-template-columns: 1fr;
  }

  .node-card-main {
    padding: 15px 13px;
  }

  .resource-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .latency-metric {
    grid-column: 1 / -1;
  }

  .node-footer {
    align-items: flex-start;
    flex-direction: column;
  }

  .node-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .history-panel {
    padding: 14px 13px 15px;
  }
}

@media (max-width: 420px) {
  .node-top {
    flex-wrap: wrap;
  }

  .status-badge {
    margin-left: 54px;
  }

  .node-remark {
    margin-left: 0;
  }

  .resource-grid {
    grid-template-columns: 1fr;
  }

  .latency-metric {
    grid-column: auto;
  }
}
</style>
