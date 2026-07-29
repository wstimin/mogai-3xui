<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  BarsOutlined,
  PoweroffOutlined,
  ReloadOutlined,
  ToolOutlined,
} from '@ant-design/icons-vue';

const { t } = useI18n();

const props = defineProps({
  status: { type: Object, required: true },
  isMobile: { type: Boolean, default: false },
  ipLimitEnable: { type: Boolean, default: false },
  controlLoading: { type: String, default: '' },
});

defineEmits(['stop-xray', 'restart-xray', 'open-logs', 'open-xray-logs', 'open-version-switch']);

const XRAY_STATE_KEYS = {
  running: 'pages.index.xrayStatusRunning',
  stop: 'pages.index.xrayStatusStop',
  error: 'pages.index.xrayStatusError',
};

const stateText = computed(() => (
  t(XRAY_STATE_KEYS[props.status.xray.state] ?? 'pages.index.xrayStatusUnknown')
));

function badgeAnimationClass(color) {
  if (color === 'green') return 'xray-running-animation';
  if (color === 'orange') return 'xray-stop-animation';
  if (color === 'red') return 'xray-error-animation';
  return 'xray-processing-animation';
}
</script>

<template>
  <a-card class="xray-card" hoverable>
    <template #title>
      <a-space direction="horizontal">
        <span>{{ t('pages.index.xrayStatus') }}</span>
        <a-tag v-if="isMobile && status.xray.version && status.xray.version !== 'Unknown'" color="green">
          v{{ status.xray.version }}
        </a-tag>
      </a-space>
    </template>

    <template #extra>
      <template v-if="status.xray.state !== 'error'">
        <a-badge status="processing" :class="['xray-processing-animation', badgeAnimationClass(status.xray.color)]"
          :text="stateText" :color="status.xray.color" />
      </template>
      <a-popover v-else>
        <template #title>
          <a-row type="flex" align="middle" justify="space-between">
            <a-col><span>{{ t('pages.index.xrayStatusError') }}</span></a-col>
            <a-col><BarsOutlined class="cursor-pointer" @click="$emit('open-logs')" /></a-col>
          </a-row>
        </template>
        <template #content>
          <span v-for="(line, i) in (status.xray.errorMsg || '').split('\n')" :key="i" class="error-line">
            {{ line }}
          </span>
        </template>
        <a-badge status="processing" :text="stateText" :color="status.xray.color"
          :class="['xray-processing-animation', 'xray-error-animation']" />
      </a-popover>
    </template>

    <div class="xray-summary">
      <div class="xray-state" :class="`state-${status.xray.state}`">
        <span class="state-dot" />
        <div>
          <span>{{ t('pages.index.xrayStatus') }}</span>
          <strong>{{ stateText }}</strong>
        </div>
      </div>
      <div class="xray-version">
        <span>{{ t('pages.index.xraySwitch') }}</span>
        <strong>{{ status.xray.version && status.xray.version !== 'Unknown' ? `v${status.xray.version}` : '-' }}</strong>
      </div>
    </div>

    <div class="xray-actions">
      <a-tooltip v-if="ipLimitEnable" :title="t('pages.index.logs')">
        <a-button @click="$emit('open-xray-logs')">
          <template #icon><BarsOutlined /></template>
          <span v-if="!isMobile">{{ t('pages.index.logs') }}</span>
        </a-button>
      </a-tooltip>
      <a-button danger :loading="controlLoading === 'stop'" :disabled="!!controlLoading && controlLoading !== 'stop'"
        @click="$emit('stop-xray')">
        <template #icon><PoweroffOutlined /></template>
        {{ t('pages.index.stopXray') }}
      </a-button>
      <a-button type="primary" :loading="controlLoading === 'restart'"
        :disabled="!!controlLoading && controlLoading !== 'restart'" @click="$emit('restart-xray')">
        <template #icon><ReloadOutlined /></template>
        {{ t('pages.index.restartXray') }}
      </a-button>
      <a-button @click="$emit('open-version-switch')">
        <template #icon><ToolOutlined /></template>
        <span v-if="!isMobile">{{ t('pages.index.xraySwitch') }}</span>
      </a-button>
    </div>
  </a-card>
</template>

<style scoped>
.xray-card {
  height: 100%;
}

.xray-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 0.6fr);
  gap: 12px;
}

.xray-state,
.xray-version {
  min-width: 0;
  min-height: 74px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--xui-border);
  border-radius: 7px;
  background: var(--xui-surface-2);
}

.state-dot {
  width: 11px;
  height: 11px;
  flex: 0 0 11px;
  border-radius: 50%;
  background: var(--xui-text-faint);
  box-shadow: 0 0 0 5px rgba(101, 121, 145, 0.12);
}

.state-running .state-dot { background: var(--xui-success); box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.12); }
.state-stop .state-dot { background: var(--xui-warning); box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.12); }
.state-error .state-dot { background: var(--xui-danger); box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.12); }

.xray-state div,
.xray-version {
  min-width: 0;
}

.xray-state span:not(.state-dot),
.xray-version span {
  display: block;
  margin-bottom: 4px;
  color: var(--xui-text-muted);
  font-size: 12px;
}

.xray-state strong,
.xray-version strong {
  display: block;
  overflow: hidden;
  color: var(--xui-text-strong);
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xray-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--xui-border);
}

.error-line {
  display: block;
  max-width: 400px;
  white-space: pre-wrap;
}

.cursor-pointer {
  cursor: pointer;
}

@media (max-width: 576px) {
  .xray-summary {
    grid-template-columns: 1fr;
  }

  .xray-actions :deep(.ant-btn) {
    flex: 1;
  }
}
</style>

<style>
.xray-processing-animation .ant-badge-status-dot {
  animation: xray-pulse 1.2s linear infinite;
}

.xray-running-animation .ant-badge-status-processing::after { border-color: #1677ff; }
.xray-stop-animation .ant-badge-status-processing::after { border-color: #fa8c16; }
.xray-error-animation .ant-badge-status-processing::after { border-color: #f5222d; }

@keyframes xray-pulse {
  0%, 50%, 100% { transform: scale(1); opacity: 1; }
  10% { transform: scale(1.5); opacity: 0.2; }
}
</style>
