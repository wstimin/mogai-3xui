<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { message } from 'ant-design-vue';
import { ApiOutlined } from '@ant-design/icons-vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'add' }, // 'add' | 'edit'
  node: { type: Object, default: null },
  testConnection: { type: Function, required: true },
  save: { type: Function, required: true }, // (payload) => Promise<msg>
});

const emit = defineEmits(['update:open']);

const { t } = useI18n();

// Default form shape — used for "add" mode and to reset between
// edits. Sane defaults: HTTPS, port 2053, base path '/', enabled.
function defaultForm() {
  return {
    id: 0,
    name: '',
    remark: '',
    scheme: 'https',
    address: '',
    port: 2053,
    basePath: '/',
    apiToken: '',
    enable: true,
  };
}

const form = reactive(defaultForm());
const submitting = ref(false);
const testing = ref(false);
const testResult = ref(null); // { status, latencyMs, xrayVersion, error }
// Reset the form whenever the modal is opened. In edit mode we copy
// the existing node into the form fields; in add mode we wipe back
// to defaults so a previous edit doesn't leak through.
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    Object.assign(form, defaultForm());
    testResult.value = null;
    if (props.mode === 'edit' && props.node) {
      Object.assign(form, props.node);
    }
  },
);

const title = computed(() =>
  props.mode === 'edit' ? t('pages.nodes.editNode') : t('pages.nodes.addNode'),
);

function close() {
  if (!submitting.value) emit('update:open', false);
}

function buildPayload() {
  return {
    id: form.id || 0,
    name: form.name?.trim() || '',
    remark: form.remark?.trim() || '',
    scheme: form.scheme || 'https',
    address: form.address?.trim() || '',
    port: Number(form.port) || 0,
    basePath: form.basePath?.trim() || '/',
    apiToken: form.apiToken?.trim() || '',
    enable: !!form.enable,
  };
}

async function onTest() {
  testing.value = true;
  testResult.value = null;
  try {
    const payload = buildPayload();
    if (!payload.address || !payload.port) {
      message.error(t('pages.nodes.toasts.fillRequired'));
      return;
    }
    const msg = await props.testConnection(payload);
    if (msg?.success) {
      testResult.value = msg.obj;
    } else {
      testResult.value = { status: 'offline', error: msg?.msg || 'unknown error' };
    }
  } finally {
    testing.value = false;
  }
}

