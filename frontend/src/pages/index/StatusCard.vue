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

const resourceItems = computed(() => [
  {
    key: 'cpu',
    title: t('pages.index.cpu'),
    icon: DashboardOutlined,
    metric: props.status.cpu,
    detail: CPUFormatter.cpuCoreFormat(props.status.cpuCores),
    tooltip: `${t('pages.index.logicalProcessors')}: ${props.status.logicalPro} | ${t('pages.index.frequency')}: ${CPUFormatter.cpuSpeedFormat(props.status.cpuSpeedMhz)}`,
    tone: 'primary',
    glow: 'rgba(99, 102, 241, 0.15)',
    bar: 'linear-gradient(90deg, #6366f1, #818cf8)',
  },
  {
    key: 'memory',
    title: t('pages.index.memory'),
    icon: DatabaseOutlined,
    metric: props.status.mem,
    detail: `${SizeFormatter.sizeFormat(props.status.mem.current)} / ${SizeFormatter.sizeFormat(props.status.mem.total)}`,
    tone: 'success',
    glow: 'rgba(16, 185, 129, 0.12)',
    bar: 'linear-gradient(90deg, #10b981, #34d399)',
  },
  {
    key: 'swap',
    title: t('pages.index.swap'),
    icon: ThunderboltOutlined,
    metric: props.status.swap,
    detail: `${SizeFormatter.sizeFormat(props.status.swap.current)} / ${SizeFormatter.sizeFormat(props.status.swap.total)}`,
    tone: 'warning',
    glow: 'rgba(245, 158, 11, 0.11)',
    bar: 'linear-gradient(90deg, #f59e0b, #fbbf24)',
  },
  {
    key: 'disk',
    title: t('pages.index.storage'),
    icon: HddOutlined,
    metric: props.status.disk,
    detail: `${SizeFormatter.sizeFormat(props.status.disk.current)} / ${SizeFormatter.sizeFormat(props.status.disk.total)}`,
    tone: 'purple',
    glow: 'rgba(167, 139, 250, 0.12)',
    bar: 'linear-gradient(90deg, #8b5cf6, #c4b5fd)',
  },
]);
</script>

<template>
  <div class="resource-grid">
    <a-tooltip v-for="item in resourceItems" :key="item.key" :title="item.tooltip || ''">
      <a-card class="resource-card" hoverable :style="{ '--resource-glow': item.glow }">
        <div class="resource-card__header">
          <span class="resource-label">{{ item.title }}</span>
          <div class="resource-icon" :class="`tone-${item.tone}`">
            <component :is="item.icon" />
          </div>
        </div>
        <div class="resource-value">{{ item.metric.percent }}<small>%</small></div>
        <div class="resource-detail">{{ item.detail }}</div>
        <div class="resource-progress" aria-hidden="true">
          <span :style="{ width: `${Math.min(100, item.metric.percent)}%`, background: item.bar }" />
        </div>
      </a-card>
    </a-tooltip>
  </div>
</template>

<style scoped>
.resource-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 18px;
}

.resource-card {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  border-radius: 18px !important;
  background: rgba(18, 21, 28, 0.75) !important;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14) !important;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}

.resource-card::after {
  content: '';
  position: absolute;
  top: -26px;
  right: -24px;
  width: 130px;
  height: 130px;
  pointer-events: none;
  background: radial-gradient(circle, var(--resource-glow), transparent 70%);
}

.resource-card:hover {
  transform: translateY(-3px);
  border-color: rgba(255, 255, 255, 0.12) !important;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3) !important;
}

.resource-card__header {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 13px;
}

.resource-label {
  color: #64748b;
  font-size: 13px;
  font-weight: 500;
}

.resource-icon {
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 17px;
}

.tone-primary { color: #a5b4fc; border-color: rgba(99, 102, 241, 0.18); background: rgba(99, 102, 241, 0.14); }
.tone-success { color: #34d399; border-color: rgba(16, 185, 129, 0.18); background: rgba(16, 185, 129, 0.13); }
.tone-warning { color: #fbbf24; border-color: rgba(245, 158, 11, 0.18); background: rgba(245, 158, 11, 0.13); }
.tone-purple { color: #c4b5fd; border-color: rgba(167, 139, 250, 0.18); background: rgba(167, 139, 250, 0.13); }

.resource-value {
  position: relative;
  z-index: 1;
  color: #f1f5f9;
  font-size: 29px;
  font-weight: 700;
  line-height: 1.1;
}

.resource-value small {
  margin-left: 2px;
  color: #64748b;
  font-size: 15px;
  font-weight: 500;
}

.resource-detail {
  position: relative;
  z-index: 1;
  min-height: 18px;
  margin-top: 8px;
  overflow: hidden;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-progress {
  position: relative;
  z-index: 1;
  height: 4px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.06);
}

.resource-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  transition: width 0.7s ease;
}

:deep(.ant-card-body) {
  padding: 22px;
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

@media (prefers-reduced-motion: reduce) {
  .resource-card,
  .resource-progress span {
    transition: none;
  }
}
</style>
