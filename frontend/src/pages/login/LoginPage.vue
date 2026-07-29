<script setup>
import { computed, defineAsyncComponent, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  UserOutlined,
  LockOutlined,
  KeyOutlined,
  SettingOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons-vue';

import { HttpUtil, LanguageManager } from '@/utils';
import {
  antdThemeConfig,
  currentTheme,
  theme as themeState,
} from '@/composables/useTheme.js';

const ThemeSwitchLogin = defineAsyncComponent(() => import('@/components/ThemeSwitchLogin.vue'));

const { t, locale } = useI18n();
const panelVersion = (typeof window !== 'undefined' && window.__X_UI_CUR_VER__) || '2.9.5';
const isChinese = computed(() => locale.value === 'zh-CN');
const loginCopy = computed(() => (isChinese.value
  ? {
    productLine: 'Xray 多协议管理面板',
    securityTitle: '安全、清晰地管理您的网络服务',
    securityDescription: '统一管理入站、订阅、流量和 Xray 配置，所有操作均通过现有面板服务完成。',
    subtitle: '登录后继续使用 X Panel',
    secureConnection: '安全连接',
    systemOnline: '服务正常',
    disclaimer: '仅供个人学习与研究使用，请勿用于非法用途',
  }
  : {
    productLine: 'Xray multi-protocol management panel',
    securityTitle: 'Manage your network services securely and clearly',
    securityDescription: 'Manage inbounds, subscriptions, traffic, and Xray settings through the existing panel service.',
    subtitle: 'Sign in to continue to X Panel',
    secureConnection: 'Secure connection',
    systemOnline: 'Service online',
    disclaimer: 'For personal learning and research only. Do not use for illegal purposes.',
  }));

const fetched = ref(false);
const submitting = ref(false);
const twoFactorEnable = ref(false);

const user = reactive({
  username: '',
  password: '',
  twoFactorCode: '',
});

const basePath = window.__X_UI_BASE_PATH__ || '';

onMounted(async () => {
  const msg = await HttpUtil.post('/getTwoFactorEnable');
  if (msg.success) {
    twoFactorEnable.value = !!msg.obj;
  }
  fetched.value = true;
});

async function login() {
  submitting.value = true;
  try {
    const msg = await HttpUtil.post('/login', user);
    if (msg.success) {
      window.location.href = basePath + 'panel/';
    }
  } finally {
    submitting.value = false;
  }
}

const lang = ref(LanguageManager.getLanguage());
function onLangChange(next) {
  LanguageManager.setLanguage(next);
}
</script>

<template>
  <a-config-provider :theme="antdThemeConfig">
    <a-layout class="login-app" :class="{ 'is-dark': themeState.isDark, 'is-ultra': themeState.isUltra }">
      <a-layout-content class="login-content">
        <div class="page-grid" aria-hidden="true" />

        <section class="login-brand-panel" aria-hidden="true">
          <div class="brand-lockup">
            <div class="brand-mark"><span>X</span></div>
            <div>
              <strong>X Panel</strong>
              <span>{{ loginCopy.productLine }}</span>
            </div>
          </div>

          <div class="brand-copy">
            <div class="security-icon"><SafetyCertificateOutlined /></div>
            <h1>{{ loginCopy.securityTitle }}</h1>
            <p>{{ loginCopy.securityDescription }}</p>
          </div>

          <div class="brand-status">
            <span class="status-dot" />
            <span>{{ loginCopy.systemOnline }}</span>
            <b>v{{ panelVersion }}</b>
          </div>
        </section>

        <section class="login-panel">
          <div class="login-toolbar">
            <a-popover :overlay-class-name="currentTheme" :title="t('menu.settings')" placement="bottomRight"
              trigger="click">
              <template #content>
                <a-space direction="vertical" :size="10" class="settings-popover">
                  <ThemeSwitchLogin />
                  <span>{{ t('pages.settings.language') }}</span>
                  <a-select v-model:value="lang" class="lang-select" @change="onLangChange">
                    <a-select-option v-for="l in LanguageManager.supportedLanguages" :key="l.value"
                      :value="l.value">
                      <span :aria-label="l.name">{{ l.icon }}</span>
                      &nbsp;&nbsp;<span>{{ l.name }}</span>
                    </a-select-option>
                  </a-select>
                </a-space>
              </template>
              <a-button class="settings-button" shape="circle" :aria-label="t('menu.settings')">
                <template #icon>
                  <SettingOutlined />
                </template>
              </a-button>
            </a-popover>
          </div>

          <div class="login-card">
            <div v-if="!fetched" class="login-loading">
              <a-spin size="large" />
            </div>

            <div v-else class="login-card-content">
              <div class="card-brand">
                <div class="brand-mark card-brand-mark"><span>X</span></div>
                <div>
                  <strong>X Panel</strong>
                  <span>{{ loginCopy.productLine }}</span>
                </div>
              </div>

              <header class="login-heading">
                <h2>{{ t('pages.login.title') }}</h2>
                <p>{{ loginCopy.subtitle }}</p>
              </header>

              <a-form class="login-form" layout="vertical" @submit.prevent="login">
                <a-form-item :label="t('username')">
                  <a-input v-model:value="user.username" autocomplete="username" name="username"
                    :placeholder="t('username')" autofocus required>
                    <template #prefix>
                      <UserOutlined />
                    </template>
                  </a-input>
                </a-form-item>

                <a-form-item :label="t('password')">
                  <a-input-password v-model:value="user.password" autocomplete="current-password" name="password"
                    :placeholder="t('password')" required>
                    <template #prefix>
                      <LockOutlined />
                    </template>
                  </a-input-password>
                </a-form-item>

                <a-form-item v-if="twoFactorEnable" :label="t('twoFactorCode')">
                  <a-input v-model:value="user.twoFactorCode" autocomplete="one-time-code" name="twoFactorCode"
                    :placeholder="t('twoFactorCode')" required>
                    <template #prefix>
                      <KeyOutlined />
                    </template>
                  </a-input>
                </a-form-item>

                <a-form-item class="submit-item">
                  <a-button class="login-submit" type="primary" html-type="submit" :loading="submitting" block>
                    {{ submitting ? '' : t('login') }}
                  </a-button>
                </a-form-item>
              </a-form>

              <div class="secure-divider"><span>{{ loginCopy.secureConnection }}</span></div>

              <footer class="login-footer">
                <div class="version-badge">
                  <span class="status-dot" />
                  X Panel v{{ panelVersion }}
                </div>
                <p>{{ loginCopy.disclaimer }}</p>
              </footer>
            </div>
          </div>
        </section>
      </a-layout-content>
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.login-app {
  --login-bg: #08090c;
  --login-card: rgba(16, 18, 24, 0.82);
  --login-border: rgba(255, 255, 255, 0.08);
  --login-border-hover: rgba(255, 255, 255, 0.14);
  --login-primary: #6366f1;
  --login-primary-bright: #818cf8;
  --login-secondary: #a78bfa;
  --login-text: #f1f5f9;
  --login-muted: #7c899c;
  --login-dim: #4b5568;

  min-height: 100vh;
  color: var(--login-text);
  background: var(--login-bg) !important;
}

.login-content {
  position: relative;
  display: grid;
  grid-template-columns: minmax(300px, 1fr) minmax(560px, 2fr);
  min-height: 100vh;
  overflow: hidden;
  background:
    radial-gradient(ellipse 62% 54% at 18% 28%, rgba(99, 102, 241, 0.2), transparent 58%),
    radial-gradient(ellipse 52% 46% at 82% 72%, rgba(139, 92, 246, 0.13), transparent 56%),
    radial-gradient(ellipse 34% 28% at 52% 100%, rgba(16, 185, 129, 0.05), transparent 64%),
    var(--login-bg) !important;
}

.page-grid {
  position: fixed;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  opacity: 0.72;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.018) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.018) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.82), rgba(0, 0, 0, 0.3));
}