async function onSave() {
  const payload = buildPayload();
  if (!payload.name || !payload.address || !payload.port) {
    message.error(t('pages.nodes.toasts.fillRequired'));
    return;
  }
  submitting.value = true;
  try {
    const msg = await props.save(payload);
    if (msg?.success) {
      emit('update:open', false);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <a-modal
    :open="open"
    :title="title"
    :confirm-loading="submitting"
    :ok-text="t('save')"
    :cancel-text="t('cancel')"
    :mask-closable="false"
    width="min(680px, calc(100vw - 24px))"
    wrap-class-name="node-form-modal"
    @ok="onSave"
    @cancel="close"
  >
    <div class="node-form-stack">
      <section class="form-section">
        <div class="section-heading">
          <span class="section-icon"><ApiOutlined /></span>
          <div>
            <h3>{{ t('pages.nodes.connectionSettings') }}</h3>
            <p>{{ t('pages.nodes.connectionSettingsHint') }}</p>
          </div>
        </div>

        <a-form layout="vertical" :model="form">
          <a-row :gutter="16">
            <a-col :xs="24" :sm="12">
              <a-form-item :label="t('pages.nodes.name')" required>
                <a-input v-model:value="form.name" :placeholder="t('pages.nodes.namePlaceholder')" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item :label="t('pages.nodes.remark')">
                <a-input v-model:value="form.remark" />
              </a-form-item>
            </a-col>
          </a-row>

          <a-row :gutter="16">
            <a-col :xs="24" :sm="6">
              <a-form-item :label="t('pages.nodes.scheme')">
                <a-select v-model:value="form.scheme">
                  <a-select-option value="https">https</a-select-option>
                  <a-select-option value="http">http</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="12">
              <a-form-item :label="t('pages.nodes.address')" required>
                <a-input v-model:value="form.address" :placeholder="t('pages.nodes.addressPlaceholder')" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="6">
              <a-form-item :label="t('pages.nodes.port')" required>
                <a-input-number v-model:value="form.port" :min="1" :max="65535" style="width: 100%" />
              </a-form-item>
            </a-col>
          </a-row>

          <a-row :gutter="16">
            <a-col :xs="24" :sm="16">
              <a-form-item :label="t('pages.nodes.basePath')">
                <a-input v-model:value="form.basePath" placeholder="/" />
              </a-form-item>
            </a-col>
            <a-col :xs="24" :sm="8">
              <a-form-item :label="t('pages.nodes.enable')">
                <div class="enable-control">
                  <a-switch v-model:checked="form.enable" />
                  <span>{{ form.enable ? t('pages.nodes.enabledOnSave') : t('disabled') }}</span>
                </div>
              </a-form-item>
            </a-col>
          </a-row>

          <a-form-item :label="t('pages.nodes.apiToken')" required>
            <a-input-password
              v-model:value="form.apiToken"
              :placeholder="t('pages.nodes.apiTokenPlaceholder')"
            />
            <div class="hint">{{ t('pages.nodes.apiTokenHint') }}</div>
          </a-form-item>
        </a-form>
      </section>

      <section class="test-row">
        <div>
          <strong>{{ t('pages.nodes.testConnection') }}</strong>
          <p>{{ t('pages.nodes.testConnectionHint') }}</p>
        </div>
        <a-button :loading="testing" @click="onTest">
          <template #icon><ApiOutlined /></template>
          {{ t('pages.nodes.testConnection') }}
        </a-button>
        <div v-if="testResult" class="test-result">
          <a-alert
            v-if="testResult.status === 'online'"
            type="success"
            show-icon
            :message="t('pages.nodes.connectionOk', { ms: testResult.latencyMs })"
            :description="testResult.xrayVersion ? `Xray ${testResult.xrayVersion}` : undefined"
          />
          <a-alert
            v-else
            type="error"
            show-icon
            :message="t('pages.nodes.connectionFailed')"
            :description="testResult.error"
          />
        </div>
      </section>
    </div>
  </a-modal>
</template>

<style scoped>
.node-form-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-section {
  padding: 17px;
  border: 1px solid rgba(255, 255, 255, 0.055);
  border-radius: 12px;
  background: rgba(15, 17, 23, 0.72);
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 17px;
}

.section-icon {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  flex: 0 0 38px;
  border: 1px solid rgba(99, 102, 241, 0.28);
  border-radius: 10px;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.12);
}

.section-heading h3,
.section-heading p,
.test-row p {
  margin: 0;
}

.section-heading h3 {
  color: #f1f5f9;
  font-size: 14px;
}

.section-heading p,
.test-row p {
  margin-top: 3px;
  color: #64748b;
  font-size: 11.5px;
}

.form-section :deep(.ant-form-item-label > label) {
  color: #94a3b8 !important;
  font-size: 12px;
}

.form-section :deep(.ant-input),
.form-section :deep(.ant-input-affix-wrapper),
.form-section :deep(.ant-input-number),
.form-section :deep(.ant-select-selector) {
  min-height: 39px;
  border-radius: 9px !important;
}

.form-section :deep(.ant-select-selector) {
  align-items: center;
}

.enable-control {
  min-height: 39px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: #64748b;
  font-size: 11.5px;
}

.hint {
  margin-top: 6px;
  color: #64748b;
  font-size: 11.5px;
}

.test-row {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 15px 17px;
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 12px;
  background: rgba(99, 102, 241, 0.07);
}

.test-row :deep(.ant-btn) {
  min-height: 38px;
  border-color: rgba(99, 102, 241, 0.28);
  border-radius: 9px;
  color: #a5b4fc;
  background: rgba(99, 102, 241, 0.11);
}

.test-row :deep(.ant-btn:hover) {
  color: #fff;
  border-color: rgba(99, 102, 241, 0.46);
  background: rgba(99, 102, 241, 0.2);
}

.test-result {
  grid-column: 1 / -1;
  width: 100%;
}

@media (max-width: 576px) {
  .form-section {
    padding: 14px 12px;
  }

  .test-row {
    grid-template-columns: 1fr;
    padding: 14px 12px;
  }

  .test-row :deep(.ant-btn) {
    width: 100%;
  }
}
</style>
