<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { PlusOutlined, MinusOutlined, QuestionCircleOutlined } from '@ant-design/icons-vue';

// Routing-rule editor — mirrors xray_rule_modal.html. We keep the
// CSV-style fields (domain / ip / sourceIP / user / port / sourcePort /
// vlessRoute) as plain strings while the modal is open and split them
// back to arrays on submit, just like the legacy ruleModal.getResult.

const props = defineProps({
  open: { type: Boolean, default: false },
  // null when adding, the rule object when editing.
  rule: { type: Object, default: null },
  // Tag pools sourced from templateSettings.{inbounds,outbounds,routing.balancers}
  // and the parent's inboundTags / clientReverseTags / dnsTag.
  inboundTags: { type: Array, default: () => [] },
  outboundTags: { type: Array, default: () => [] },
  balancerTags: { type: Array, default: () => [''] },
});

const emit = defineEmits(['update:open', 'confirm']);

const form = reactive({
  domain: '',
  ip: '',
  port: '',
  sourcePort: '',
  vlessRoute: '',
  network: '',
  sourceIP: '',
  user: '',
  inboundTag: [],
  protocol: [],
  attrs: [], // [[key, value], ...]
  outboundTag: '',
  balancerTag: '',
});

const isEdit = ref(false);

function reset() {
  form.domain = '';
  form.ip = '';
  form.port = '';
  form.sourcePort = '';
  form.vlessRoute = '';
  form.network = '';
  form.sourceIP = '';
  form.user = '';
  form.inboundTag = [];
  form.protocol = [];
  form.attrs = [];
  form.outboundTag = '';
  form.balancerTag = '';
}

watch(() => props.open, (next) => {
  if (!next) return;
  if (props.rule) {
    isEdit.value = true;
    const r = props.rule;
    form.domain = Array.isArray(r.domain) ? r.domain.join(',') : (r.domain || '');
    form.ip = Array.isArray(r.ip) ? r.ip.join(',') : (r.ip || '');
    form.port = r.port || '';
    form.sourcePort = r.sourcePort || '';
    form.vlessRoute = r.vlessRoute || '';
    form.network = r.network || '';
    form.sourceIP = Array.isArray(r.sourceIP) ? r.sourceIP.join(',') : (r.sourceIP || '');
    form.user = Array.isArray(r.user) ? r.user.join(',') : (r.user || '');
    form.inboundTag = r.inboundTag || [];
    form.protocol = r.protocol || [];
    // Attrs in the wire shape are an object — flatten to [[k,v]] pairs.
    form.attrs = r.attrs ? Object.entries(r.attrs) : [];
    form.outboundTag = r.outboundTag || '';
    form.balancerTag = r.balancerTag || '';
  } else {
    isEdit.value = false;
    reset();
  }
});

function close() { emit('update:open', false); }

function csv(value) {
  if (!value) return [];
  return String(value).split(',').map((s) => s.trim()).filter(Boolean);
}

function buildResult() {
  const rule = {
    type: 'field',
    domain: csv(form.domain),
    ip: csv(form.ip),
    port: form.port,
    sourcePort: form.sourcePort,
    vlessRoute: form.vlessRoute,
    network: form.network,
    sourceIP: csv(form.sourceIP),
    user: csv(form.user),
    inboundTag: form.inboundTag,
    protocol: form.protocol,
    attrs: Object.fromEntries(form.attrs.filter(([k]) => k)),
    outboundTag: form.outboundTag === '' ? undefined : form.outboundTag,
    balancerTag: form.balancerTag === '' ? undefined : form.balancerTag,
  };
  // Strip empty arrays / objects / strings so the final wire JSON
  // matches what the legacy `getResult` produces.
  const out = {};
  for (const [k, v] of Object.entries(rule)) {
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    if (v === '') continue;
    out[k] = v;
  }
  return out;
}

function onOk() {
  emit('confirm', buildResult());
}

import { useI18n } from 'vue-i18n';
const { t, locale } = useI18n();
const isChinese = computed(() => locale.value === 'zh-CN');
const uiText = (english, chinese) => (isChinese.value ? chinese : english);

const title = computed(() =>
  isEdit.value
    ? `${t('edit')} ${t('pages.xray.Routings')}`
    : `+ ${t('pages.xray.Routings')}`,
);
const okText = computed(() =>
  isEdit.value ? t('pages.client.submitEdit') : t('create'),
);

const NETWORKS = ['', 'TCP', 'UDP', 'TCP,UDP'];
const PROTOCOLS = ['http', 'tls', 'bittorrent', 'quic'];
</script>