.login-brand-panel,
.login-panel {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.login-brand-panel {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: clamp(34px, 4vw, 58px);
}

.brand-lockup,
.card-brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  position: relative;
  display: grid;
  place-items: center;
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 15px;
  color: #fff;
  background: linear-gradient(135deg, var(--login-primary), var(--login-secondary));
  box-shadow:
    0 10px 28px rgba(99, 102, 241, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.16);
}

.brand-mark::before {
  content: '';
  position: absolute;
  z-index: -1;
  inset: -5px;
  border-radius: 19px;
  background: rgba(99, 102, 241, 0.28);
  filter: blur(14px);
}

.brand-mark span {
  font-size: 23px;
  font-weight: 800;
}

.brand-lockup > div:last-child,
.card-brand > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.brand-lockup strong,
.card-brand strong {
  color: var(--login-text);
  font-size: 20px;
  font-weight: 700;
}

.brand-lockup span,
.card-brand span {
  margin-top: 3px;
  overflow: hidden;
  color: var(--login-muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brand-copy {
  max-width: 460px;
  margin: auto 0;
  padding: 70px 0;
}

.security-icon {
  display: grid;
  place-items: center;
  width: 50px;
  height: 50px;
  border: 1px solid rgba(129, 140, 248, 0.2);
  border-radius: 14px;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.09);
  font-size: 24px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
}

.brand-copy h1 {
  max-width: 440px;
  margin: 24px 0 16px;
  color: var(--login-text);
  font-size: clamp(34px, 3.8vw, 54px);
  font-weight: 720;
  line-height: 1.12;
}

.brand-copy p {
  max-width: 420px;
  margin: 0;
  color: var(--login-muted);
  font-size: 14px;
  line-height: 1.75;
}

.brand-status,
.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  color: var(--login-muted);
  font-size: 12px;
}

