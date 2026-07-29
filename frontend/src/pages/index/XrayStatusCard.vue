<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  ApiOutlined,
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
      <div class="xray-title">
        <span class="xray-title-icon"><ApiOutlined /></span>
        <div>
          <strong>{{ t('pages.index.xrayStatus') }}</strong>
          <span>Xray Core</span>
        </div>
      </div>
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
        <span class="version-icon"><ToolOutlined /></span>
        <div>
        <span>{{ t('pages.index.xraySwitch') }}</span>
        <strong>{{ status.xray.version && status.xray.version !== 'Unknown' ? `v${status.xray.version}` : '-' }}</strong>
        </div>
      </div>
    </div>

    <div class="xray-actions">
      <a-tooltip v-if="ipLimitEnable" :title="t('pages.index.logs')">
        <a-button class="xray-button" @click="$emit('open-xray-logs')">
          <template #icon><BarsOutlined /></template>
          <span v-if="!isMobile">{{ t('pages.index.logs') }}</span>
        </a-button>
      </a-tooltip>
      <a-button class="xray-button stop-button" danger :loading="controlLoading === 'stop'" :disabled="!!controlLoading && controlLoading !== 'stop'"
        @click="$emit('stop-xray')">
        <template #icon><PoweroffOutlined /></template>
        {{ t('pages.index.stopXray') }}
      </a-button>
      <a-button class="xray-button restart-button" type="primary" :loading="controlLoading === 'restart'"
        :disabled="!!controlLoading && controlLoading !== 'restart'" @click="$emit('restart-xray')">
        <template #icon><ReloadOutlined /></template>
        {{ t('pages.index.restartXray') }}
      </a-button>
      <a-button class="xray-button" @click="$emit('open-version-switch')">
        <template #icon><ToolOutlined /></template>
        <span v-if="!isMobile">{{ t('pages.index.xraySwitch') }}</span>
      </a-button>
    </div>
  </a-card>
</template>

<style scoped>
.xray-card {
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.06) !important;
  border-radius: 18px !important;
  background: rgba(18, 21, 28, 0.75) !important;
  backdrop-filter: blur(16px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14) !important;
  transition: transform 0.22s ease, border-color 0.22s ease, box-shadow 0.22s ease;
}

.xray-card:hover {
  transform: translateY(-3px);
  border-color: rgba(255, 255, 255, 0.12) !important;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3) !important;
}

:deep(.ant-card-head) {
  min-height: 66px;
  padding: 0 22px;
  border-bottom-color: rgba(255, 255, 255, 0.06) !important;
}

:deep(.ant-card-body) {
  padding: 22px;
}

.xray-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.xray-title-icon,
.version-icon {
  display: grid;
  place-items: center;
  border: 1px solid rgba(99, 102, 241, 0.18);
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.14);
}

.xray-title-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  font-size: 17px;
}

.xray-title > div {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.xray-title strong {
  color: #f1f5f9;
  font-size: 14px;
  font-weight: 650;
}

.xray-title span:not(.xray-title-icon) {
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
}

.xray-summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 0.6fr);
  gap: 14px;
}

.xray-state,
.xray-version {
  min-width: 0;
  min-height: 88px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.025);
  transition: border-color 0.18s ease, background 0.18s ease;
}

.xray-state:hover,
.xray-version:hover {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.035);
}

.state-dot {
  width: 11px;
  height: 11px;
  flex: 0 0 11px;
  border-radius: 50%;
  background: #64748b;
  box-shadow: 0 0 0 5px rgba(101, 121, 145, 0.12);
}

.state-running .state-dot { background: #10b981; box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.12), 0 0 16px rgba(16, 185, 129, 0.28); }
.state-stop .state-dot { background: #f59e0b; box-shadow: 0 0 0 5px rgba(245, 158, 11, 0.12); }
.state-error .state-dot { background: #ef4444; box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.12); }

.xray-state div,
.xray-version > div {
  min-width: 0;
}

.version-icon {
  width: 34px;
  height: 34px;
  flex: 0 0 34px;
  border-radius: 9px;
  color: #c4b5fd;
  border-color: rgba(167, 139, 250, 0.18);
  background: rgba(167, 139, 250, 0.12);
}

.xray-state span:not(.state-dot),
.xray-version span {
  display: block;
  margin-bottom: 4px;
  color: #64748b;
  font-size: 12px;
}

.xray-state strong,
.xray-version strong {
  display: block;
  overflow: hidden;
  color: #f1f5f9;
  font-size: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xray-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.xray-button {
  min-height: 36px;
  color: #94a3b8;
  border-color: rgba(255, 255, 255, 0.06);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.025);
}

.xray-button:hover,
.xray-button:focus {
  color: #f1f5f9 !important;
  border-color: rgba(255, 255, 255, 0.12) !important;
  background: rgba(255, 255, 255, 0.05) !important;
}

.xray-button.stop-button {
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.18);
  background: rgba(239, 68, 68, 0.07);
}

.xray-button.stop-button:hover,
.xray-button.stop-button:focus {
  color: #fca5a5 !important;
  border-color: rgba(239, 68, 68, 0.32) !important;
  background: rgba(239, 68, 68, 0.12) !important;
}

.xray-button.restart-button {
  color: #fff;
  border: 0;
  background: linear-gradient(135deg, #6366f1, #7c3aed) !important;
  box-shadow: 0 5px 16px rgba(99, 102, 241, 0.28);
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

@media (prefers-reduced-motion: reduce) {
  .xray-card,
  .xray-state,
  .xray-version {
    transition: none;
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