<template>
  <a-modal
    :open="open"
    :ok-text="okText"
    :cancel-text="t('close')"
    :mask-closable="false"
    width="min(720px, calc(100vw - 24px))"
    wrap-class-name="routing-rule-modal"
    root-class-name="routing-rule-modal-root"
    @ok="onOk"
    @cancel="close"
  >
    <template #title>
      <div class="modal-heading">
        <div class="modal-heading-title">{{ title }}</div>
        <div class="modal-heading-subtitle">
          {{ uiText('Define matching conditions and routing destination', '定义流量匹配条件与路由目标') }}
        </div>
      </div>
    </template>
    <a-form class="routing-form" :colon="false" :label-col="{ md: { span: 8 } }" :wrapper-col="{ md: { span: 14 } }">
      <section class="modal-form-card">
        <div class="card-heading">
          <div class="card-title">{{ uiText('Source conditions', '来源条件') }}</div>
          <div class="card-description">{{ uiText('Match traffic origin and protocol', '匹配流量来源与协议特征') }}</div>
        </div>
      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.ui.commaSeparated')">
            {{ t('pages.xray.ui.sourceIps') }} <QuestionCircleOutlined />
          </a-tooltip>
        </template>
        <a-input v-model:value="form.sourceIP" placeholder="0.0.0.0/8, fc00::/7, geoip:ir" />
      </a-form-item>

      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.ui.commaSeparated')">
            {{ t('pages.xray.ui.sourcePort') }} <QuestionCircleOutlined />
          </a-tooltip>
        </template>
        <a-input v-model:value="form.sourcePort" placeholder="53,443,1000-2000" />
      </a-form-item>

      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.ui.commaSeparated')">
            {{ t('pages.xray.ui.vlessRoute') }} <QuestionCircleOutlined />
          </a-tooltip>
        </template>
        <a-input v-model:value="form.vlessRoute" placeholder="53,443,1000-2000" />
      </a-form-item>

      <a-form-item :label="t('pages.xray.ui.network')">
        <a-select v-model:value="form.network">
          <a-select-option v-for="n in NETWORKS" :key="n" :value="n">{{ n || `(${t('pages.xray.ui.any')})` }}</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="t('pages.xray.ui.protocol')">
        <a-select v-model:value="form.protocol" mode="multiple">
          <a-select-option v-for="p in PROTOCOLS" :key="p" :value="p">{{ p }}</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item :label="t('pages.xray.ui.attributes')">
        <a-button size="small" @click="form.attrs.push(['', ''])">
          <template #icon><PlusOutlined /></template>
        </a-button>
      </a-form-item>
      <a-form-item :wrapper-col="{ span: 24 }">
        <a-input-group v-for="(attr, idx) in form.attrs" :key="idx" compact class="mb-8">
          <a-input :style="{ width: '45%' }" v-model:value="attr[0]" :placeholder="t('pages.xray.ui.name')">
            <template #addonBefore>{{ idx + 1 }}</template>
          </a-input>
          <a-input :style="{ width: '45%' }" v-model:value="attr[1]" :placeholder="t('pages.xray.ui.value')" />
          <a-button @click="form.attrs.splice(idx, 1)">
            <template #icon><MinusOutlined /></template>
          </a-button>
        </a-input-group>
      </a-form-item>
      </section>

      <section class="modal-form-card">
        <div class="card-heading">
          <div class="card-title">{{ uiText('Target matching', '目标匹配') }}</div>
          <div class="card-description">{{ uiText('Match destination, user and inbound tags', '匹配目标地址、用户与入站标签') }}</div>
        </div>
      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.ui.commaSeparated')">IP <QuestionCircleOutlined /></a-tooltip>
        </template>
        <a-input v-model:value="form.ip" placeholder="0.0.0.0/8, fc00::/7, geoip:ir" />
      </a-form-item>

      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.ui.commaSeparated')">{{ t('pages.xray.ui.domain') }} <QuestionCircleOutlined /></a-tooltip>
        </template>
        <a-input v-model:value="form.domain" placeholder="google.com, geosite:cn" />
      </a-form-item>

      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.ui.commaSeparated')">{{ t('pages.xray.ui.user') }} <QuestionCircleOutlined /></a-tooltip>
        </template>
        <a-input v-model:value="form.user" placeholder="email address" />
      </a-form-item>

      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.ui.commaSeparated')">{{ t('pages.xray.ui.port') }} <QuestionCircleOutlined /></a-tooltip>
        </template>
        <a-input v-model:value="form.port" placeholder="53,443,1000-2000" />
      </a-form-item>

      <a-form-item :label="t('pages.xray.ui.inboundTags')">
        <a-select v-model:value="form.inboundTag" mode="multiple">
          <a-select-option v-for="tag in inboundTags" :key="tag" :value="tag">{{ tag }}</a-select-option>
        </a-select>
      </a-form-item>
      </section>

      <section class="modal-form-card">
        <div class="card-heading">
          <div class="card-title">{{ uiText('Routing action', '路由动作') }}</div>
          <div class="card-description">{{ uiText('Choose an outbound or balancer target', '选择出站或负载均衡目标') }}</div>
        </div>
      <a-form-item :label="t('pages.xray.ui.outboundTag')">
        <a-select v-model:value="form.outboundTag">
          <a-select-option v-for="tag in outboundTags" :key="tag || '__empty'" :value="tag">{{ tag || `(${t('pages.xray.ui.none')})` }}</a-select-option>
        </a-select>
      </a-form-item>

      <a-form-item>
        <template #label>
          <a-tooltip :title="t('pages.xray.balancer.balancerDesc')">
            {{ t('pages.xray.ui.balancerTag') }} <QuestionCircleOutlined />
          </a-tooltip>
        </template>
        <a-select v-model:value="form.balancerTag">
          <a-select-option v-for="tag in balancerTags" :key="tag || '__empty'" :value="tag">{{ tag || `(${t('pages.xray.ui.none')})` }}</a-select-option>
        </a-select>
      </a-form-item>
      </section>
    </a-form>
  </a-modal>