.brand-status b {
  margin-left: 4px;
  color: #a5b4fc;
  font-weight: 600;
}

.status-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.16), 0 0 14px rgba(16, 185, 129, 0.45);
}

.login-panel {
  display: grid;
  place-items: center;
  min-height: 100vh;
  padding: 76px clamp(28px, 7vw, 110px) 54px;
}

.login-toolbar {
  position: absolute;
  top: 28px;
  right: 34px;
}

.settings-popover {
  min-width: 220px;
}

.lang-select {
  width: 100%;
}

.settings-button {
  color: #a5b4fc;
  border-color: var(--login-border);
  background: rgba(16, 18, 24, 0.74);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.2);
}

.settings-button:hover,
.settings-button:focus {
  color: #c4b5fd !important;
  border-color: rgba(129, 140, 248, 0.48) !important;
  background: rgba(99, 102, 241, 0.14) !important;
}

.login-card {
  width: min(100%, 510px);
  min-height: 610px;
  padding: 46px 48px 38px;
  border: 1px solid var(--login-border);
  border-radius: 22px;
  background: var(--login-card);
  backdrop-filter: blur(24px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 28px 60px -20px rgba(0, 0, 0, 0.7),
    0 0 80px -34px rgba(99, 102, 241, 0.42);
  animation: login-enter 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes login-enter {
  from {
    opacity: 0;
    transform: translateY(18px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-loading {
  display: grid;
  min-height: 520px;
  place-items: center;
}

.card-brand {
  display: none;
}

.card-brand-mark {
  width: 48px;
  height: 48px;
  border-radius: 14px;
}

.login-heading {
  margin-bottom: 30px;
  text-align: center;
}

.login-heading h2 {
  margin: 0 0 9px;
  color: var(--login-text);
  font-size: 29px;
  font-weight: 700;
}

.login-heading p {
  margin: 0;
  color: var(--login-muted);
  font-size: 13px;
}

.login-form :deep(.ant-form-item) {
  margin-bottom: 20px;
}

.login-form :deep(.ant-form-item-label) {
  padding-bottom: 7px;
}

.login-form :deep(.ant-form-item-label > label) {
  height: auto;
  color: var(--login-muted);
  font-size: 12px;
  font-weight: 550;
}

.login-form :deep(.ant-input-affix-wrapper) {
  min-height: 52px;
  padding: 0 16px;
  color: var(--login-text);
  border-color: var(--login-border);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.035);
  box-shadow: none;
  transition: border-color 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.login-form :deep(.ant-input-affix-wrapper:hover) {
  border-color: var(--login-border-hover);
  background: rgba(255, 255, 255, 0.048);
}

.login-form :deep(.ant-input-affix-wrapper-focused) {
  border-color: var(--login-primary);
  background: rgba(99, 102, 241, 0.07);
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.17);
}

.login-form :deep(.ant-input-prefix) {
  margin-right: 12px;
  color: #536078;
  font-size: 16px;
  transition: color 0.18s ease;
}

.login-form :deep(.ant-input-affix-wrapper-focused .ant-input-prefix) {
  color: var(--login-primary-bright);
}

.login-form :deep(.ant-input),
.login-form :deep(.ant-input-password-icon) {
  color: var(--login-text);
  background: transparent;
}

.login-form :deep(.ant-input::placeholder) {
  color: #49556a;
}

.login-form :deep(.ant-input-password-icon:hover) {
  color: var(--login-primary-bright);
}

.submit-item {
  margin-top: 28px;
  margin-bottom: 0 !important;
}

.login-submit {
  min-height: 52px;
  border: 0;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 650;
  background: linear-gradient(135deg, var(--login-primary), #7c3aed);
  box-shadow: 0 7px 24px rgba(99, 102, 241, 0.35);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.login-submit:hover,
.login-submit:focus {
  transform: translateY(-2px);
  filter: brightness(1.08);
  background: linear-gradient(135deg, var(--login-primary), #7c3aed) !important;
  box-shadow: 0 11px 30px rgba(99, 102, 241, 0.45);
}

.login-submit:active {
  transform: translateY(0);
}

.secure-divider {
  display: flex;
  align-items: center;
  gap: 14px;
  margin: 30px 0 20px;
  color: var(--login-dim);
  font-size: 11px;
}

.secure-divider::before,
.secure-divider::after {
  content: '';
  height: 1px;
  flex: 1;
  background: var(--login-border);
}

.login-footer {
  text-align: center;
}

.version-badge {
  padding: 6px 13px;
  border: 1px solid var(--login-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.03);
}

.login-footer p {
  margin: 17px auto 0;
  max-width: 350px;
  color: var(--login-dim);
  font-size: 11px;
  line-height: 1.55;
}

@media (max-width: 980px) {
  .login-content {
    grid-template-columns: minmax(260px, 0.8fr) minmax(480px, 1.6fr);
  }

  .login-brand-panel {
    padding: 32px;
  }

  .brand-copy h1 {
    font-size: 36px;
  }

  .login-panel {
    padding-right: 36px;
    padding-left: 36px;
  }
}

@media (max-width: 768px) {
  .login-content {
    display: block;
    overflow-y: auto;
  }

  .login-brand-panel {
    display: none;
  }

  .login-panel {
    min-height: 100vh;
    padding: 76px 18px 26px;
  }

  .login-toolbar {
    top: 20px;
    right: 20px;
  }

  .login-card {
    min-height: 0;
    padding: 34px 25px 27px;
    border-radius: 18px;
  }

  .card-brand {
    display: flex;
    margin-bottom: 28px;
  }

  .login-heading h2 {
    font-size: 26px;
  }
}

@media (max-width: 420px) {
  .login-panel {
    padding-right: 12px;
    padding-left: 12px;
  }

  .login-card {
    padding-right: 20px;
    padding-left: 20px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .login-card,
  .login-submit {
    animation: none;
    transition: none;
  }
}
</style>
