<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  EditOutlined,
  DeleteOutlined,
  PlusOutlined,
  ThunderboltOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
  LinkOutlined,
  ClockCircleOutlined,
  DashboardOutlined,
} from '@ant-design/icons-vue';
import NodeHistoryPanel from './NodeHistoryPanel.vue';

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  isMobile: { type: Boolean, default: false },
});

const emit = defineEmits(['add', 'edit', 'delete', 'probe', 'toggle-enable']);
const { t } = useI18n();
const expandedIds = ref(new Set());

const dataSource = computed(() => props.nodes.map((node) => ({
  ...node,
  url: `${node.scheme}://${node.address}:${node.port}${node.basePath || '/'}`,
})));

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
</script>

<template>
  <section class="node-list-shell">
    <div class="panel-toolbar">
      <div>
        <strong class="toolbar-title">{{ t('menu.nodes') }}</strong>
        <span class="toolbar-subtitle">{{ dataSource.length }} {{ t('pages.nodes.totalNodes') }}</span>
      </div>
      <a-button type="primary" @click="emit('add')">
        <template #icon><PlusOutlined /></template>
        {{ t('pages.nodes.addNode') }}
      </a-button>
    </div>

    <a-spin :spinning="loading">
      <div class="node-grid">
        <a-empty v-if="dataSource.length === 0" :description="t('noData')" />
        <article v-for="node in dataSource" :key="node.id" class="node-card"
          :class="`status-${node.status || 'unknown'}`">
          <div class="status-rail" />
          <div class="node-card-content">
            <header>
              <button type="button" class="expand-button" :aria-expanded="isExpanded(node.id)"
                @click="toggleExpanded(node.id)">
                <RightOutlined :class="{ expanded: isExpanded(node.id) }" />
              </button>
              <div class="node-identity">
                <div class="node-title">
                  <h2>{{ node.name }}</h2>
                  <span class="status-badge" :class="`status-${node.status || 'unknown'}`">
                    {{ t(`pages.nodes.statusValues.${node.status || 'unknown'}`) }}
                  </span>
                  <a-tooltip v-if="node.lastError" :title="node.lastError">
                    <ExclamationCircleOutlined class="warning-icon" />
                  </a-tooltip>
                </div>
                <a :href="node.url" target="_blank" rel="noopener noreferrer" class="node-url">
                  <LinkOutlined /> {{ node.url }}
                </a>
                <p v-if="node.remark">{{ node.remark }}</p>
              </div>
              <div class="node-actions">
                <a-tooltip :title="t('pages.nodes.probe')">
                  <a-button @click="emit('probe', node)"><template #icon><ThunderboltOutlined /></template></a-button>
                </a-tooltip>
                <a-tooltip :title="t('edit')">
                  <a-button @click="emit('edit', node)"><template #icon><EditOutlined /></template></a-button>
                </a-tooltip>
                <a-switch :checked="node.enable" size="small" @change="(value) => emit('toggle-enable', node, value)" />
                <a-tooltip :title="t('delete')">
                  <a-button danger @click="emit('delete', node)"><template #icon><DeleteOutlined /></template></a-button>
                </a-tooltip>
              </div>
            </header>

            <div class="node-metrics">
              <div><DashboardOutlined /><span>CPU</span><strong>{{ formatPct(node.cpuPct) }}</strong></div>
              <div><DashboardOutlined /><span>{{ t('pages.nodes.mem') }}</span><strong>{{ formatPct(node.memPct) }}</strong></div>
              <div><ThunderboltOutlined /><span>{{ t('pages.nodes.latency') }}</span><strong>{{ node.latencyMs > 0 ? `${node.latencyMs} ms` : '-' }}</strong></div>
              <div><ClockCircleOutlined /><span>{{ t('pages.nodes.uptime') }}</span><strong>{{ formatUptime(node.uptimeSecs) }}</strong></div>
              <div><ClockCircleOutlined /><span>{{ t('pages.nodes.lastHeartbeat') }}</span><strong>{{ relativeTime(node.lastHeartbeat) }}</strong></div>
              <div><span>Xray</span><strong>{{ node.xrayVersion || '-' }}</strong></div>
            </div>

            <div v-if="isExpanded(node.id)" class="history-panel">
              <NodeHistoryPanel :node="node" />
            </div>
          </div>
        </article>
      </div>
    </a-spin>
  </section>
