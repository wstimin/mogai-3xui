<script setup>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  DashboardOutlined,
  UserOutlined,
  SettingOutlined,
  ToolOutlined,
  ClusterOutlined,
  LogoutOutlined,
  CloseOutlined,
  MenuOutlined,
} from '@ant-design/icons-vue';

import { currentTheme } from '@/composables/useTheme.js';
import ThemeSwitch from '@/components/ThemeSwitch.vue';

const { t, locale } = useI18n();
const panelVersion = (typeof window !== 'undefined' && window.__X_UI_CUR_VER__) || '2.9.5';
const isChinese = computed(() => locale.value === 'zh-CN');

const props = defineProps({
  basePath: { type: String, default: '' },
  requestUri: { type: String, default: '' },
});

const iconByName = {
  dashboard: DashboardOutlined,
  user: UserOutlined,
  setting: SettingOutlined,
  tool: ToolOutlined,
  cluster: ClusterOutlined,
  logout: LogoutOutlined,
};

const prefix = props.basePath?.startsWith('/') ? props.basePath : `/${props.basePath || ''}`;

const tabs = computed(() => [
  { key: `${prefix}panel/`, icon: 'dashboard', title: t('menu.dashboard') },
  { key: `${prefix}panel/inbounds`, icon: 'user', title: t('menu.inbounds') },
  { key: `${prefix}panel/nodes`, icon: 'cluster', title: t('menu.nodes') },
  { key: `${prefix}panel/settings`, icon: 'setting', title: t('menu.settings') },
  { key: `${prefix}panel/xray`, icon: 'tool', title: t('menu.xray') },
]);

const activeTab = computed(() => {
  const exact = tabs.value.find((tab) => tab.key === props.requestUri);
  if (exact) return [exact.key];
  const nested = [...tabs.value]
    .sort((a, b) => b.key.length - a.key.length)
    .find((tab) => tab.key !== `${prefix}panel/` && props.requestUri.startsWith(tab.key));
  return [nested?.key || `${prefix}panel/`];
});

const drawerOpen = ref(false);

function openLink(key) {
  drawerOpen.value = false;
  window.location.href = key;
}
</script>

<template>
  <aside class="panel-sidebar">
    <a-layout-sider :theme="currentTheme" :width="240" class="desktop-sider">
      <div class="brand-block">
        <div class="brand-mark">X</div>
        <div class="brand-copy">
          <strong>X Panel</strong>
          <span>X Panel v{{ panelVersion }}</span>
        </div>
      </div>

      <div class="nav-label">{{ isChinese ? 'X PANEL 控制台' : 'X PANEL CONTROL' }}</div>
      <a-menu :theme="currentTheme" mode="inline" :selected-keys="activeTab" @click="({ key }) => openLink(key)">
        <a-menu-item v-for="tab in tabs" :key="tab.key">
          <component :is="iconByName[tab.icon]" />
          <span>{{ tab.title }}</span>
        </a-menu-item>
      </a-menu>

      <div class="sidebar-bottom">
        <ThemeSwitch />
        <a-menu :theme="currentTheme" mode="inline" :selected-keys="[]" @click="openLink(`${prefix}logout`)">
          <a-menu-item :key="`${prefix}logout`">
            <LogoutOutlined />
            <span>{{ t('logout') }}</span>
          </a-menu-item>
        </a-menu>
      </div>
    </a-layout-sider>

    <button class="drawer-handle" type="button" :aria-label="isChinese ? '打开导航' : 'Open navigation'" @click="drawerOpen = true">
      <MenuOutlined />
    </button>

    <a-drawer placement="left" :closable="false" :open="drawerOpen" width="280" class="mobile-nav-drawer"
      @close="drawerOpen = false">
      <div class="drawer-header">
        <div class="brand-block">
          <div class="brand-mark">X</div>
          <div class="brand-copy">
            <strong>X Panel</strong>
            <span>X Panel v{{ panelVersion }}</span>
          </div>
        </div>
        <button type="button" class="drawer-close" @click="drawerOpen = false"><CloseOutlined /></button>
      </div>
      <a-menu :theme="currentTheme" mode="inline" :selected-keys="activeTab" @click="({ key }) => openLink(key)">
        <a-menu-item v-for="tab in tabs" :key="tab.key">
          <component :is="iconByName[tab.icon]" />
          <span>{{ tab.title }}</span>
        </a-menu-item>
        <a-menu-item :key="`${prefix}logout`">
          <LogoutOutlined />
          <span>{{ t('logout') }}</span>
        </a-menu-item>
      </a-menu>
    </a-drawer>
  </aside>
</template>

<style scoped>
.panel-sidebar {
  flex: 0 0 240px;
  min-width: 240px;
}

.desktop-sider {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 100;
  height: 100vh;
  border-right: 1px solid var(--xui-border);
}

.desktop-sider :deep(.ant-layout-sider-children) {
  display: flex;
  flex-direction: column;
}

.brand-block {
  height: 92px;
  padding: 0 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-bottom: 1px solid var(--xui-border);
}

.brand-mark {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  background: #2f73f6;
  box-shadow: 0 8px 20px rgba(47, 115, 246, 0.22);
}

.brand-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.brand-copy strong {
  color: var(--xui-text-strong);
  font-size: 17px;
  line-height: 1.3;
}

.brand-copy span {
  color: var(--xui-text-muted);
  font-size: 11px;
  margin-top: 3px;
}

.nav-label {
  padding: 25px 28px 8px;
  color: var(--xui-text-faint);
  font-size: 10px;
  font-weight: 700;
}

.desktop-sider :deep(.ant-menu) {
  border-inline-end: 0 !important;
  padding: 0 12px;
}

.desktop-sider :deep(.ant-menu-item) {
  height: 44px;
  line-height: 44px;
  margin: 3px 0;
  border-radius: 6px;
}

.desktop-sider :deep(.ant-menu-item-selected) {
  border: 1px solid rgba(59, 130, 246, 0.26);
}

.sidebar-bottom {
  margin-top: auto;
  padding: 10px 12px 16px;
  border-top: 1px solid var(--xui-border);
}

.sidebar-bottom :deep(.ant-menu) {
  padding: 0;
}

.drawer-handle {
  display: none;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.drawer-header .brand-block {
  flex: 1;
  padding: 0;
  border: 0;
}

.drawer-close {
  width: 36px;
  height: 36px;
  border: 1px solid var(--xui-border);
  border-radius: 6px;
  color: var(--xui-text);
  background: transparent;
}

@media (max-width: 768px) {
  .panel-sidebar {
    flex: 0 0 0;
    min-width: 0;
  }

  .desktop-sider {
    display: none;
  }

  .drawer-handle {
    position: fixed;
    top: 16px;
    left: 16px;
    z-index: 1000;
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    border: 1px solid var(--xui-border-strong);
    border-radius: 6px;
    color: var(--xui-text-strong);
    background: var(--xui-surface);
    box-shadow: var(--xui-shadow);
  }
}
</style>
