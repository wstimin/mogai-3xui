<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { HttpUtil, SizeFormatter } from '@/utils';
import Sparkline from '@/components/Sparkline.vue';
import { useMediaQuery } from '@/composables/useMediaQuery.js';

const { t } = useI18n();
const { isMobile } = useMediaQuery();
const modalWidth = computed(() => (isMobile.value ? '95vw' : '900px'));

const props = defineProps({
  open: { type: Boolean, default: false },
  status: { type: Object, required: true },
});

const emit = defineEmits(['update:open']);

// One tab per system metric. The order here drives the tab order in
// the UI; everything else (axis label, tooltip unit, fetch URL) is
// looked up from the active key. Adding another metric is one row.
const metrics = [
  { key: 'cpu', tab: 'CPU', valueMax: 100, unit: '%', stroke: '' },
  { key: 'mem', tab: 'RAM', valueMax: 100, unit: '%', stroke: '#7c4dff' },
  { key: 'netUp', tab: 'Net Up', valueMax: null, unit: 'B/s', stroke: '#1890ff' },
  { key: 'netDown', tab: 'Net Down', valueMax: null, unit: 'B/s', stroke: '#13c2c2' },
  { key: 'online', tab: 'Online', valueMax: null, unit: '', stroke: '#52c41a' },
  { key: 'load1', tab: 'Load 1m', valueMax: null, unit: '', stroke: '#fa8c16' },
  { key: 'load5', tab: 'Load 5m', valueMax: null, unit: '', stroke: '#f5222d' },
  { key: 'load15', tab: 'Load 15m', valueMax: null, unit: '', stroke: '#a0d911' },
];

const activeKey = ref('cpu');
const bucket = ref(2);
const points = ref([]);
const labels = ref([]);

const activeMetric = computed(() => metrics.find((m) => m.key === activeKey.value));

// CPU keeps using the status-card color so the modal visually echoes
// the dot in StatusCard. Non-CPU tabs each get their own constant color.
const strokeColor = computed(() => {
  const m = activeMetric.value;
  if (m?.stroke) return m.stroke;
  return props.status?.cpu?.color || '#008771';
});

function unitFormatter(unit) {
  if (unit === 'B/s') {
    return (v) => `${SizeFormatter.sizeFormat(Math.max(0, Number(v) || 0))}/s`;
  }
  if (unit === '%') {
    return (v) => `${Number(v).toFixed(1)}%`;
  }
  // Plain numbers: load averages get two decimals, online client count
  // is integer. Heuristic on the unit-less metric key is good enough.
  return (v) => {
    const n = Number(v) || 0;
    if (activeKey.value === 'online') return String(Math.round(n));
    return n.toFixed(2);
  };
}

const yFormatter = computed(() => unitFormatter(activeMetric.value?.unit ?? ''));

async function fetchBucket() {
  const m = activeMetric.value;
  if (!m) return;
  try {
    const url = `/panel/api/server/history/${m.key}/${bucket.value}`;
    const msg = await HttpUtil.get(url);
    if (msg?.success && Array.isArray(msg.obj)) {
      const vals = [];
      const labs = [];
      for (const p of msg.obj) {
        const d = new Date(p.t * 1000);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        labs.push(bucket.value >= 60 ? `${hh}:${mm}` : `${hh}:${mm}:${ss}`);
        vals.push(Number(p.v) || 0);
      }
      labels.value = labs;
      points.value = vals;
    } else {
      labels.value = [];
      points.value = [];
    }
  } catch (e) {
    console.error('Failed to fetch history bucket', e);
    labels.value = [];
    points.value = [];
  }
}

function close() {
  emit('update:open', false);
}

watch(() => props.open, (next) => {
  if (next) {
    activeKey.value = 'cpu';
    fetchBucket();
  }
});
watch([activeKey, bucket], () => {
  if (props.open) fetchBucket();
});
</script>

<template>
  <a-modal :open="open" :closable="true" :footer="null" :width="modalWidth"
    wrap-class-name="system-history-modal" @cancel="close">
    <template #title>
      <div class="history-title">
        <span>{{ t('pages.index.systemHistoryTitle') }}</span>
        <a-select v-model:value="bucket" size="small" class="bucket-select">
          <a-select-option :value="2">2m</a-select-option>
          <a-select-option :value="30">30m</a-select-option>
          <a-select-option :value="60">1h</a-select-option>
          <a-select-option :value="120">2h</a-select-option>
          <a-select-option :value="180">3h</a-select-option>
          <a-select-option :value="300">5h</a-select-option>
        </a-select>
      </div>
    </template>

    <div class="history-modal-body">
      <a-tabs v-model:active-key="activeKey" size="small" class="history-tabs">
        <a-tab-pane v-for="m in metrics" :key="m.key" :tab="m.tab" />
      </a-tabs>

      <div class="cpu-chart-wrap">
        <div class="cpu-chart-meta">
          Timeframe: {{ bucket }} sec per point (total {{ points.length }} points)
        </div>
        <Sparkline :data="points" :labels="labels" :vb-width="840" :height="220"
          :stroke="strokeColor" :stroke-width="2.2"
          :show-grid="true" :show-axes="true" :tick-count-x="5"
          :max-points="points.length || 1"
          :fill-opacity="0.18" :marker-radius="3.2" :show-tooltip="true"
          :value-min="0" :value-max="activeMetric?.valueMax ?? null"
          :y-formatter="yFormatter" />
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.history-title {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.history-title > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bucket-select {
  width: 80px;
  flex: 0 0 80px;
}

.history-tabs {
  margin-bottom: 14px;
}

.history-tabs :deep(.ant-tabs-nav) {
  margin: 0;
}

.history-tabs :deep(.ant-tabs-nav-wrap) {
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.history-tabs :deep(.ant-tabs-tab) {
  min-height: 38px;
  padding: 8px 3px;
  font-size: 12px;
}

.cpu-chart-wrap {
  min-height: 276px;
  padding: 14px 16px 16px;
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface-2);
}

.cpu-chart-meta {
  margin-bottom: 10px;
  color: var(--xui-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.cpu-chart-wrap :deep(.sparkline) {
  display: block;
  width: 100%;
}

:global(.system-history-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
}

:global(.system-history-modal .ant-modal-header) {
  margin: 0;
  padding: 16px 20px;
  border-bottom: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.system-history-modal .ant-modal-title) {
  padding-right: 28px;
  font-size: 15px;
  font-weight: 750;
}

:global(.system-history-modal .ant-modal-body) {
  max-height: min(78vh, 760px);
  padding: 16px 20px 20px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--xui-bg);
}

@media (max-width: 576px) {
  :global(.system-history-modal .ant-modal) {
    top: 12px;
    padding-bottom: 12px;
  }

  :global(.system-history-modal .ant-modal-header) {
    padding: 14px;
  }

  :global(.system-history-modal .ant-modal-body) {
    max-height: calc(100vh - 82px);
    padding: 12px;
  }

  .history-title {
    gap: 8px;
  }

  .bucket-select {
    width: 72px;
    flex-basis: 72px;
  }

  .cpu-chart-wrap {
    min-height: 250px;
    padding: 12px 10px;
  }
}
</style>
