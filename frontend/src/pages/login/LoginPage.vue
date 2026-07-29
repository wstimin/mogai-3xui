<script setup>
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
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

const { t } = useI18n();

const headlineWords = computed(() => [t('pages.login.hello'), t('pages.login.title')]);
const HEADLINE_INTERVAL_MS = 2000;
const headlineIndex = ref(0);
let headlineTimer = null;

onMounted(() => {
  headlineTimer = window.setInterval(() => {
    headlineIndex.value = (headlineIndex.value + 1) % headlineWords.value.length;
  }, HEADLINE_INTERVAL_MS);
});

onBeforeUnmount(() => {
  if (headlineTimer != null) window.clearInterval(headlineTimer);
});

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
        <div class="login-brand-panel" aria-hidden="true">
          <div class="brand-lockup">
            <div class="brand-mark">X</div>
            <div><strong>3X-UI</strong><span>CONTROL PANEL</span></div>
          </div>
          <div class="brand-copy">
            <SafetyCertificateOutlined />
            <h1>Secure access to your network control center.</h1>
            <p>3X-UI v2.9.4</p>
          </div>
          <div class="brand-grid" />
        </div>

        <a-row type="flex" justify="center" align="middle" class="login-row">
          <a-col class="login-card">
            <div v-if="!fetched" class="login-loading">
              <a-spin size="large" />
            </div>

            <div v-else>
              <div class="mobile-brand">
                <div class="brand-mark">X</div>
                <div><strong>3X-UI</strong><span>v2.9.4</span></div>
              </div>
              <div class="login-settings">
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
                  <a-button shape="circle">
                    <template #icon>
                      <SettingOutlined />
                    </template>
                  </a-button>
                </a-popover>
              </div>

              <a-row justify="center">
                <a-col :span="24">
                  <h2 class="login-title">
                    <Transition name="headline" mode="out-in">
                      <b :key="headlineIndex">{{ headlineWords[headlineIndex] }}</b>
                    </Transition>
                  </h2>
                  <p class="login-subtitle">Sign in to continue to the control panel</p>
                </a-col>
              </a-row>

              <a-form layout="vertical" @submit.prevent="login">
                <a-form-item>
                  <a-input v-model:value="user.username" autocomplete="username" name="username"
                    :placeholder="t('username')" autofocus required>
                    <template #prefix>
                      <UserOutlined />
                    </template>
                  </a-input>
                </a-form-item>

                <a-form-item>
                  <a-input-password v-model:value="user.password" autocomplete="current-password" name="password"
                    :placeholder="t('password')" required>
                    <template #prefix>
                      <LockOutlined />
                    </template>
                  </a-input-password>
                </a-form-item>

                <a-form-item v-if="twoFactorEnable">
                  <a-input v-model:value="user.twoFactorCode" autocomplete="one-time-code" name="twoFactorCode"
                    :placeholder="t('twoFactorCode')" required>
                    <template #prefix>
                      <KeyOutlined />
                    </template>
                  </a-input>
                </a-form-item>

                <a-form-item>
                  <a-row justify="center">
                    <a-button type="primary" html-type="submit" :loading="submitting" block>
                      {{ submitting ? '' : t('login') }}
                    </a-button>
                  </a-row>
                </a-form-item>
              </a-form>
            </div>
          </a-col>
        </a-row>
      </a-layout-content>
    </a-layout>
  </a-config-provider>
</template>

<style scoped>
.login-app {
  --bg-page: #c7ebe2;
  --bg-wave-header: #dbf5ed;
  --bg-card: #ffffff;
  --color-title: #008771;
  --shadow-card: 0 2px 8px rgba(0, 0, 0, 0.09);
  --wave-fill: rgba(0, 135, 113, 0.12);
  --wave-fill-bottom: #c7ebe2;

  min-height: 100vh;
}

.login-app,
.login-app :deep(.ant-layout-content) {
  background-color: transparent !important;
}

/* 隐藏原本的波浪背景，防止遮挡壁纸 */
.waves-header {
  display: none;
  position: fixed;
  inset: 0 0 auto 0;
  width: 100%;
  z-index: 0;
  pointer-events: none;
  background: var(--bg-wave-header);
}

.login-card {
  width: clamp(280px, 90vw, 300px);
  border-radius: 2rem;
  padding: clamp(2rem, 5vw, 4rem) 1.5rem;
  transition: background 0.3s, box-shadow 0.3s;
}

.login-title {
  text-align: center;
  margin-bottom: 32px;
  font-size: 2rem;
  font-weight: 500;
  min-height: 2.5rem;
}