</template>

<style scoped>
.node-list-shell,
.node-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar-title,
.toolbar-subtitle {
  display: block;
}

.toolbar-title {
  color: var(--xui-text-strong);
  font-size: 14px;
}

.toolbar-subtitle {
  margin-top: 2px;
  color: var(--xui-text-muted);
  font-size: 11px;
}

.node-card {
  overflow: hidden;
  display: flex;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.09);
}

.status-rail {
  width: 4px;
  flex: 0 0 4px;
  background: #738196;
}

.node-card.status-online .status-rail { background: var(--xui-success); }
.node-card.status-offline .status-rail { background: var(--xui-danger); }

.node-card-content {
  min-width: 0;
  flex: 1;
  padding: 18px 20px;
}

.node-card header {
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
  border: 1px solid var(--xui-border);
  border-radius: 6px;
  color: var(--xui-text-muted);
  background: var(--xui-surface-2);
  cursor: pointer;
}

.expand-button span { transition: transform 150ms ease; }
.expand-button span.expanded { transform: rotate(90deg); }

.node-identity {
  min-width: 0;
  flex: 1;
}

.node-title,
.node-actions,
.node-url {
  display: flex;
  align-items: center;
}

.node-title {
  flex-wrap: wrap;
  gap: 7px;
}

.node-title h2 {
  margin: 0;
  color: var(--xui-text-strong);
  font-size: 16px;
}

.status-badge {
  padding: 2px 8px;
  border: 1px solid var(--xui-border);
  border-radius: 5px;
  color: var(--xui-text-muted);
  background: var(--xui-surface-2);
  font-size: 11px;
}

.status-badge.status-online { color: #63e6be; border-color: rgba(16, 185, 129, 0.34); background: rgba(16, 185, 129, 0.1); }
.status-badge.status-offline { color: #ff8a8a; border-color: rgba(239, 68, 68, 0.34); background: rgba(239, 68, 68, 0.1); }
.warning-icon { color: var(--xui-warning); }

.node-url {
  max-width: 100%;
  gap: 6px;
  margin-top: 8px;
  overflow: hidden;
  color: #78b5ff;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-identity p {
  margin: 7px 0 0;
  color: var(--xui-text-muted);
  font-size: 12px;
}

.node-actions {
  flex: 0 0 auto;
  gap: 6px;
}

.node-actions :deep(.ant-btn) {
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--xui-text-muted);
  border-color: var(--xui-border);
  background: var(--xui-surface-2);
}

.node-actions :deep(.ant-btn:hover) { color: #fff; background: var(--xui-primary); }
.node-actions :deep(.ant-btn-dangerous:hover) { background: var(--xui-danger); }

.node-metrics {
  display: grid;
  grid-template-columns: repeat(6, minmax(100px, 1fr));
  gap: 8px;
  margin: 16px 0 0 40px;
}

.node-metrics > div {
  min-width: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 2px 6px;
  padding: 10px;
  border: 1px solid var(--xui-border);
  border-radius: 6px;
  background: var(--xui-surface-2);
}

.node-metrics span {
  overflow: hidden;
  color: var(--xui-text-muted);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-metrics strong {
  grid-column: 1 / -1;
  color: var(--xui-text-strong);
  font-size: 13px;
}

.history-panel {
  margin: 16px 0 0 40px;
  padding-top: 16px;
  border-top: 1px solid var(--xui-border);
}

@media (max-width: 1100px) {
  .node-metrics { grid-template-columns: repeat(3, minmax(100px, 1fr)); }
}

@media (max-width: 768px) {
  .node-card-content { padding: 14px 12px; }
  .node-card header { flex-wrap: wrap; }
  .node-actions { width: 100%; padding-left: 40px; }
  .node-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); margin-left: 0; }
  .history-panel { margin-left: 0; }
}
</style>
