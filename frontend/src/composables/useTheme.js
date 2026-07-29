import { reactive, computed, watchEffect } from 'vue';
import { theme as antdTheme } from 'ant-design-vue';
import '@/styles/panel.css';

// Single shared theme state. `import { theme } from '@/composables/useTheme.js'`
// from any component to read/toggle. Boot side-effects (apply current
// theme to <body>/<html>) run once at module load so the page is in the
// right theme before Vue mounts.

const STORAGE_DARK = 'dark-mode';
const STORAGE_ULTRA = 'isUltraDarkThemeEnabled';

function readBool(key, fallback) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true';
}

const isDark = readBool(STORAGE_DARK, true);
const isUltra = readBool(STORAGE_ULTRA, false);

export const theme = reactive({
  isDark,
  isUltra,
});

export const currentTheme = computed(() => (theme.isDark ? 'dark' : 'light'));

// AD-Vue 4 theme config consumed by every page's <a-config-provider>.
// Three modes — light / dark / ultra-dark — all share AD-Vue's vanilla
// blue primary. Dark uses a navy palette across page/cards/modals so
// the sidebar blends with the rest of the surface; ultra-dark stays
// neutral black on top of darkAlgorithm.
const DARK_TOKENS = {
  colorPrimary: '#3b82f6',
  colorBgBase: '#0c1118',
  colorBgLayout: '#0c1118',
  colorBgContainer: '#182334',
  colorBgElevated: '#182334',
  colorBorder: '#2a3a51',
  colorBorderSecondary: '#25354a',
  colorText: '#c2cee0',
  colorTextHeading: '#f1f5fb',
  borderRadius: 6,
};
const ULTRA_DARK_TOKENS = {
  colorPrimary: '#3b82f6',
  colorBgBase: '#080b10',
  colorBgLayout: '#080b10',
  colorBgContainer: '#121923',
  colorBgElevated: '#121923',
  colorBorder: '#252f3d',
  colorBorderSecondary: '#202a38',
  colorText: '#c2cee0',
  colorTextHeading: '#f1f5fb',
  borderRadius: 6,
};

// AD-Vue 4 hardcodes navy `#001529` / `#002140` as the Layout sider
// + trigger backgrounds and `#001529` / `#000c17` as the dark Menu item
// backgrounds (see node_modules/ant-design-vue/es/{layout,menu}/style/
// index.js). Override at the component-token level so the sider blends
// with darkAlgorithm's neutral surfaces.
// Dark theme uses a refined navy for the sidebar — distinct from the
// neutral ultra-dark and warmer than AD-Vue's stock #001529.
const DARK_LAYOUT_TOKENS = {
  colorBgHeader: '#182334',
  colorBgTrigger: '#202d40',
  colorBgBody: '#0c1118',
};
const ULTRA_DARK_LAYOUT_TOKENS = {
  colorBgHeader: '#0a0a0a',
  colorBgTrigger: '#141414',
  colorBgBody: '#000',
};
const DARK_MENU_TOKENS = {
  colorItemBg: '#182334',
  colorSubItemBg: '#131c29',
  menuSubMenuBg: '#182334',
  itemSelectedBg: 'rgba(59, 130, 246, 0.14)',
  itemSelectedColor: '#69a2ff',
};
const ULTRA_DARK_MENU_TOKENS = {
  colorItemBg: '#0a0a0a',
  colorSubItemBg: '#000',
  menuSubMenuBg: '#0a0a0a',
};

export const antdThemeConfig = computed(() => {
  if (!theme.isDark) {
    return { algorithm: antdTheme.defaultAlgorithm };
  }
  return {
    algorithm: antdTheme.darkAlgorithm,
    token: theme.isUltra ? ULTRA_DARK_TOKENS : DARK_TOKENS,
    components: {
      Layout: theme.isUltra ? ULTRA_DARK_LAYOUT_TOKENS : DARK_LAYOUT_TOKENS,
      Menu: theme.isUltra ? ULTRA_DARK_MENU_TOKENS : DARK_MENU_TOKENS,
    },
  };
});

export function toggleTheme() {
  theme.isDark = !theme.isDark;
}

export function toggleUltra() {
  theme.isUltra = !theme.isUltra;
}

// Briefly disable theme transition animations while a toggle is in
// flight, then re-enable on mouseleave. Mirrors the legacy panel's
// behavior of preventing flicker when hovering the theme menu.
export function pauseAnimationsUntilLeave(elementId) {
  document.documentElement.setAttribute('data-theme-animations', 'off');
  const el = document.getElementById(elementId);
  if (!el) return;
  const restore = () => {
    document.documentElement.removeAttribute('data-theme-animations');
    el.removeEventListener('mouseleave', restore);
    el.removeEventListener('touchend', restore);
  };
  el.addEventListener('mouseleave', restore);
  el.addEventListener('touchend', restore);
}

// Apply theme to DOM and persist whenever it changes.
watchEffect(() => {
  document.body.setAttribute('class', theme.isDark ? 'dark' : 'light');
  localStorage.setItem(STORAGE_DARK, String(theme.isDark));

  if (theme.isUltra) {
    document.documentElement.setAttribute('data-theme', 'ultra-dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem(STORAGE_ULTRA, String(theme.isUltra));

  // Keep the global #message container's class in sync so AD-Vue toasts
  // pick up the right styling.
  const msg = document.getElementById('message');
  if (msg) msg.className = theme.isDark ? 'dark' : 'light';
});