.login-settings {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.settings-popover {
  min-width: 220px;
}

.lang-select {
  width: 100%;
}

.login-content {
  position: relative;
}

.login-row {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  padding: 24px 0;
}

.login-loading {
  text-align: center;
  padding: 40px 0;
}

.login-title b {
  display: inline-block;
}

.headline-enter-active,
.headline-leave-active {
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.headline-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}

.headline-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* 下面保留原有的波浪动画CSS以防后续你需要恢复，但上面已通过 display: none 隐藏 */
.waves-inner-header {
  height: 50vh;
  width: 100%;
}

.waves {
  position: relative;
  display: block;
  width: 100%;
  height: 15vh;
  min-height: 100px;
  max-height: 150px;
  margin-bottom: -8px;
}

.parallax>use {
  fill: var(--wave-fill);
  animation: move-forever 25s cubic-bezier(0.55, 0.5, 0.45, 0.5) infinite;
}

.parallax>use:nth-child(1) {
  animation-delay: -2s;
  animation-duration: 4s;
  opacity: 0.2;
}

.parallax>use:nth-child(2) {
  animation-delay: -3s;
  animation-duration: 7s;
  opacity: 0.4;
}

.parallax>use:nth-child(3) {
  animation-delay: -4s;
  animation-duration: 10s;
  opacity: 0.6;
}

.parallax>use:nth-child(4) {
  animation-delay: -5s;
  animation-duration: 13s;
  fill: var(--wave-fill-bottom);
  opacity: 1;
}

@keyframes move-forever {
  0% {
    transform: translate3d(-90px, 0, 0);
  }

  100% {
    transform: translate3d(85px, 0, 0);
  }
}
</style>

<style scoped>
.login-app,
.login-app.is-dark,
.login-app.is-dark.is-ultra {
  min-height: 100vh;
  background: var(--xui-bg) !important;
  background-image: none !important;
}

.login-content::before {
  content: '';
  position: fixed;
  inset: 0 58% 0 0;
  background: var(--xui-sidebar);
  border-right: 1px solid var(--xui-border);
}

.login-card {
  width: clamp(320px, 90vw, 390px);
  padding: 38px 34px 30px;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface) !important;
  backdrop-filter: none;
  box-shadow: var(--xui-shadow) !important;
}

.login-title {
  margin-bottom: 28px;
  color: var(--xui-text-strong) !important;
  text-shadow: none;
  font-size: 25px;
  font-weight: 750;
}

.login-card :deep(.ant-input-affix-wrapper),
.login-card :deep(.ant-btn-primary) {
  min-height: 44px;
}

.login-brand-panel {
  position: fixed;
  inset: 0 52% 0 0;
  overflow: hidden;
  padding: 42px 48px;
  color: var(--xui-text-strong);
  background: #111923;
  border-right: 1px solid var(--xui-border);
}

.brand-lockup,
.mobile-brand {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-mark {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  background: #2f73f6;
  font-size: 19px;
  font-weight: 800;
  box-shadow: 0 10px 24px rgba(47, 115, 246, 0.24);
}

.brand-lockup div:last-child,
.mobile-brand div:last-child {
  display: flex;
  flex-direction: column;
}

.brand-lockup strong,
.mobile-brand strong {
  color: var(--xui-text-strong);
  font-size: 18px;
}

.brand-lockup span,
.mobile-brand span {
  margin-top: 2px;
  color: var(--xui-text-muted);
  font-size: 10px;
}

.brand-copy {
  position: relative;
  z-index: 2;
  max-width: 520px;
  margin-top: 28vh;
}

.brand-copy > span {
  color: #54d6c2;
  font-size: 30px;
}

.brand-copy h1 {
  margin: 20px 0 14px;
  color: var(--xui-text-strong);
  font-size: clamp(32px, 4vw, 54px);
  line-height: 1.08;
  font-weight: 750;
}

.brand-copy p {
  color: var(--xui-text-muted);
  font-size: 14px;
}

.brand-grid {
  position: absolute;
  inset: 0;
  opacity: 0.22;
  background-image:
    linear-gradient(rgba(87, 113, 145, 0.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(87, 113, 145, 0.18) 1px, transparent 1px);
  background-size: 44px 44px;
  mask-image: linear-gradient(to bottom right, transparent 10%, #000 78%);
}

.login-row {
  padding: 24px 7% 24px 55%;
}

.login-title {
  margin: 18px 0 6px;
}

.login-subtitle {
  margin: 0 0 26px;
  color: var(--xui-text-muted);
  text-align: center;
  font-size: 13px;
}

.mobile-brand {
  display: none;
}

@media (max-width: 768px) {
  .login-content::before {
    display: none;
  }

  .login-brand-panel {
    display: none;
  }

  .login-row {
    padding: 18px;
  }

  .login-card {
    width: min(100%, 390px);
    padding: 32px 24px 24px;
  }

  .mobile-brand {
    display: flex;
    margin-bottom: 14px;
  }
}
</style>