</template>

<style scoped>
.mb-8 { margin-bottom: 8px; }

.modal-heading {
  min-width: 0;
  padding-right: 38px;
}

.modal-heading-title {
  color: #f1f5f9;
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
}

.modal-heading-subtitle {
  margin-top: 4px;
  color: #64748b;
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.45;
}

.routing-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.modal-form-card {
  padding: 18px 18px 5px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  background: rgba(18, 20, 28, 0.92);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.16);
}

.card-heading {
  margin-bottom: 17px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
}

.card-title {
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 650;
}

.card-description {
  margin-top: 3px;
  color: #64748b;
  font-size: 11.5px;
  line-height: 1.4;
}

.routing-form :deep(.ant-form-item-label > label) {
  color: #94a3b8;
  font-size: 12.5px;
  font-weight: 500;
}

.routing-form :deep(.ant-input),
.routing-form :deep(.ant-input-affix-wrapper),
.routing-form :deep(.ant-select-selector) {
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.035) !important;
  box-shadow: none !important;
}

.routing-form :deep(.ant-input:hover),
.routing-form :deep(.ant-input-affix-wrapper:hover),
.routing-form :deep(.ant-select:not(.ant-select-disabled):hover .ant-select-selector) {
  border-color: rgba(99, 102, 241, 0.42) !important;
}

.routing-form :deep(.ant-input:focus),
.routing-form :deep(.ant-input-affix-wrapper-focused),
.routing-form :deep(.ant-select-focused .ant-select-selector) {
  border-color: rgba(99, 102, 241, 0.62) !important;
  background: rgba(99, 102, 241, 0.055) !important;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.11) !important;
}

:global(.routing-rule-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  background: #0e1017;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.06);
}

:global(.routing-rule-modal .ant-modal-header) {
  margin: 0;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: #0e1017;
}

:global(.routing-rule-modal .ant-modal-close) {
  top: 14px;
  right: 14px;
  color: #64748b;
  border-radius: 8px;
}

:global(.routing-rule-modal .ant-modal-body) {
  max-height: min(72vh, 760px);
  padding: 18px 20px 28px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #0e1017;
}

:global(.routing-rule-modal .ant-modal-footer) {
  margin: 0;
  padding: 16px 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.2);
}

:global(.routing-rule-modal .ant-modal-footer .ant-btn) {
  min-width: 84px;
  height: 36px;
  border-radius: 8px;
}

:global(.routing-rule-modal .ant-modal-footer .ant-btn-primary) {
  border-color: #6366f1;
  background: #6366f1;
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.35);
}

:global(.routing-rule-modal-root .ant-modal-mask) {
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
}

@media (max-width: 768px) {
  .modal-form-card {
    padding-right: 12px;
    padding-left: 12px;
  }

  .routing-form :deep(.ant-form-item-row) {
    display: block;
  }

  .routing-form :deep(.ant-form-item-label),
  .routing-form :deep(.ant-form-item-control) {
    flex: 0 0 100%;
    max-width: 100%;
  }

  .routing-form :deep(.ant-form-item-label) {
    padding: 0 0 5px;
    text-align: left;
  }

  :global(.routing-rule-modal .ant-modal) {
    top: 12px;
    padding-bottom: 12px;
  }

  :global(.routing-rule-modal .ant-modal-body) {
    max-height: calc(100vh - 148px);
    padding: 14px 12px 24px;
  }
}
</style>
