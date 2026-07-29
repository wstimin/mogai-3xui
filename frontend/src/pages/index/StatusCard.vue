<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  DashboardOutlined,
  DatabaseOutlined,
  HddOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';

import { CPUFormatter, SizeFormatter } from '@/utils';

const { t } = useI18n();

const props = defineProps({
  status: { type: Object, required: true },
  isMobile: { type: Boolean, default: false },
});

const gaugeSize = computed(() => (props.isMobile ? 54 : 62));
const trailColor = 'rgba(128, 128, 128, 0.25)';

const resourceItems = computed(() => [
  {
    key: 'cpu',
    title: t('pages.index.cpu'),
    icon: DashboardOutlined,
    metric: props.status.cpu,
    detail: CPUFormatter.cpuCoreFormat(props.status.cpuCores),
    tooltip: `${t('pages.index.logicalProcessors')}: ${props.status.logicalPro} | ${t('pages.index.frequency')}: ${CPUFormatter.cpuSpeedFormat(props.status.cpuSpeedMhz)}`,
    tone: 'blue',
  },
  {
    key: 'memory',
    title: t('pages.index.memory'),
    icon: DatabaseOutlined,
    metric: props.status.mem,
    detail: `${SizeFormatter.sizeFormat(props.status.mem.current)} / ${SizeFormatter.sizeFormat(props.status.mem.total)}`,
    tone: 'cyan',
  },
  {
    key: 'swap',
    title: t('pages.index.swap'),
    icon: ThunderboltOutlined,
    metric: props.status.swap,
    detail: `${SizeFormatter.sizeFormat(props.status.swap.current)} / ${SizeFormatter.sizeFormat(props.status.swap.total)}`,
    tone: 'amber',
  },
  {
    key: 'disk',
    title: t('pages.index.storage'),
    icon: HddOutlined,
    metric: props.status.disk,
    detail: `${SizeFormatter.sizeFormat(props.status.disk.current)} / ${SizeFormatter.sizeFormat(props.status.disk.total)}`,
    tone: 'green',
  },
]);
</script>

<template>
  <div class="resource-grid">
    <template v-for="item in resourceItems" :key="item.key">
      <a-tooltip v-if="item.tooltip" :title="item.tooltip">
        <a-card class="resource-card" hoverable>
          <div class="resource-card__body">
            <div class="resource-icon" :class="`tone-${item.tone}`">
              <component :is="item.icon" />
            </div>
            <div class="resource-copy">
              <span>{{ item.title }}</span>
              <strong>{{ item.detail }}</strong>
            </div>
            <a-progress type="dashboard" status="normal" :stroke-color="item.metric.color"
              :trail-color="trailColor" :percent="item.metric.percent" :width="gaugeSize" />
          </div>
        </a-card>
      </a-tooltip>
      <a-card v-else class="resource-card" hoverable>
        <div class="resource-card__body">
          <div class="resource-icon" :class="`tone-${item.tone}`">
            <component :is="item.icon" />
          </div>
          <div class="resource-copy">
            <span>{{ item.title }}</span>
            <strong>{{ item.detail }}</strong>
          </div>
          <a-progress type="dashboard" status="normal" :stroke-color="item.metric.color"
            :trail-color="trailColor" :percent="item.metric.percent" :width="gaugeSize" />
        </div>
      </a-card>
    </template>
  </div>
</template>

<style scoped>
.resource-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.resource-card__body {
  min-height: 76px;
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.resource-icon {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 7px;
  font-size: 20px;
}

.tone-blue { color: #6ea8ff; border-color: rgba(59, 130, 246, 0.28); background: rgba(59, 130, 246, 0.12); }
.tone-cyan { color: #67e8f9; border-color: rgba(6, 182, 212, 0.28); background: rgba(6, 182, 212, 0.11); }
.tone-amber { color: #fbbf24; border-color: rgba(245, 158, 11, 0.28); background: rgba(245, 158, 11, 0.11); }
.tone-green { color: #5ee0b5; border-color: rgba(16, 185, 129, 0.28); background: rgba(16, 185, 129, 0.11); }

.resource-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.resource-copy span {
  color: var(--xui-text-muted);
  font-size: 12px;
}

.resource-copy strong {
  overflow: hidden;
  color: var(--xui-text-strong);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.ant-progress-text) {
  color: var(--xui-text-strong) !important;
  font-size: 12px !important;
  font-weight: 650;
}

:deep(.ant-card-body) {
  padding: 15px 16px;
}

@media (max-width: 1200px) {
  .resource-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 576px) {
  .resource-grid {
    grid-template-columns: 1fr;
  }
}
</style>
