<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import dayjs from 'dayjs';
import { message } from 'ant-design-vue';
import { SyncOutlined, PlusOutlined, MinusOutlined, DeleteOutlined } from '@ant-design/icons-vue';

import {
  HttpUtil,
  RandomUtil,
  NumberFormatter,
  SizeFormatter,
  Wireguard,
} from '@/utils';
import {
  Inbound,
  Protocols,
  SSMethods,
  USERS_SECURITY,
  TLS_FLOW_CONTROL,
  SNIFFING_OPTION,
  TLS_VERSION_OPTION,
  TLS_CIPHER_OPTION,
  UTLS_FINGERPRINT,
  ALPN_OPTION,
  USAGE_OPTION,
  DOMAIN_STRATEGY_OPTION,
  TCP_CONGESTION_OPTION,
  MODE_OPTION,
} from '@/models/inbound.js';
import { DBInbound } from '@/models/dbinbound.js';
import FinalMaskForm from '@/components/FinalMaskForm.vue';
import DateTimePicker from '@/components/DateTimePicker.vue';
import { useNodeList } from '@/composables/useNodeList.js';

const { t, locale } = useI18n();

const isChinese = computed(() => locale.value === 'zh-CN');
const uiText = (english, chinese) => (isChinese.value ? chinese : english);

// Node selector — Phase 1 multi-node deployment. Shows all enabled
// nodes regardless of online state so the form is usable while a node
// is briefly offline; the backend's fail-fast path will surface the
// real error when the user submits.
const { nodes: availableNodes } = useNodeList();
const selectableNodes = computed(() => (availableNodes.value || []).filter((n) => n.enable));

// Phase 5f-iii-b: structured per-protocol/per-transport forms instead
// of raw JSON textareas. Edits a deeply-reactive Inbound + DBInbound
// pair so the existing model helpers (.toString(), .canEnableTls(),
// genAllLinks(), addPeer(), etc.) keep working unchanged. The
// "Advanced" tab still exposes the full streamSettings JSON for
// transport variants (KCP/XHTTP/sockopt/finalmask) we don't yet have
// dedicated UI for.

const props = defineProps({
  open: { type: Boolean, default: false },
  mode: { type: String, default: 'add', validator: (v) => ['add', 'edit'].includes(v) },
  dbInbound: { type: Object, default: null },
});

const emit = defineEmits(['update:open', 'saved']);

const TRAFFIC_RESETS = ['never', 'hourly', 'daily', 'weekly', 'monthly'];
const PROTOCOLS = Object.values(Protocols);
const SECURITY_OPTIONS = Object.values(USERS_SECURITY);
const FLOW_OPTIONS = Object.values(TLS_FLOW_CONTROL);

// === Reactive state ================================================
// Cloned on every open so cancelling the modal doesn't mutate the row.
const inbound = ref(null);
const dbForm = ref(null);
const saving = ref(false);
const activeSection = ref('basic');
const advancedJson = ref({ stream: '', sniffing: '', settings: '' });
// Cached default cert/key paths from /panel/setting/defaultSettings —
// powers the "Set default cert" button on the TLS form.
const defaultCert = ref('');
const defaultKey = ref('');

// Lookup tables for the option dropdowns.
const TLS_VERSIONS = Object.values(TLS_VERSION_OPTION);
const CIPHER_SUITES = Object.entries(TLS_CIPHER_OPTION); // [label, value]
const FINGERPRINTS = Object.values(UTLS_FINGERPRINT);
const ALPNS = Object.values(ALPN_OPTION);
const USAGES = Object.values(USAGE_OPTION);
const DOMAIN_STRATEGIES = Object.values(DOMAIN_STRATEGY_OPTION);
const TCP_CONGESTIONS = Object.values(TCP_CONGESTION_OPTION);
const MODE_OPTIONS = Object.values(MODE_OPTION);

// External proxy is a single switch in the UI but a list in the model:
// flipping it on seeds one row pre-filled with the current host:port.
const externalProxy = computed({
  get: () => Array.isArray(inbound.value?.stream?.externalProxy)
    && inbound.value.stream.externalProxy.length > 0,
  set: (v) => {
    if (!inbound.value?.stream) return;
    if (v) {
      inbound.value.stream.externalProxy = [{
        forceTls: 'same',
        dest: window.location.hostname,
        port: inbound.value.port,
        remark: '',
      }];
    } else {
      inbound.value.stream.externalProxy = [];
    }
  },
});

// Derived helpers — each is a computed off `inbound` so flips of
// protocol / network / security re-render the right blocks.
const protocol = computed(() => inbound.value?.protocol);
const network = computed({
  get: () => inbound.value?.stream?.network,
  set: (v) => onNetworkChange(v),
});
const security = computed({
  get: () => inbound.value?.stream?.security,
  set: (v) => { if (inbound.value?.stream) inbound.value.stream.security = v; },
});

const isMultiUser = computed(() => {
  if (!inbound.value) return false;
  switch (inbound.value.protocol) {
    case Protocols.VMESS:
    case Protocols.VLESS:
    case Protocols.TROJAN:
    case Protocols.HYSTERIA:
      return true;
    case Protocols.SHADOWSOCKS:
      return !!inbound.value.isSSMultiUser;
    default:
      return false;
  }
});

const clientsArray = computed(() => {
  if (!inbound.value) return [];
  switch (inbound.value.protocol) {
    case Protocols.VMESS: return inbound.value.settings.vmesses || [];
    case Protocols.VLESS: return inbound.value.settings.vlesses || [];
    case Protocols.TROJAN: return inbound.value.settings.trojans || [];
    case Protocols.SHADOWSOCKS: return inbound.value.settings.shadowsockses || [];
    case Protocols.HYSTERIA: return inbound.value.settings.hysterias || [];
    default: return [];
  }
});

const firstClient = computed(() => clientsArray.value[0] || null);
const canEnableStream = computed(() => inbound.value?.canEnableStream?.() === true);
const canEnableTls = computed(() => inbound.value?.canEnableTls?.() === true);
const canEnableReality = computed(() => inbound.value?.canEnableReality?.() === true);
const canEnableTlsFlow = computed(() => inbound.value?.canEnableTlsFlow?.() === true);

// VLESS/Trojan TLS fallbacks — surfaced in the protocol tab when the
// inbound is on TCP and (for VLESS) using no Xray-side encryption.
const showFallbacks = computed(() => {
  if (!inbound.value) return false;
  if (inbound.value.stream?.network !== 'tcp') return false;
  if (inbound.value.protocol === Protocols.VLESS) {
    const enc = inbound.value.settings?.encryption;
    return !enc || enc === 'none';
  }
  return inbound.value.protocol === Protocols.TROJAN;
});

function addFallback() {
  inbound.value?.settings?.addFallback?.();
}
function delFallback(idx) {
  inbound.value?.settings?.delFallback?.(idx);
}

// Date / GB bridges (legacy used moment via _expiryTime; we go direct).
const expiryDate = computed({
  get: () => (dbForm.value?.expiryTime > 0 ? dayjs(dbForm.value.expiryTime) : null),
  set: (next) => { if (dbForm.value) dbForm.value.expiryTime = next ? next.valueOf() : 0; },
});
const totalGB = computed({
  get: () => (dbForm.value?.total ? Math.round((dbForm.value.total / SizeFormatter.ONE_GB) * 100) / 100 : 0),
  set: (gb) => { if (dbForm.value) dbForm.value.total = NumberFormatter.toFixed((gb || 0) * SizeFormatter.ONE_GB, 0); },
});

// Client total/expiry bridges (only relevant in add mode for new clients)
const clientExpiryDate = computed({
  get: () => (firstClient.value?.expiryTime > 0 ? dayjs(firstClient.value.expiryTime) : null),
  set: (next) => { if (firstClient.value) firstClient.value.expiryTime = next ? next.valueOf() : 0; },
});
const clientTotalGB = computed({
  get: () => firstClient.value?._totalGB ?? 0,
  set: (gb) => { if (firstClient.value) firstClient.value._totalGB = gb || 0; },
});

// === Open / state management =======================================
function loadFromDbInbound(dbIn) {
  // Round-trip through Inbound.fromJson so subsequent edits get the
  // structured class hierarchy (StreamSettings, TLS, Reality, etc.).
  const parsed = Inbound.fromJson(dbIn.toInbound().toJson());
  inbound.value = parsed;
  // DBForm carries the persisted-fields the parsed Inbound doesn't:
  // remark, enable, total, expiryTime, trafficReset, etc.
  dbForm.value = new DBInbound(dbIn);
  primeAdvancedJson();
}

function makeFreshInbound(proto) {
  const ib = new Inbound();
  ib.protocol = proto;
  ib.settings = Inbound.Settings.getSettings(proto);
  ib.port = RandomUtil.randomInteger(10000, 60000);
  return ib;
}

function freshDbForm() {
  const next = new DBInbound();
  next.enable = true;
  next.remark = '';
  next.total = 0;
  next.expiryTime = 0;
  next.trafficReset = 'never';
  return next;
}

function primeAdvancedJson() {
  if (!inbound.value) return;
  try {
    advancedJson.value.stream = JSON.stringify(JSON.parse(inbound.value.stream.toString()), null, 2);
  } catch (_e) { /* keep prior text */ }
  try {
    advancedJson.value.sniffing = JSON.stringify(JSON.parse(inbound.value.sniffing.toString()), null, 2);
  } catch (_e) { /* keep prior text */ }
  try {
    advancedJson.value.settings = JSON.stringify(JSON.parse(inbound.value.settings.toString()), null, 2);
  } catch (_e) { /* keep prior text */ }
}

watch(() => props.open, (next) => {
  if (!next) return;
  activeSection.value = 'basic';
  if (props.mode === 'edit' && props.dbInbound) {
    loadFromDbInbound(props.dbInbound);
  } else {
    inbound.value = makeFreshInbound(Protocols.VLESS);
    dbForm.value = freshDbForm();
    primeAdvancedJson();
  }
  fetchDefaultCertSettings();
});

// In add mode, switching protocol restamps settings + re-syncs port.
function onProtocolChange(next) {
  if (props.mode === 'edit' || !inbound.value) return;
  inbound.value.protocol = next;
  inbound.value.settings = Inbound.Settings.getSettings(next);
  primeAdvancedJson();
}

function onNetworkChange(next) {
  if (!inbound.value?.stream) return;
  inbound.value.stream.network = next;
  // Mirror legacy streamNetworkChange: clear flow when TLS/Reality
  // become unavailable; reset finalmask.udp when not KCP.
  if (!inbound.value.canEnableTls()) inbound.value.stream.security = 'none';
  if (!inbound.value.canEnableReality()) inbound.value.reality = false;
  if (
    inbound.value.protocol === Protocols.VLESS
    && !inbound.value.canEnableTlsFlow()
    && Array.isArray(inbound.value.settings.vlesses)
  ) {
    inbound.value.settings.vlesses.forEach((c) => { c.flow = ''; });
  }
  if (next !== 'kcp' && inbound.value.stream.finalmask) {
    inbound.value.stream.finalmask.udp = [];
  }
}

// === Random helpers wired to the form's sync icons ==================
function randomEmail(target) {
  if (target) target.email = RandomUtil.randomLowerAndNum(9);
}
function randomUuid(target) {
  if (target) target.id = RandomUtil.randomUUID();
}
function randomPasswordSeq(target, len = 10) {
  if (target) target.password = RandomUtil.randomSeq(len);
}
function randomSSPassword(target) {
  if (target) target.password = RandomUtil.randomShadowsocksPassword(inbound.value.settings.method);
}
function randomAuth(target) {
  if (target) target.auth = RandomUtil.randomSeq(10);
}
function randomSubId(target) {
  if (target) target.subId = RandomUtil.randomLowerAndNum(16);
}
function regenWgKeypair(target) {
  const kp = Wireguard.generateKeypair();
  target.publicKey = kp.publicKey;
  target.privateKey = kp.privateKey;
}
function regenInboundWg() {
  const kp = Wireguard.generateKeypair();
  inbound.value.settings.pubKey = kp.publicKey;
  inbound.value.settings.secretKey = kp.privateKey;
}

// === Reality keygen via existing API =================================
async function genRealityKeypair() {
  saving.value = true;
  try {
    const msg = await HttpUtil.get('/panel/api/server/getNewX25519Cert');
    if (msg?.success) {
      inbound.value.stream.reality.privateKey = msg.obj.privateKey;
      inbound.value.stream.reality.settings.publicKey = msg.obj.publicKey;
    }
  } finally {
    saving.value = false;
  }
}

function clearRealityKeypair() {
  if (!inbound.value?.stream?.reality) return;
  inbound.value.stream.reality.privateKey = '';
  inbound.value.stream.reality.settings.publicKey = '';
}

async function genMldsa65() {
  saving.value = true;
  try {
    const msg = await HttpUtil.get('/panel/api/server/getNewmldsa65');
    if (msg?.success) {
      inbound.value.stream.reality.mldsa65Seed = msg.obj.seed;
      inbound.value.stream.reality.settings.mldsa65Verify = msg.obj.verify;
    }
  } finally {
    saving.value = false;
  }
}

function clearMldsa65() {
  if (!inbound.value?.stream?.reality) return;
  inbound.value.stream.reality.mldsa65Seed = '';
  inbound.value.stream.reality.settings.mldsa65Verify = '';
}

// Reality target/SNI randomizer — only available if the helper is loaded
function randomizeRealityTarget() {
  if (!inbound.value?.stream?.reality) return;
  if (typeof window.getRandomRealityTarget !== 'function') return;
  const t = window.getRandomRealityTarget();
  inbound.value.stream.reality.target = t.target;
  inbound.value.stream.reality.serverNames = t.sni;
}

function randomizeShortIds() {
  if (!inbound.value?.stream?.reality) return;
  inbound.value.stream.reality.shortIds = RandomUtil.randomShortIds();
}

// === ECH cert helpers ================================================
async function getNewEchCert() {
  if (!inbound.value?.stream?.tls) return;
  saving.value = true;
  try {
    const msg = await HttpUtil.post('/panel/api/server/getNewEchCert', {
      sni: inbound.value.stream.tls.sni,
    });
    if (msg?.success) {
      inbound.value.stream.tls.echServerKeys = msg.obj.echServerKeys;
      inbound.value.stream.tls.settings.echConfigList = msg.obj.echConfigList;
    }
  } finally {
    saving.value = false;
  }
}

function clearEchCert() {
  if (!inbound.value?.stream?.tls) return;
  inbound.value.stream.tls.echServerKeys = '';
  inbound.value.stream.tls.settings.echConfigList = '';
}

function setDefaultCertData(idx) {
  if (!inbound.value?.stream?.tls?.certs?.[idx]) return;
  inbound.value.stream.tls.certs[idx].certFile = defaultCert.value;
  inbound.value.stream.tls.certs[idx].keyFile = defaultKey.value;
}

async function fetchDefaultCertSettings() {
  try {
    const msg = await HttpUtil.post('/panel/setting/defaultSettings');
    if (msg?.success && msg.obj) {
      defaultCert.value = msg.obj.defaultCert || '';
      defaultKey.value = msg.obj.defaultKey || '';
    }
  } catch (_e) { /* non-fatal — leave Set Default disabled */ }
}

// === VLESS encryption helpers =======================================
// `xray vlessenc` returns both X25519 and ML-KEM-768 variants every
// call; the user clicks one of two buttons to pick which block goes
// into decryption/encryption.
async function getNewVlessEnc(authLabel) {
  if (!authLabel || !inbound.value?.settings) return;
  saving.value = true;
  try {
    const msg = await HttpUtil.get('/panel/api/server/getNewVlessEnc');
    if (!msg?.success) return;
    const block = (msg.obj?.auths || []).find((a) => a.label === authLabel);
    if (!block) return;
    inbound.value.settings.decryption = block.decryption;
    inbound.value.settings.encryption = block.encryption;
  } finally {
    saving.value = false;
  }
}

function clearVlessEnc() {
  if (!inbound.value?.settings) return;
  inbound.value.settings.decryption = 'none';
  inbound.value.settings.encryption = 'none';
}

// === SS method change tracks legacy semantics =========================
function onSSMethodChange() {
  inbound.value.settings.password = RandomUtil.randomShadowsocksPassword(inbound.value.settings.method);
  if (inbound.value.isSSMultiUser) {
    if (inbound.value.settings.shadowsockses.length === 0) {
      inbound.value.settings.shadowsockses = [new Inbound.ShadowsocksSettings.Shadowsocks()];
    }
    inbound.value.settings.shadowsockses.forEach((c) => {
      c.method = inbound.value.isSS2022 ? '' : inbound.value.settings.method;
      c.password = RandomUtil.randomShadowsocksPassword(inbound.value.settings.method);
    });
  } else {
    inbound.value.settings.shadowsockses = [];
  }
}

// === Submit ==========================================================
function close() {
  emit('update:open', false);
}

async function submit() {
  if (!inbound.value || !dbForm.value) return;
  saving.value = true;
  try {
    // Sniffing tab is structured; stream stays JSON for unsupported
    // transports — both go to wire as serialized JSON.
    let streamSettings;
    let sniffing;
    let settings;
    try {
      streamSettings = canEnableStream.value
        ? JSON.stringify(JSON.parse(advancedJson.value.stream))
        : (inbound.value.stream?.sockopt
          ? JSON.stringify({ sockopt: inbound.value.stream.sockopt.toJson() })
          : '');
    } catch (e) { message.error(uiText(`Stream JSON invalid: ${e.message}`, `传输配置 JSON 无效：${e.message}`)); return; }
    try {
      sniffing = JSON.stringify(JSON.parse(advancedJson.value.sniffing || inbound.value.sniffing.toString()));
    } catch (e) { message.error(uiText(`Sniffing JSON invalid: ${e.message}`, `流量探测 JSON 无效：${e.message}`)); return; }
    try {
      settings = JSON.stringify(JSON.parse(advancedJson.value.settings || inbound.value.settings.toString()));
    } catch (e) { message.error(uiText(`Settings JSON invalid: ${e.message}`, `协议设置 JSON 无效：${e.message}`)); return; }

    // The structured form mutates `inbound.stream` directly when the
    // user edits TCP/WS/gRPC/HTTPUpgrade fields, but if they touched
    // the Advanced JSON tab their edits live there. Keep the JSON tab
    // authoritative — it was populated from the live model on open
    // and watch handlers below sync in either direction.
    const payload = {
      up: dbForm.value.up || 0,
      down: dbForm.value.down || 0,
      total: dbForm.value.total,
      remark: dbForm.value.remark,
      enable: dbForm.value.enable,
      expiryTime: dbForm.value.expiryTime,
      trafficReset: dbForm.value.trafficReset,
      lastTrafficResetTime: dbForm.value.lastTrafficResetTime || 0,
      listen: inbound.value.listen,
      port: inbound.value.port,
      protocol: inbound.value.protocol,
      settings: settings,
      streamSettings: streamSettings,
      sniffing: sniffing,
    };
    // Multi-node deployment: only include nodeId when the user picked a
    // remote node. Sending nodeId=null over qs.stringify becomes an
    // empty form value, which Go's form binding for *int parses as 0
    // — not nil — and we'd then try to look up node id 0 and fail with
    // "record not found". Omitting the key entirely keeps NodeID nil.
    if (dbForm.value.nodeId != null) {
      payload.nodeId = dbForm.value.nodeId;
    }

    const url = props.mode === 'edit'
      ? `/panel/api/inbounds/update/${props.dbInbound.id}`
      : '/panel/api/inbounds/add';
    const msg = await HttpUtil.post(url, payload);
    if (msg?.success) {
      emit('saved');
      close();
    }
  } finally {
    saving.value = false;
  }
}

const title = computed(() =>
  props.mode === 'edit'
    ? t('pages.inbounds.modifyInbound')
    : t('pages.inbounds.addInbound'),
);
const okText = computed(() =>
  props.mode === 'edit' ? t('pages.client.submitEdit') : t('create'),
);

// Whenever the structured form mutates stream / sniffing / settings,
// refresh the matching slice of the Advanced JSON tab so the user
// always sees the live state — flipping a switch in Sniffing or
// editing encryption in Protocol now reflects in Advanced.
watch(
  () => inbound.value && JSON.stringify(inbound.value.stream?.toJson?.() || {}),
  () => {
    if (!inbound.value?.stream) return;
    try {
      advancedJson.value.stream = JSON.stringify(JSON.parse(inbound.value.stream.toString()), null, 2);
    } catch (_e) { /* leave as is */ }
  },
);
watch(
  () => inbound.value && JSON.stringify(inbound.value.sniffing?.toJson?.() || {}),
  () => {
    if (!inbound.value?.sniffing) return;
    try {
      advancedJson.value.sniffing = JSON.stringify(JSON.parse(inbound.value.sniffing.toString()), null, 2);
    } catch (_e) { /* leave as is */ }
  },
);
watch(
  () => inbound.value && JSON.stringify(inbound.value.settings?.toJson?.() || {}),
  () => {
    if (!inbound.value?.settings) return;
    try {
      advancedJson.value.settings = JSON.stringify(JSON.parse(inbound.value.settings.toString()), null, 2);
    } catch (_e) { /* leave as is */ }
  },
);
</script>

<template>
  <a-modal :open="open" :ok-text="okText" :cancel-text="t('close')" :confirm-loading="saving"
    :mask-closable="false" centered :width="640" wrap-class-name="inbound-form-modal"
    root-class-name="inbound-modal-root"
    @ok="submit" @cancel="close">
    <template #title>
      <div class="modal-heading">
        <div class="modal-heading-title">{{ title }}</div>
        <div class="modal-heading-subtitle">
          {{ uiText('Configure inbound access, protocol and connection options', '配置入站访问、协议与连接参数') }}
        </div>
      </div>
    </template>
    <div v-if="inbound && dbForm" class="inbound-form-stack">
      <div class="section-switcher" role="tablist">
        <button
          type="button"
          class="section-switcher-button"
          :class="{ active: activeSection === 'basic' }"
          @click="activeSection = 'basic'"
        >
          <span>{{ uiText('Basic settings', '基础设置') }}</span>
          <small>{{ uiText('All visual configuration', '全部可视化配置') }}</small>
        </button>
        <button
          type="button"
          class="section-switcher-button"
          :class="{ active: activeSection === 'advanced' }"
          @click="activeSection = 'advanced'"
        >
          <span>{{ uiText('Advanced settings', '高级设置') }}</span>
          <small>{{ uiText('Raw configuration JSON', '原始配置 JSON') }}</small>
        </button>
      </div>

      <div v-show="activeSection === 'basic'" class="section-panel">
      <!-- ============================== BASICS ============================== -->
      <section class="inbound-form-section">
        <h3 class="form-section-title">{{ t('pages.xray.basicTemplate') }}</h3>
        <a-form :colon="false" :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }">
          <a-form-item :label="t('enable')">
            <a-switch v-model:checked="dbForm.enable" />
          </a-form-item>
          <a-form-item :label="t('pages.inbounds.remark')">
            <a-input v-model:value="dbForm.remark" />
          </a-form-item>
          <a-form-item :label="t('pages.inbounds.deployTo')">
            <a-select
              v-model:value="dbForm.nodeId"
              :disabled="mode === 'edit'"
              :placeholder="t('pages.inbounds.localPanel')"
              allow-clear
            >
              <a-select-option :value="null">{{ t('pages.inbounds.localPanel') }}</a-select-option>
              <a-select-option
                v-for="n in selectableNodes"
                :key="n.id"
                :value="n.id"
                :disabled="n.status === 'offline'"
              >
                {{ n.name }}{{ n.status === 'offline' ? uiText(' (offline)', '（离线）') : '' }}
              </a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item :label="t('pages.inbounds.protocol')">
            <a-select :value="protocol" :disabled="mode === 'edit'" @change="onProtocolChange">
              <a-select-option v-for="p in PROTOCOLS" :key="p" :value="p">{{ p }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item :label="t('pages.inbounds.address')">
            <a-input v-model:value="inbound.listen" :placeholder="t('pages.inbounds.monitorDesc')" />
          </a-form-item>
          <a-form-item :label="t('pages.inbounds.port')">
            <a-input-number v-model:value="inbound.port" :min="1" :max="65535" />
          </a-form-item>
          <a-form-item>
            <template #label>
              <a-tooltip :title="t('pages.inbounds.meansNoLimit')">{{ t('pages.inbounds.totalFlow') }}</a-tooltip>
            </template>
            <a-input-number v-model:value="totalGB" :min="0" :step="0.1" />
          </a-form-item>
          <a-form-item :label="t('pages.inbounds.periodicTrafficResetTitle')">
            <a-select v-model:value="dbForm.trafficReset">
              <a-select-option v-for="r in TRAFFIC_RESETS" :key="r" :value="r">
                {{ t(`pages.inbounds.periodicTrafficReset.${r}`) }}
              </a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item>
            <template #label>
              <a-tooltip :title="t('pages.inbounds.leaveBlankToNeverExpire')">{{ t('pages.inbounds.expireDate')
              }}</a-tooltip>
            </template>
            <DateTimePicker v-model:value="expiryDate" />
          </a-form-item>
        </a-form>
      </section>

      <!-- ============================== PROTOCOL ============================== -->
      <!-- TUN has no per-protocol form yet (interface/mtu/gateway live in
           settings JSON), so the tab would render empty — hide it until
           a TUN form is added. -->
      <section v-if="protocol !== Protocols.TUN" class="inbound-form-section">
        <h3 class="form-section-title">{{ t('pages.inbounds.protocol') }}</h3>
        <!-- Multi-user inbounds: in add mode embed the first client form,
             in edit mode show a count summary. -->
        <template v-if="isMultiUser">
          <a-collapse v-if="mode === 'add' && firstClient" default-active-key="0">
            <a-collapse-panel key="0" :header="uiText('Client', '客户端')">
              <a-form :colon="false" :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }">
                <a-form-item :label="uiText('Enable', '启用')">
                  <a-switch v-model:checked="firstClient.enable" />
                </a-form-item>
                <a-form-item>
                  <template #label>
                    <a-tooltip :title="uiText('Friendly identifier', '用于识别客户端的名称')">
                      {{ uiText('Email', '邮箱') }}
                      <SyncOutlined class="random-icon" @click="randomEmail(firstClient)" />
                    </a-tooltip>
                  </template>
                  <a-input v-model:value="firstClient.email" />
                </a-form-item>

                <a-form-item v-if="protocol === Protocols.VMESS || protocol === Protocols.VLESS">
                  <template #label>
                    <a-tooltip :title="uiText('Reset to a fresh UUID', '重新生成 UUID')">
                      ID
                      <SyncOutlined class="random-icon" @click="randomUuid(firstClient)" />
                    </a-tooltip>
                  </template>
                  <a-input v-model:value="firstClient.id" />
                </a-form-item>

                <a-form-item v-if="protocol === Protocols.VMESS" :label="uiText('Security', '安全')">
                  <a-select v-model:value="firstClient.security">
                    <a-select-option v-for="k in SECURITY_OPTIONS" :key="k" :value="k">{{ k }}</a-select-option>
                  </a-select>
                </a-form-item>

                <a-form-item v-if="protocol === Protocols.TROJAN || protocol === Protocols.SHADOWSOCKS">
                  <template #label>
                    <a-tooltip :title="uiText('Reset to a fresh random value', '重新生成随机值')">
                      {{ uiText('Password', '密码') }}
                      <SyncOutlined v-if="protocol === Protocols.SHADOWSOCKS" class="random-icon"
                        @click="randomSSPassword(firstClient)" />
                      <SyncOutlined v-else class="random-icon" @click="randomPasswordSeq(firstClient)" />
                    </a-tooltip>
                  </template>
                  <a-input v-model:value="firstClient.password" />
                </a-form-item>

                <a-form-item v-if="protocol === Protocols.HYSTERIA">
                  <template #label>
                    <a-tooltip :title="uiText('Reset', '重新生成')"><span>{{ uiText('Auth password', '认证密码') }}</span>
                      <SyncOutlined class="random-icon" @click="randomAuth(firstClient)" />
                    </a-tooltip>
                  </template>
                  <a-input v-model:value="firstClient.auth" />
                </a-form-item>

                <a-form-item v-if="canEnableTlsFlow" :label="uiText('Flow', '流控')">
                  <a-select v-model:value="firstClient.flow">
                    <a-select-option value="">{{ uiText('none', '无') }}</a-select-option>
                    <a-select-option v-for="k in FLOW_OPTIONS" :key="k" :value="k">{{ k }}</a-select-option>
                  </a-select>
                </a-form-item>

                <a-form-item v-if="protocol === Protocols.VLESS" :label="uiText('Reverse tag', '反向标签')">
                  <a-input v-model:value="firstClient.reverseTag" :placeholder="uiText('Optional reverse tag', '可选的反向标签')" />
                </a-form-item>

                <a-form-item :label="uiText('Subscription', '订阅标识')">
                  <a-input v-model:value="firstClient.subId">
                    <template #addonAfter>
                      <SyncOutlined class="random-icon" @click="randomSubId(firstClient)" />
                    </template>
                  </a-input>
                </a-form-item>

                <a-form-item :label="uiText('Comment', '备注')">
                  <a-input v-model:value="firstClient.comment" />
                </a-form-item>

                <a-form-item :label="uiText('Total traffic (GB)', '总流量（GB）')">
                  <a-input-number v-model:value="clientTotalGB" :min="0" :step="0.1" />
                </a-form-item>

                <a-form-item :label="uiText('Expiry', '到期时间')">
                  <DateTimePicker v-model:value="clientExpiryDate" />
                </a-form-item>
              </a-form>
            </a-collapse-panel>
          </a-collapse>

          <a-collapse v-else>
            <a-collapse-panel key="summary" :header="`${uiText('Clients', '客户端')}：${clientsArray.length}`">
              <table class="client-summary">
                <thead>
                  <tr>
                    <th>{{ uiText('Email', '邮箱') }}</th>
                    <th>{{ protocol === Protocols.TROJAN || protocol === Protocols.SHADOWSOCKS ? uiText('Password', '密码') : (protocol
                      ===
                      Protocols.HYSTERIA ? uiText('Auth', '认证') : 'ID') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(c, idx) in clientsArray" :key="idx">
                    <td>{{ c.email }}</td>
                    <td>{{ c.id || c.password || c.auth }}</td>
                  </tr>
                </tbody>
              </table>
            </a-collapse-panel>
          </a-collapse>
        </template>

        <!-- VLess decryption / encryption -->
        <a-form v-if="protocol === Protocols.VLESS" :colon="false" :label-col="{ sm: { span: 8 } }"
          :wrapper-col="{ sm: { span: 14 } }" class="mt-12">
          <a-form-item :label="uiText('Decryption', '解密')">
            <a-input v-model:value="inbound.settings.decryption" />
          </a-form-item>
          <a-form-item :label="uiText('Encryption', '加密')">
            <a-input v-model:value="inbound.settings.encryption" />
          </a-form-item>
          <a-form-item label=" ">
            <a-space :size="8" wrap>
              <a-button type="primary" :loading="saving" @click="getNewVlessEnc('X25519, not Post-Quantum')">
                X25519
              </a-button>
              <a-button type="primary" :loading="saving" @click="getNewVlessEnc('ML-KEM-768, Post-Quantum')">
                ML-KEM-768
              </a-button>
              <a-button danger @click="clearVlessEnc">{{ uiText('Clear', '清除') }}</a-button>
            </a-space>
          </a-form-item>
        </a-form>

        <!-- Shadowsocks shared fields (method/network/ivCheck) -->
        <a-form v-if="protocol === Protocols.SHADOWSOCKS" :colon="false" :label-col="{ sm: { span: 8 } }"
          :wrapper-col="{ sm: { span: 14 } }" class="mt-12">
          <a-form-item :label="uiText('Encryption method', '加密方式')">
            <a-select v-model:value="inbound.settings.method" @change="onSSMethodChange">
              <a-select-option v-for="(m, k) in SSMethods" :key="k" :value="m">{{ k }}</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item v-if="inbound.isSS2022">
            <template #label>
              {{ uiText('Password', '密码') }}
              <SyncOutlined class="random-icon" @click="randomSSPassword(inbound.settings)" />
            </template>
            <a-input v-model:value="inbound.settings.password" />
          </a-form-item>
          <a-form-item :label="uiText('Network', '网络')">
            <a-select v-model:value="inbound.settings.network" :style="{ width: '120px' }">
              <a-select-option value="tcp,udp">TCP, UDP</a-select-option>
              <a-select-option value="tcp">TCP</a-select-option>
              <a-select-option value="udp">UDP</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item label="ivCheck">
            <a-switch v-model:checked="inbound.settings.ivCheck" />
          </a-form-item>
        </a-form>

        <!-- HTTP / Mixed accounts -->
        <a-form v-if="protocol === Protocols.HTTP || protocol === Protocols.MIXED" :colon="false"
          :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }" class="mt-12">
          <a-form-item :label="uiText('Accounts', '账户')">
            <a-button size="small" @click="protocol === Protocols.HTTP
              ? inbound.settings.addAccount(new Inbound.HttpSettings.HttpAccount())
              : inbound.settings.addAccount(new Inbound.MixedSettings.SocksAccount())">
              <template #icon>
                <PlusOutlined />
              </template>
              {{ uiText('Add', '添加') }}
            </a-button>
          </a-form-item>
          <a-form-item :wrapper-col="{ span: 24 }">
            <a-input-group v-for="(account, idx) in inbound.settings.accounts" :key="idx" compact class="mb-8">
              <a-input :style="{ width: '45%' }" v-model:value="account.user" :placeholder="uiText('Username', '用户名')">
                <template #addonBefore>{{ idx + 1 }}</template>
              </a-input>
              <a-input :style="{ width: '45%' }" v-model:value="account.pass" :placeholder="uiText('Password', '密码')" />
              <a-button @click="inbound.settings.delAccount(idx)">
                <template #icon>
                  <MinusOutlined />
                </template>
              </a-button>
            </a-input-group>
          </a-form-item>
          <a-form-item v-if="protocol === Protocols.HTTP" :label="uiText('Allow transparent', '允许透明代理')">
            <a-switch v-model:checked="inbound.settings.allowTransparent" />
          </a-form-item>
          <template v-if="protocol === Protocols.MIXED">
            <a-form-item :label="uiText('Auth', '认证方式')">
              <a-select v-model:value="inbound.settings.auth">
                <a-select-option value="noauth">noauth</a-select-option>
                <a-select-option value="password">password</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="UDP">
              <a-switch v-model:checked="inbound.settings.udp" />
            </a-form-item>
            <a-form-item v-if="inbound.settings.udp" :label="uiText('UDP IP', 'UDP 地址')">
              <a-input v-model:value="inbound.settings.ip" />
            </a-form-item>
          </template>
        </a-form>

        <!-- Tunnel -->
        <a-form v-if="protocol === Protocols.TUNNEL" :colon="false" :label-col="{ sm: { span: 8 } }"
          :wrapper-col="{ sm: { span: 14 } }" class="mt-12">
          <a-form-item :label="uiText('Address', '地址')">
            <a-input v-model:value="inbound.settings.address" />
          </a-form-item>
          <a-form-item :label="uiText('Destination port', '目标端口')">
            <a-input-number v-model:value="inbound.settings.port" :min="1" :max="65535" />
          </a-form-item>
          <a-form-item :label="uiText('Network', '网络')">
            <a-select v-model:value="inbound.settings.network">
              <a-select-option value="tcp,udp">TCP, UDP</a-select-option>
              <a-select-option value="tcp">TCP</a-select-option>
              <a-select-option value="udp">UDP</a-select-option>
            </a-select>
          </a-form-item>
          <a-form-item :label="uiText('Follow redirect', '跟随重定向')">
            <a-switch v-model:checked="inbound.settings.followRedirect" />
          </a-form-item>
        </a-form>

        <!-- WireGuard -->
        <a-form v-if="protocol === Protocols.WIREGUARD" :colon="false" :label-col="{ sm: { span: 8 } }"
          :wrapper-col="{ sm: { span: 14 } }" class="mt-12">
          <a-form-item>
            <template #label>
              {{ uiText('Secret key', '私钥') }}
              <SyncOutlined class="random-icon" @click="regenInboundWg" />
            </template>
            <a-input v-model:value="inbound.settings.secretKey" />
          </a-form-item>
          <a-form-item :label="uiText('Public key', '公钥')">
            <a-input v-model:value="inbound.settings.pubKey" disabled />
          </a-form-item>
          <a-form-item label="MTU">
            <a-input-number v-model:value="inbound.settings.mtu" />
          </a-form-item>
          <a-form-item :label="uiText('No-kernel TUN', '无内核 TUN')">
            <a-switch v-model:checked="inbound.settings.noKernelTun" />
          </a-form-item>
          <a-form-item :label="uiText('Peers', '对等节点')">
            <a-button size="small" @click="inbound.settings.addPeer()">
              <template #icon>
                <PlusOutlined />
              </template>
              {{ uiText('Add peer', '添加对等节点') }}
            </a-button>
          </a-form-item>
          <div v-for="(peer, idx) in inbound.settings.peers" :key="idx" class="wg-peer">
            <a-divider style="margin: 8px 0">
              {{ uiText('Peer', '对等节点') }} {{ idx + 1 }}
              <DeleteOutlined v-if="inbound.settings.peers.length > 1" class="danger-icon"
                @click="inbound.settings.delPeer(idx)" />
            </a-divider>
            <a-form-item>
              <template #label>
                {{ uiText('Secret key', '私钥') }}
                <SyncOutlined class="random-icon" @click="regenWgKeypair(peer)" />
              </template>
              <a-input v-model:value="peer.privateKey" />
            </a-form-item>
            <a-form-item :label="uiText('Public key', '公钥')">
              <a-input v-model:value="peer.publicKey" />
            </a-form-item>
            <a-form-item label="PSK">
              <a-input v-model:value="peer.psk" />
            </a-form-item>
            <a-form-item :label="uiText('Allowed IPs', '允许的 IP')">
              <a-button size="small" @click="peer.allowedIPs.push('')">
                <template #icon>
                  <PlusOutlined />
                </template>
              </a-button>
              <a-input v-for="(_ip, j) in peer.allowedIPs" :key="j" v-model:value="peer.allowedIPs[j]" class="mt-4">
                <template #addonAfter>
                  <a-button v-if="peer.allowedIPs.length > 1" size="small" @click="peer.allowedIPs.splice(j, 1)">
                    <template #icon>
                      <MinusOutlined />
                    </template>
                  </a-button>
                </template>
              </a-input>
            </a-form-item>
            <a-form-item :label="uiText('Keep-alive', '保持连接')">
              <a-input-number v-model:value="peer.keepAlive" :min="0" />
            </a-form-item>
          </div>
        </a-form>

        <!-- ============== Fallbacks (VLESS/Trojan over TCP) ============== -->
        <template v-if="showFallbacks">
          <a-divider style="margin: 12px 0" />
          <div class="fallbacks-header">
            <a-tooltip
              :title="uiText('Route incoming TLS traffic to a backend when it does not match a valid VLESS/Trojan handshake. Match by SNI, ALPN, and HTTP path; the most precise rule wins. Fallbacks require TCP+TLS transport.', '当传入的 TLS 流量不符合有效的 VLESS/Trojan 握手时，将其转发到后端。可按 SNI、ALPN 和 HTTP 路径匹配，优先使用最精确的规则。回落要求使用 TCP+TLS 传输。')">
              <span class="fallbacks-title">
                {{ uiText('Fallbacks', '回落配置') }} ({{ inbound.settings.fallbacks.length }})
              </span>
            </a-tooltip>
            <a-button type="primary" size="small" @click="addFallback">
              <template #icon>
                <PlusOutlined />
              </template>
              {{ uiText('Add', '添加') }}
            </a-button>
          </div>

          <a-form v-for="(fallback, idx) in inbound.settings.fallbacks" :key="idx" :colon="false"
            :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }">
            <a-divider style="margin: 0">
              {{ uiText('Fallback', '回落') }} {{ idx + 1 }}
              <DeleteOutlined class="danger-icon" @click="delFallback(idx)" />
            </a-divider>

            <a-form-item>
              <template #label>
                <a-tooltip :title="uiText('Match TLS SNI (server name). Leave empty to match any SNI.', '匹配 TLS SNI（服务器名称）。留空表示匹配任意 SNI。')">
                  SNI
                </a-tooltip>
              </template>
              <a-input v-model:value.trim="fallback.name" :placeholder="uiText('any (leave empty)', '任意（留空）')" />
            </a-form-item>

            <a-form-item>
              <template #label>
                <a-tooltip
                  :title="uiText(`Match TLS ALPN. 'any' means no ALPN constraint. Use h2/http/1.1 split when the inbound advertises both.`, '匹配 TLS ALPN。“任意”表示不限制 ALPN；当入站同时声明两者时，可用 h2/http/1.1 分流。')">
                  ALPN
                </a-tooltip>
              </template>
              <a-select v-model:value="fallback.alpn">
                <a-select-option value="">{{ uiText('any', '任意') }}</a-select-option>
                <a-select-option value="h2">h2</a-select-option>
                <a-select-option value="http/1.1">http/1.1</a-select-option>
              </a-select>
            </a-form-item>

            <a-form-item :validate-status="fallback.path && !fallback.path.startsWith('/') ? 'error' : ''"
              :help="fallback.path && !fallback.path.startsWith('/') ? uiText('Path must start with /', '路径必须以 / 开头') : ''">
              <template #label>
                <a-tooltip
                  :title="uiText(`Match the HTTP request path of the first packet. Must start with '/'. Leave empty to match any.`, '匹配首个数据包的 HTTP 请求路径。路径必须以 / 开头，留空表示匹配任意路径。')">
                  {{ uiText('Path', '路径') }}
                </a-tooltip>
              </template>
              <a-input v-model:value.trim="fallback.path" :placeholder="uiText('any (leave empty) or /ws', '任意（留空）或 /ws')" />
            </a-form-item>

            <a-form-item :validate-status="!fallback.dest ? 'error' : ''"
              :help="!fallback.dest ? uiText('Destination is required', '必须填写目标地址') : ''">
              <template #label>
                <a-tooltip
                  :title="uiText('Where matching traffic is forwarded. Accepts a port number (80), an address and port (127.0.0.1:8080), or a Unix socket path (/dev/shm/x.sock or @abstract).', '匹配流量的转发目标。可填写端口（80）、地址和端口（127.0.0.1:8080），或 Unix 套接字路径（/dev/shm/x.sock 或 @abstract）。')">
                  {{ uiText('Destination', '目标地址') }}
                </a-tooltip>
              </template>
              <a-input v-model:value.trim="fallback.dest" placeholder="80 | 127.0.0.1:8080 | /dev/shm/x.sock" />
            </a-form-item>

            <a-form-item>
              <template #label>
                <a-tooltip
                  :title="uiText('PROXY protocol version sent to the destination. Off (0) for plain TCP; v1/v2 preserves the client IP when supported by the backend.', '发送到目标的 PROXY 协议版本。关闭（0）表示普通 TCP；后端支持时可用 v1/v2 保留客户端 IP。')">
                  PROXY
                </a-tooltip>
              </template>
              <a-select v-model:value="fallback.xver">
                <a-select-option :value="0">{{ uiText('Off', '关闭') }}</a-select-option>
                <a-select-option :value="1">v1</a-select-option>
                <a-select-option :value="2">v2</a-select-option>
              </a-select>
            </a-form-item>
          </a-form>
        </template>
      </section>

      <!-- ============================== STREAM ============================== -->
      <section v-if="canEnableStream" class="inbound-form-section">
        <h3 class="form-section-title">{{ uiText('Stream', '传输配置') }}</h3>
        <a-form :colon="false" :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }">
          <a-form-item v-if="protocol !== Protocols.HYSTERIA" :label="uiText('Transmission', '传输方式')">
            <a-select v-model:value="network" :style="{ width: '75%' }">
              <a-select-option value="tcp">TCP (RAW)</a-select-option>
              <a-select-option value="kcp">mKCP</a-select-option>
              <a-select-option value="ws">WebSocket</a-select-option>
              <a-select-option value="grpc">gRPC</a-select-option>
              <a-select-option value="httpupgrade">HTTPUpgrade</a-select-option>
              <a-select-option value="xhttp">XHTTP</a-select-option>
            </a-select>
          </a-form-item>

          <!-- TCP (RAW) — proxy-protocol + optional HTTP camouflage with full request/response editor -->
          <template v-if="network === 'tcp'">
            <a-form-item v-if="canEnableTls" :label="uiText('Proxy Protocol', '代理协议')">
              <a-switch v-model:checked="inbound.stream.tcp.acceptProxyProtocol" />
            </a-form-item>
            <a-form-item :label="`HTTP ${t('camouflage')}`">
              <a-switch :checked="inbound.stream.tcp.type === 'http'"
                @change="(v) => (inbound.stream.tcp.type = v ? 'http' : 'none')" />
            </a-form-item>

            <template v-if="inbound.stream.tcp.type === 'http'">
              <!-- Request -->
              <a-divider :style="{ margin: '0' }">{{ t('pages.inbounds.stream.general.request') }}</a-divider>
              <a-form-item :label="t('pages.inbounds.stream.tcp.version')">
                <a-input v-model:value="inbound.stream.tcp.request.version" />
              </a-form-item>
              <a-form-item :label="t('pages.inbounds.stream.tcp.method')">
                <a-input v-model:value="inbound.stream.tcp.request.method" />
              </a-form-item>
              <a-form-item>
                <template #label>
                  {{ t('pages.inbounds.stream.tcp.path') }}
                  <a-button size="small" :style="{ marginLeft: '6px' }"
                    @click="inbound.stream.tcp.request.addPath('/')">
                    <template #icon>
                      <PlusOutlined />
                    </template>
                  </a-button>
                </template>
                <template v-for="(_p, idx) in inbound.stream.tcp.request.path" :key="`tcp-path-${idx}`">
                  <a-input v-model:value="inbound.stream.tcp.request.path[idx]" class="mb-4">
                    <template #addonAfter>
                      <a-button v-if="inbound.stream.tcp.request.path.length > 1" size="small"
                        @click="inbound.stream.tcp.request.removePath(idx)">
                        <template #icon>
                          <MinusOutlined />
                        </template>
                      </a-button>
                    </template>
                  </a-input>
                </template>
              </a-form-item>
              <a-form-item :label="t('pages.inbounds.stream.tcp.requestHeader')">
                <a-button size="small" @click="inbound.stream.tcp.request.addHeader('Host', '')">
                  <template #icon>
                    <PlusOutlined />
                  </template>
                </a-button>
              </a-form-item>
              <a-form-item v-if="inbound.stream.tcp.request.headers.length > 0" :wrapper-col="{ span: 24 }">
                <a-input-group v-for="(h, idx) in inbound.stream.tcp.request.headers" :key="`tcp-rh-${idx}`" compact
                  class="mb-8">
                  <a-input :style="{ width: '45%' }" v-model:value="h.name"
                    :placeholder="t('pages.inbounds.stream.general.name')">
                    <template #addonBefore>{{ idx + 1 }}</template>
                  </a-input>
                  <a-input :style="{ width: '45%' }" v-model:value="h.value"
                    :placeholder="t('pages.inbounds.stream.general.value')" />
                  <a-button @click="inbound.stream.tcp.request.removeHeader(idx)">
                    <template #icon>
                      <MinusOutlined />
                    </template>
                  </a-button>
                </a-input-group>
              </a-form-item>

              <!-- Response -->
              <a-divider :style="{ margin: '0' }">{{ t('pages.inbounds.stream.general.response') }}</a-divider>
              <a-form-item :label="t('pages.inbounds.stream.tcp.version')">
                <a-input v-model:value="inbound.stream.tcp.response.version" />
              </a-form-item>
              <a-form-item :label="t('pages.inbounds.stream.tcp.status')">
                <a-input v-model:value="inbound.stream.tcp.response.status" />
              </a-form-item>
              <a-form-item :label="t('pages.inbounds.stream.tcp.statusDescription')">
                <a-input v-model:value="inbound.stream.tcp.response.reason" />
              </a-form-item>
              <a-form-item :label="t('pages.inbounds.stream.tcp.responseHeader')">
                <a-button size="small"
                  @click="inbound.stream.tcp.response.addHeader('Content-Type', 'application/octet-stream')">
                  <template #icon>
                    <PlusOutlined />
                  </template>
                </a-button>
              </a-form-item>
              <a-form-item v-if="inbound.stream.tcp.response.headers.length > 0" :wrapper-col="{ span: 24 }">
                <a-input-group v-for="(h, idx) in inbound.stream.tcp.response.headers" :key="`tcp-rsh-${idx}`" compact
                  class="mb-8">
                  <a-input :style="{ width: '45%' }" v-model:value="h.name"
                    :placeholder="t('pages.inbounds.stream.general.name')">
                    <template #addonBefore>{{ idx + 1 }}</template>
                  </a-input>
                  <a-input :style="{ width: '45%' }" v-model:value="h.value"
                    :placeholder="t('pages.inbounds.stream.general.value')" />
                  <a-button @click="inbound.stream.tcp.response.removeHeader(idx)">
                    <template #icon>
                      <MinusOutlined />
                    </template>
                  </a-button>
                </a-input-group>
              </a-form-item>
            </template>
          </template>

          <!-- mKCP -->
          <template v-if="network === 'kcp'">
            <a-form-item label="MTU">
              <a-input-number v-model:value="inbound.stream.kcp.mtu" :min="576" :max="1460" />
            </a-form-item>
            <a-form-item label="TTI (ms)">
              <a-input-number v-model:value="inbound.stream.kcp.tti" :min="10" :max="100" />
            </a-form-item>
            <a-form-item :label="uiText('Uplink (MB/s)', '上行（MB/s）')">
              <a-input-number v-model:value="inbound.stream.kcp.upCap" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('Downlink (MB/s)', '下行（MB/s）')">
              <a-input-number v-model:value="inbound.stream.kcp.downCap" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('CWND Multiplier', 'CWND 倍数')">
              <a-input-number v-model:value="inbound.stream.kcp.cwndMultiplier" :min="1" />
            </a-form-item>
            <a-form-item :label="uiText('Max Sending Window', '最大发送窗口')">
              <a-input-number v-model:value="inbound.stream.kcp.maxSendingWindow" :min="0" />
            </a-form-item>
          </template>

          <!-- WebSocket -->
          <template v-if="network === 'ws'">
            <a-form-item :label="uiText('Proxy Protocol', '代理协议')">
              <a-switch v-model:checked="inbound.stream.ws.acceptProxyProtocol" />
            </a-form-item>
            <a-form-item :label="t('host')">
              <a-input v-model:value="inbound.stream.ws.host" />
            </a-form-item>
            <a-form-item :label="t('path')">
              <a-input v-model:value="inbound.stream.ws.path" />
            </a-form-item>
            <a-form-item :label="uiText('Heartbeat Period', '心跳周期')">
              <a-input-number v-model:value="inbound.stream.ws.heartbeatPeriod" :min="0" />
            </a-form-item>
            <a-form-item :label="t('pages.inbounds.stream.tcp.requestHeader')">
              <a-button size="small" @click="inbound.stream.ws.addHeader('', '')">
                <template #icon>
                  <PlusOutlined />
                </template>
              </a-button>
            </a-form-item>
            <a-form-item v-if="inbound.stream.ws.headers.length > 0" :wrapper-col="{ span: 24 }">
              <a-input-group v-for="(h, idx) in inbound.stream.ws.headers" :key="`ws-h-${idx}`" compact class="mb-8">
                <a-input :style="{ width: '45%' }" v-model:value="h.name"
                  :placeholder="t('pages.inbounds.stream.general.name')">
                  <template #addonBefore>{{ idx + 1 }}</template>
                </a-input>
                <a-input :style="{ width: '45%' }" v-model:value="h.value"
                  :placeholder="t('pages.inbounds.stream.general.value')" />
                <a-button @click="inbound.stream.ws.removeHeader(idx)">
                  <template #icon>
                    <MinusOutlined />
                  </template>
                </a-button>
              </a-input-group>
            </a-form-item>
          </template>

          <!-- gRPC -->
          <template v-if="network === 'grpc'">
            <a-form-item :label="uiText('Service Name', '服务名称')">
              <a-input v-model:value="inbound.stream.grpc.serviceName" />
            </a-form-item>
            <a-form-item :label="uiText('Authority', '授权域名')">
              <a-input v-model:value="inbound.stream.grpc.authority" />
            </a-form-item>
            <a-form-item :label="uiText('Multi Mode', '多路模式')">
              <a-switch v-model:checked="inbound.stream.grpc.multiMode" />
            </a-form-item>
          </template>

          <!-- HTTPUpgrade -->
          <template v-if="network === 'httpupgrade'">
            <a-form-item :label="uiText('Proxy Protocol', '代理协议')">
              <a-switch v-model:checked="inbound.stream.httpupgrade.acceptProxyProtocol" />
            </a-form-item>
            <a-form-item :label="t('host')">
              <a-input v-model:value="inbound.stream.httpupgrade.host" />
            </a-form-item>
            <a-form-item :label="t('path')">
              <a-input v-model:value="inbound.stream.httpupgrade.path" />
            </a-form-item>
            <a-form-item :label="t('pages.inbounds.stream.tcp.requestHeader')">
              <a-button size="small" @click="inbound.stream.httpupgrade.addHeader('', '')">
                <template #icon>
                  <PlusOutlined />
                </template>
              </a-button>
            </a-form-item>
            <a-form-item v-if="inbound.stream.httpupgrade.headers.length > 0" :wrapper-col="{ span: 24 }">
              <a-input-group v-for="(h, idx) in inbound.stream.httpupgrade.headers" :key="`hu-h-${idx}`" compact
                class="mb-8">
                <a-input :style="{ width: '45%' }" v-model:value="h.name"
                  :placeholder="t('pages.inbounds.stream.general.name')">
                  <template #addonBefore>{{ idx + 1 }}</template>
                </a-input>
                <a-input :style="{ width: '45%' }" v-model:value="h.value"
                  :placeholder="t('pages.inbounds.stream.general.value')" />
                <a-button @click="inbound.stream.httpupgrade.removeHeader(idx)">
                  <template #icon>
                    <MinusOutlined />
                  </template>
                </a-button>
              </a-input-group>
            </a-form-item>
          </template>

          <!-- XHTTP -->
          <template v-if="network === 'xhttp'">
            <a-form-item :label="t('host')">
              <a-input v-model:value="inbound.stream.xhttp.host" />
            </a-form-item>
            <a-form-item :label="t('path')">
              <a-input v-model:value="inbound.stream.xhttp.path" />
            </a-form-item>
            <a-form-item :label="t('pages.inbounds.stream.tcp.requestHeader')">
              <a-button size="small" @click="inbound.stream.xhttp.addHeader('', '')">
                <template #icon>
                  <PlusOutlined />
                </template>
              </a-button>
            </a-form-item>
            <a-form-item v-if="inbound.stream.xhttp.headers.length > 0" :wrapper-col="{ span: 24 }">
              <a-input-group v-for="(h, idx) in inbound.stream.xhttp.headers" :key="`xh-h-${idx}`" compact class="mb-8">
                <a-input :style="{ width: '45%' }" v-model:value="h.name"
                  :placeholder="t('pages.inbounds.stream.general.name')">
                  <template #addonBefore>{{ idx + 1 }}</template>
                </a-input>
                <a-input :style="{ width: '45%' }" v-model:value="h.value"
                  :placeholder="t('pages.inbounds.stream.general.value')" />
                <a-button @click="inbound.stream.xhttp.removeHeader(idx)">
                  <template #icon>
                    <MinusOutlined />
                  </template>
                </a-button>
              </a-input-group>
            </a-form-item>
            <a-form-item :label="uiText('Mode', '模式')">
              <a-select v-model:value="inbound.stream.xhttp.mode" :style="{ width: '50%' }">
                <a-select-option v-for="m in MODE_OPTIONS" :key="m" :value="m">{{ m }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item v-if="inbound.stream.xhttp.mode === 'packet-up'" :label="uiText('Max Buffered Upload', '最大缓冲上传数')">
              <a-input-number v-model:value="inbound.stream.xhttp.scMaxBufferedPosts" />
            </a-form-item>
            <a-form-item v-if="inbound.stream.xhttp.mode === 'packet-up'" :label="uiText('Max Upload Size (Byte)', '最大上传大小（字节）')">
              <a-input v-model:value="inbound.stream.xhttp.scMaxEachPostBytes" />
            </a-form-item>
            <a-form-item v-if="inbound.stream.xhttp.mode === 'stream-up'" :label="uiText('Stream-Up Server', '流式上传服务器时间')">
              <a-input v-model:value="inbound.stream.xhttp.scStreamUpServerSecs" />
            </a-form-item>
            <a-form-item :label="uiText('Server Max Header Bytes', '服务器最大请求头字节数')">
              <a-input-number v-model:value="inbound.stream.xhttp.serverMaxHeaderBytes" :min="0"
                :placeholder="uiText('0 (default)', '0（默认）')" />
            </a-form-item>
            <a-form-item :label="uiText('Padding Bytes', '填充字节')">
              <a-input v-model:value="inbound.stream.xhttp.xPaddingBytes" />
            </a-form-item>
            <a-form-item :label="uiText('Padding Obfs Mode', '填充混淆模式')">
              <a-switch v-model:checked="inbound.stream.xhttp.xPaddingObfsMode" />
            </a-form-item>
            <template v-if="inbound.stream.xhttp.xPaddingObfsMode">
              <a-form-item :label="uiText('Padding Key', '填充键名')">
                <a-input v-model:value="inbound.stream.xhttp.xPaddingKey" placeholder="x_padding" />
              </a-form-item>
              <a-form-item :label="uiText('Padding Header', '填充请求头')">
                <a-input v-model:value="inbound.stream.xhttp.xPaddingHeader" placeholder="X-Padding" />
              </a-form-item>
              <a-form-item :label="uiText('Padding Placement', '填充位置')">
                <a-select v-model:value="inbound.stream.xhttp.xPaddingPlacement">
                  <a-select-option value="">{{ uiText('Default (queryInHeader)', '默认（queryInHeader）') }}</a-select-option>
                  <a-select-option value="queryInHeader">queryInHeader</a-select-option>
                  <a-select-option value="header">header</a-select-option>
                  <a-select-option value="cookie">cookie</a-select-option>
                  <a-select-option value="query">query</a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item :label="uiText('Padding Method', '填充方式')">
                <a-select v-model:value="inbound.stream.xhttp.xPaddingMethod">
                  <a-select-option value="">{{ uiText('Default (repeat-x)', '默认（repeat-x）') }}</a-select-option>
                  <a-select-option value="repeat-x">repeat-x</a-select-option>
                  <a-select-option value="tokenish">tokenish</a-select-option>
                </a-select>
              </a-form-item>
            </template>
            <a-form-item :label="uiText('Session Placement', '会话标识位置')">
              <a-select v-model:value="inbound.stream.xhttp.sessionPlacement">
                <a-select-option value="">{{ uiText('Default (path)', '默认（path）') }}</a-select-option>
                <a-select-option value="path">path</a-select-option>
                <a-select-option value="header">header</a-select-option>
                <a-select-option value="cookie">cookie</a-select-option>
                <a-select-option value="query">query</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item
              v-if="inbound.stream.xhttp.sessionPlacement && inbound.stream.xhttp.sessionPlacement !== 'path'"
              :label="uiText('Session Key', '会话键名')">
              <a-input v-model:value="inbound.stream.xhttp.sessionKey" placeholder="x_session" />
            </a-form-item>
            <a-form-item :label="uiText('Sequence Placement', '序列标识位置')">
              <a-select v-model:value="inbound.stream.xhttp.seqPlacement">
                <a-select-option value="">{{ uiText('Default (path)', '默认（path）') }}</a-select-option>
                <a-select-option value="path">path</a-select-option>
                <a-select-option value="header">header</a-select-option>
                <a-select-option value="cookie">cookie</a-select-option>
                <a-select-option value="query">query</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item v-if="inbound.stream.xhttp.seqPlacement && inbound.stream.xhttp.seqPlacement !== 'path'"
              :label="uiText('Sequence Key', '序列键名')">
              <a-input v-model:value="inbound.stream.xhttp.seqKey" placeholder="x_seq" />
            </a-form-item>
            <a-form-item v-if="inbound.stream.xhttp.mode === 'packet-up'" :label="uiText('Uplink Data Placement', '上行数据位置')">
              <a-select v-model:value="inbound.stream.xhttp.uplinkDataPlacement">
                <a-select-option value="">{{ uiText('Default (body)', '默认（body）') }}</a-select-option>
                <a-select-option value="body">body</a-select-option>
                <a-select-option value="header">header</a-select-option>
                <a-select-option value="cookie">cookie</a-select-option>
                <a-select-option value="query">query</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item
              v-if="inbound.stream.xhttp.mode === 'packet-up' && inbound.stream.xhttp.uplinkDataPlacement && inbound.stream.xhttp.uplinkDataPlacement !== 'body'"
              :label="uiText('Uplink Data Key', '上行数据键名')">
              <a-input v-model:value="inbound.stream.xhttp.uplinkDataKey" placeholder="x_data" />
            </a-form-item>
            <a-form-item :label="uiText('No SSE Header', '不发送 SSE 请求头')">
              <a-switch v-model:checked="inbound.stream.xhttp.noSSEHeader" />
            </a-form-item>
          </template>

        </a-form>
      </section>

      <!-- ============================== SECURITY ============================== -->
      <section v-if="canEnableStream" class="inbound-form-section">
        <h3 class="form-section-title">{{ uiText('Security', '安全配置') }}</h3>
        <a-form :colon="false" :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }">
          <a-form-item :label="uiText('Security type', '安全类型')">
            <a-select v-model:value="security" :style="{ width: '75%' }" :disabled="!canEnableTls">
              <a-select-option value="none">none</a-select-option>
              <a-select-option value="tls">tls</a-select-option>
              <a-select-option v-if="canEnableReality" value="reality">reality</a-select-option>
            </a-select>
          </a-form-item>

          <template v-if="security === 'tls' && inbound.stream.tls">
            <a-form-item label="SNI">
              <a-input v-model:value="inbound.stream.tls.sni" placeholder="Server Name Indication" />
            </a-form-item>
            <a-form-item :label="uiText('Cipher Suites', '密码套件')">
              <a-select v-model:value="inbound.stream.tls.cipherSuites">
                <a-select-option value="">{{ uiText('Auto', '自动') }}</a-select-option>
                <a-select-option v-for="[label, val] in CIPHER_SUITES" :key="val" :value="val">{{ label
                }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item :label="uiText('Min/Max Version', '最低/最高版本')">
              <a-input-group compact>
                <a-select v-model:value="inbound.stream.tls.minVersion" :style="{ width: '50%' }">
                  <a-select-option v-for="v in TLS_VERSIONS" :key="v" :value="v">{{ v }}</a-select-option>
                </a-select>
                <a-select v-model:value="inbound.stream.tls.maxVersion" :style="{ width: '50%' }">
                  <a-select-option v-for="v in TLS_VERSIONS" :key="v" :value="v">{{ v }}</a-select-option>
                </a-select>
              </a-input-group>
            </a-form-item>
            <a-form-item label="uTLS">
              <a-select v-model:value="inbound.stream.tls.settings.fingerprint" :style="{ width: '100%' }">
                <a-select-option value="">{{ uiText('None', '无') }}</a-select-option>
                <a-select-option v-for="fp in FINGERPRINTS" :key="fp" :value="fp">{{ fp }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="ALPN">
              <a-select v-model:value="inbound.stream.tls.alpn" mode="multiple" :style="{ width: '100%' }"
                :token-separators="[',']">
                <a-select-option v-for="a in ALPNS" :key="a" :value="a">{{ a }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item :label="uiText('Reject Unknown SNI', '拒绝未知 SNI')">
              <a-switch v-model:checked="inbound.stream.tls.rejectUnknownSni" />
            </a-form-item>
            <a-form-item :label="uiText('Disable System Root', '禁用系统根证书')">
              <a-switch v-model:checked="inbound.stream.tls.disableSystemRoot" />
            </a-form-item>
            <a-form-item :label="uiText('Session Resumption', '会话恢复')">
              <a-switch v-model:checked="inbound.stream.tls.enableSessionResumption" />
            </a-form-item>


            <!-- Cert array — file path or inline content per row -->
            <template v-for="(cert, idx) in inbound.stream.tls.certs" :key="`cert-${idx}`">
              <a-form-item :label="t('certificate')">
                <a-radio-group v-model:value="cert.useFile" button-style="solid">
                  <a-radio-button :value="true">{{ t('pages.inbounds.certificatePath') }}</a-radio-button>
                  <a-radio-button :value="false">{{ t('pages.inbounds.certificateContent') }}</a-radio-button>
                </a-radio-group>
              </a-form-item>
              <a-form-item label=" ">
                <a-space>
                  <a-button v-if="idx === 0" type="primary" size="small" @click="inbound.stream.tls.addCert()">
                    <template #icon>
                      <PlusOutlined />
                    </template>
                  </a-button>
                  <a-button v-if="inbound.stream.tls.certs.length > 1" type="primary" size="small"
                    @click="inbound.stream.tls.removeCert(idx)">
                    <template #icon>
                      <MinusOutlined />
                    </template>
                  </a-button>
                </a-space>
              </a-form-item>
              <template v-if="cert.useFile">
                <a-form-item :label="t('pages.inbounds.publicKey')">
                  <a-input v-model:value="cert.certFile" />
                </a-form-item>
                <a-form-item :label="t('pages.inbounds.privatekey')">
                  <a-input v-model:value="cert.keyFile" />
                </a-form-item>
                <a-form-item label=" ">
                  <a-button type="primary" :disabled="!defaultCert && !defaultKey" @click="setDefaultCertData(idx)">
                    {{ t('pages.inbounds.setDefaultCert') }}
                  </a-button>
                </a-form-item>
              </template>
              <template v-else>
                <a-form-item :label="t('pages.inbounds.publicKey')">
                  <a-textarea v-model:value="cert.cert" :auto-size="{ minRows: 3, maxRows: 8 }" />
                </a-form-item>
                <a-form-item :label="t('pages.inbounds.privatekey')">
                  <a-textarea v-model:value="cert.key" :auto-size="{ minRows: 3, maxRows: 8 }" />
                </a-form-item>
              </template>
              <a-form-item :label="uiText('One Time Loading', '仅加载一次')">
                <a-switch v-model:checked="cert.oneTimeLoading" />
              </a-form-item>
              <a-form-item :label="uiText('Usage Option', '用途选项')">
                <a-select v-model:value="cert.usage" :style="{ width: '50%' }">
                  <a-select-option v-for="u in USAGES" :key="u" :value="u">{{ u }}</a-select-option>
                </a-select>
              </a-form-item>
              <a-form-item v-if="cert.usage === 'issue'" :label="uiText('Build Chain', '构建证书链')">
                <a-switch v-model:checked="cert.buildChain" />
              </a-form-item>
            </template>


            <!-- ECH (Encrypted Client Hello) -->
            <a-form-item label="ECH key">
              <a-input v-model:value="inbound.stream.tls.echServerKeys" />
            </a-form-item>
            <a-form-item label="ECH config">
              <a-input v-model:value="inbound.stream.tls.settings.echConfigList" />
            </a-form-item>
            <a-form-item label=" ">
              <a-space>
                <a-button type="primary" :loading="saving" @click="getNewEchCert">{{ uiText('Get New ECH Cert', '生成新 ECH 证书') }}</a-button>
                <a-button danger @click="clearEchCert">{{ uiText('Clear', '清除') }}</a-button>
              </a-space>
            </a-form-item>
          </template>

          <template v-if="security === 'reality' && inbound.stream.reality">
            <a-form-item :label="uiText('Show', '显示调试信息')">
              <a-switch v-model:checked="inbound.stream.reality.show" />
            </a-form-item>
            <a-form-item label="Xver">
              <a-input-number v-model:value="inbound.stream.reality.xver" :min="0" />
            </a-form-item>
            <a-form-item label="uTLS">
              <a-select v-model:value="inbound.stream.reality.settings.fingerprint" :style="{ width: '100%' }">
                <a-select-option v-for="fp in FINGERPRINTS" :key="fp" :value="fp">{{ fp }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item>
              <template #label>
                {{ uiText('Target', '目标地址') }}
                <SyncOutlined class="random-icon" @click="randomizeRealityTarget" />
              </template>
              <a-input v-model:value="inbound.stream.reality.target" />
            </a-form-item>
            <a-form-item>
              <template #label>
                SNI
                <SyncOutlined class="random-icon" @click="randomizeRealityTarget" />
              </template>
              <a-input v-model:value="inbound.stream.reality.serverNames" />
            </a-form-item>
            <a-form-item :label="uiText('Max Time Diff (ms)', '最大时间差（毫秒）')">
              <a-input-number v-model:value="inbound.stream.reality.maxTimediff" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('Min Client Ver', '最低客户端版本')">
              <a-input v-model:value="inbound.stream.reality.minClientVer" placeholder="25.9.11" />
            </a-form-item>
            <a-form-item :label="uiText('Max Client Ver', '最高客户端版本')">
              <a-input v-model:value="inbound.stream.reality.maxClientVer" placeholder="25.9.11" />
            </a-form-item>
            <a-form-item>
              <template #label>
                {{ uiText('Short IDs', '短 ID') }}
                <SyncOutlined class="random-icon" @click="randomizeShortIds" />
              </template>
              <a-textarea v-model:value="inbound.stream.reality.shortIds" :auto-size="{ minRows: 1, maxRows: 4 }" />
            </a-form-item>
            <a-form-item label="SpiderX">
              <a-input v-model:value="inbound.stream.reality.settings.spiderX" />
            </a-form-item>
            <a-form-item :label="t('pages.inbounds.publicKey')">
              <a-textarea v-model:value="inbound.stream.reality.settings.publicKey"
                :auto-size="{ minRows: 1, maxRows: 4 }" />
            </a-form-item>
            <a-form-item :label="t('pages.inbounds.privatekey')">
              <a-textarea v-model:value="inbound.stream.reality.privateKey" :auto-size="{ minRows: 1, maxRows: 4 }" />
            </a-form-item>
            <a-form-item label=" ">
              <a-space>
                <a-button type="primary" :loading="saving" @click="genRealityKeypair">{{ uiText('Get New Cert', '生成新密钥') }}</a-button>
                <a-button danger @click="clearRealityKeypair">{{ uiText('Clear', '清除') }}</a-button>
              </a-space>
            </a-form-item>
            <a-form-item label="mldsa65 Seed">
              <a-textarea v-model:value="inbound.stream.reality.mldsa65Seed" :auto-size="{ minRows: 2, maxRows: 6 }" />
            </a-form-item>
            <a-form-item label="mldsa65 Verify">
              <a-textarea v-model:value="inbound.stream.reality.settings.mldsa65Verify"
                :auto-size="{ minRows: 2, maxRows: 6 }" />
            </a-form-item>
            <a-form-item label=" ">
              <a-space>
                <a-button type="primary" :loading="saving" @click="genMldsa65">{{ uiText('Get New Seed', '生成新种子') }}</a-button>
                <a-button danger @click="clearMldsa65">{{ uiText('Clear', '清除') }}</a-button>
              </a-space>
            </a-form-item>
          </template>

        </a-form>
      </section>

      <!-- ============================== CONNECTION OPTIONS ============================== -->
      <section v-if="canEnableStream" class="inbound-form-section">
        <h3 class="form-section-title">{{ uiText('Connection options', '连接选项') }}</h3>
        <a-form :colon="false" :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }">
          <!-- ====== External Proxy ====== -->
          <a-form-item :label="uiText('External Proxy', '外部代理')">
            <a-switch v-model:checked="externalProxy" />
            <a-button v-if="externalProxy" size="small" type="primary" :style="{ marginLeft: '10px' }"
              @click="inbound.stream.externalProxy.push({ forceTls: 'same', dest: '', port: 443, remark: '' })">
              <template #icon>
                <PlusOutlined />
              </template>
            </a-button>
          </a-form-item>
          <a-form-item v-if="externalProxy" :wrapper-col="{ span: 24 }">
            <a-input-group v-for="(row, idx) in inbound.stream.externalProxy" :key="`ep-${idx}`" compact
              :style="{ margin: '8px 0' }">
              <a-tooltip :title="uiText('Force TLS', '强制 TLS')">
                <a-select v-model:value="row.forceTls" :style="{ width: '20%' }">
                  <a-select-option value="same">{{ t('pages.inbounds.same') }}</a-select-option>
                  <a-select-option value="none">{{ t('none') }}</a-select-option>
                  <a-select-option value="tls">TLS</a-select-option>
                </a-select>
              </a-tooltip>
              <a-input v-model:value="row.dest" :style="{ width: '30%' }" :placeholder="t('host')" />
              <a-tooltip :title="t('pages.inbounds.port')">
                <a-input-number v-model:value="row.port" :style="{ width: '15%' }" :min="1" :max="65535" />
              </a-tooltip>
              <a-input v-model:value="row.remark" :style="{ width: '35%' }" :placeholder="t('pages.inbounds.remark')">
                <template #addonAfter>
                  <MinusOutlined @click="inbound.stream.externalProxy.splice(idx, 1)" />
                </template>
              </a-input>
            </a-input-group>
          </a-form-item>

          <!-- ====== Sockopt ====== -->
          <a-form-item :label="uiText('Sockopt', '套接字选项')">
            <a-switch v-model:checked="inbound.stream.sockoptSwitch" />
          </a-form-item>
          <template v-if="inbound.stream.sockoptSwitch && inbound.stream.sockopt">
            <a-form-item :label="uiText('Route Mark', '路由标记')">
              <a-input-number v-model:value="inbound.stream.sockopt.mark" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('TCP Keep Alive Interval', 'TCP 保活间隔')">
              <a-input-number v-model:value="inbound.stream.sockopt.tcpKeepAliveInterval" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('TCP Keep Alive Idle', 'TCP 保活空闲时间')">
              <a-input-number v-model:value="inbound.stream.sockopt.tcpKeepAliveIdle" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('TCP Max Seg', 'TCP 最大报文段')">
              <a-input-number v-model:value="inbound.stream.sockopt.tcpMaxSeg" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('TCP User Timeout', 'TCP 用户超时')">
              <a-input-number v-model:value="inbound.stream.sockopt.tcpUserTimeout" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('TCP Window Clamp', 'TCP 窗口限制')">
              <a-input-number v-model:value="inbound.stream.sockopt.tcpWindowClamp" :min="0" />
            </a-form-item>
            <a-form-item :label="uiText('Proxy Protocol', '代理协议')">
              <a-switch v-model:checked="inbound.stream.sockopt.acceptProxyProtocol" />
            </a-form-item>
            <a-form-item :label="uiText('TCP Fast Open', 'TCP 快速打开')">
              <a-switch v-model:checked="inbound.stream.sockopt.tcpFastOpen" />
            </a-form-item>
            <a-form-item :label="uiText('Multipath TCP', '多路径 TCP')">
              <a-switch v-model:checked="inbound.stream.sockopt.tcpMptcp" />
            </a-form-item>
            <a-form-item :label="uiText('Penetrate', '穿透')">
              <a-switch v-model:checked="inbound.stream.sockopt.penetrate" />
            </a-form-item>
            <a-form-item :label="uiText('V6 Only', '仅 IPv6')">
              <a-switch v-model:checked="inbound.stream.sockopt.V6Only" />
            </a-form-item>
            <a-form-item :label="uiText('Domain Strategy', '域名解析策略')">
              <a-select v-model:value="inbound.stream.sockopt.domainStrategy" :style="{ width: '50%' }">
                <a-select-option v-for="d in DOMAIN_STRATEGIES" :key="d" :value="d">{{ d }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item :label="uiText('TCP Congestion', 'TCP 拥塞控制')">
              <a-select v-model:value="inbound.stream.sockopt.tcpcongestion" :style="{ width: '50%' }">
                <a-select-option v-for="c in TCP_CONGESTIONS" :key="c" :value="c">{{ c }}</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item label="TProxy">
              <a-select v-model:value="inbound.stream.sockopt.tproxy" :style="{ width: '50%' }">
                <a-select-option value="off">{{ uiText('Off', '关闭') }}</a-select-option>
                <a-select-option value="redirect">{{ uiText('Redirect', '重定向') }}</a-select-option>
                <a-select-option value="tproxy">TProxy</a-select-option>
              </a-select>
            </a-form-item>
            <a-form-item :label="uiText('Dialer Proxy', '拨号代理')">
              <a-input v-model:value="inbound.stream.sockopt.dialerProxy" />
            </a-form-item>
            <a-form-item :label="uiText('Interface Name', '网卡名称')">
              <a-input v-model:value="inbound.stream.sockopt.interfaceName" />
            </a-form-item>
            <a-form-item :label="uiText('Trusted X-Forwarded-For', '可信 X-Forwarded-For')">
              <a-select v-model:value="inbound.stream.sockopt.trustedXForwardedFor" mode="tags"
                :style="{ width: '100%' }" :token-separators="[',']">
                <a-select-option value="CF-Connecting-IP">CF-Connecting-IP</a-select-option>
                <a-select-option value="X-Real-IP">X-Real-IP</a-select-option>
                <a-select-option value="True-Client-IP">True-Client-IP</a-select-option>
                <a-select-option value="X-Client-IP">X-Client-IP</a-select-option>
              </a-select>
            </a-form-item>
          </template>
        </a-form>

        <!-- ====== FinalMask (TCP/UDP masks + QUIC params) ====== -->
        <FinalMaskForm :stream="inbound.stream" :protocol="protocol" />
      </section>

      <!-- ============================== SNIFFING ============================== -->
      <section class="inbound-form-section">
        <h3 class="form-section-title">{{ uiText('Sniffing', '流量探测') }}</h3>
        <a-form :colon="false" :label-col="{ sm: { span: 8 } }" :wrapper-col="{ sm: { span: 14 } }">
          <a-form-item :label="uiText('Enabled', '启用')">
            <a-switch v-model:checked="inbound.sniffing.enabled" />
          </a-form-item>
          <template v-if="inbound.sniffing.enabled">
            <a-form-item :wrapper-col="{ span: 24 }">
              <a-checkbox-group v-model:value="inbound.sniffing.destOverride">
                <a-checkbox v-for="(value, key) in SNIFFING_OPTION" :key="key" :value="value">{{ key }}</a-checkbox>
              </a-checkbox-group>
            </a-form-item>
            <a-form-item :label="uiText('Metadata only', '仅元数据')">
              <a-switch v-model:checked="inbound.sniffing.metadataOnly" />
            </a-form-item>
            <a-form-item :label="uiText('Route only', '仅路由')">
              <a-switch v-model:checked="inbound.sniffing.routeOnly" />
            </a-form-item>
            <a-form-item :label="uiText('IPs excluded', '排除的 IP')">
              <a-select v-model:value="inbound.sniffing.ipsExcluded" mode="tags" :token-separators="[',']"
                placeholder="IP/CIDR/geoip:*/ext:*" :style="{ width: '100%' }" />
            </a-form-item>
            <a-form-item :label="uiText('Domains excluded', '排除的域名')">
              <a-select v-model:value="inbound.sniffing.domainsExcluded" mode="tags" :token-separators="[',']"
                placeholder="domain:*/ext:*" :style="{ width: '100%' }" />
            </a-form-item>
          </template>
        </a-form>
      </section>

      </div>

      <div v-show="activeSection === 'advanced'" class="section-panel section-panel-advanced">
      <!-- ============================== ADVANCED ============================== -->
      <section class="inbound-form-section">
        <h3 class="form-section-title">{{ t('pages.xray.advancedTemplate') }}</h3>
        <a-alert type="info" show-icon
          :message="uiText('Edit raw stream JSON to access advanced fields we do not yet expose through the form.', '可在此编辑原始 JSON，以配置表单尚未提供的高级字段。')"
          class="mb-12" />
        <a-form layout="vertical">
          <a-form-item :label="uiText('settings (clients, encryption, fallbacks, ...)', 'settings（客户端、加密、回落等）')">
            <a-textarea v-model:value="advancedJson.settings" :auto-size="{ minRows: 10, maxRows: 24 }"
              spellcheck="false" class="json-editor" />
          </a-form-item>
          <a-form-item label="streamSettings">
            <a-textarea v-model:value="advancedJson.stream" :auto-size="{ minRows: 10, maxRows: 24 }" spellcheck="false"
              class="json-editor" />
          </a-form-item>
          <a-form-item :label="uiText('sniffing (overrides the structured fields when set)', 'sniffing（填写后覆盖上方流量探测配置）')">
            <a-textarea v-model:value="advancedJson.sniffing" :auto-size="{ minRows: 6, maxRows: 16 }"
              spellcheck="false" class="json-editor" />
          </a-form-item>
        </a-form>
      </section>
      </div>
    </div>
  </a-modal>
</template>

<style scoped>
.mt-4 {
  margin-top: 4px;
}

.mt-8 {
  margin-top: 8px;
}

.mt-12 {
  margin-top: 12px;
}

.mb-4 {
  margin-bottom: 4px;
}

.mb-8 {
  margin-bottom: 8px;
}

.mb-12 {
  margin-bottom: 12px;
}

.random-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 5px;
  cursor: pointer;
  color: var(--xui-primary, #1677ff);
  transition: color 0.16s ease, transform 0.16s ease;
}

.random-icon:hover {
  color: #69a7ff;
  transform: rotate(45deg);
}

.danger-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 7px;
  cursor: pointer;
  color: var(--xui-danger, #ff4d4f);
  transition: color 0.16s ease, transform 0.16s ease;
}

.danger-icon:hover {
  color: #ff7875;
  transform: scale(1.08);
}

.json-editor {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
}

.client-summary {
  width: 100%;
  overflow: hidden;
  border-collapse: collapse;
  border: 1px solid var(--xui-border);
  border-radius: 7px;
  background: var(--xui-surface-2);
}

.client-summary th,
.client-summary td {
  padding: 9px 12px;
  text-align: left;
  border-bottom: 1px solid var(--xui-border);
  word-break: break-word;
}

.client-summary th {
  color: var(--xui-text-muted);
  font-size: 11px;
  font-weight: 700;
}

.client-summary td {
  color: var(--xui-text);
  font-size: 12px;
}

.client-summary tbody tr:last-child td {
  border-bottom: 0;
}

.fallbacks-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 10px 0 12px;
  padding: 10px 12px;
  border: 1px solid var(--xui-border);
  border-radius: 7px;
  background: var(--xui-surface-2);
}

.fallbacks-title {
  font-weight: 500;
  flex: 1;
}

.wg-peer {
  margin-top: 10px;
  padding: 0 14px 6px;
  border: 1px solid var(--xui-border);
  border-radius: 7px;
  background: var(--xui-surface-2);
}

.section-heading {
  font-weight: 500;
  margin: 12px 0 6px;
  opacity: 0.85;
}

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

.section-switcher {
  position: sticky;
  z-index: 5;
  top: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  width: 100%;
  margin: 0 auto 16px;
  padding: 6px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 11px;
  background: rgba(14, 16, 23, 0.94);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
  backdrop-filter: blur(12px);
}

.section-switcher-button {
  display: flex;
  min-width: 0;
  min-height: 54px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #94a3b8;
  background: transparent;
  cursor: pointer;
  transition: border-color 0.16s ease, color 0.16s ease, background 0.16s ease, box-shadow 0.16s ease;
}

.section-switcher-button:hover {
  color: #cbd5e1;
  background: rgba(255, 255, 255, 0.035);
}

.section-switcher-button.active {
  border-color: rgba(99, 102, 241, 0.35);
  color: #eef2ff;
  background: rgba(99, 102, 241, 0.16);
  box-shadow: 0 5px 16px rgba(99, 102, 241, 0.12);
}

.section-switcher-button span {
  font-size: 13px;
  font-weight: 650;
}

.section-switcher-button small {
  margin-top: 2px;
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-switcher-button.active small {
  color: #a5b4fc;
}

.section-panel {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 14px;
}

.section-panel-advanced .inbound-form-section {
  padding-bottom: 18px;
}

.inbound-form-stack {
  width: 100%;
  padding: 20px 22px 28px;
  background: #0e1017;
}

.inbound-form-section {
  width: 100%;
  max-width: none;
  margin: 0 auto;
  padding: 18px 18px 5px;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
  background: rgba(18, 20, 28, 0.92);
  box-shadow: 0 8px 26px rgba(0, 0, 0, 0.16);
}

.inbound-form-section + .inbound-form-section {
  padding-top: 18px;
}

.inbound-form-section:last-child {
  padding-bottom: 5px;
}

.form-section-title {
  margin: 0 0 17px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  color: #f1f5f9;
  font-size: 13px;
  font-weight: 650;
}

.inbound-form-stack :deep(.ant-form) {
  width: 100%;
  max-width: none;
  margin: 0 auto;
}

.inbound-form-stack :deep(.ant-form-item) {
  margin-bottom: 14px;
}

.inbound-form-stack :deep(.ant-form-item-label > label) {
  color: #94a3b8;
  font-size: 12.5px;
  font-weight: 500;
}

.inbound-form-stack :deep(.ant-input),
.inbound-form-stack :deep(.ant-input-affix-wrapper),
.inbound-form-stack :deep(.ant-input-number),
.inbound-form-stack :deep(.ant-input-number-input),
.inbound-form-stack :deep(.ant-picker),
.inbound-form-stack :deep(.ant-select-selector) {
  color: #e2e8f0 !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  border-radius: 8px !important;
  background: rgba(255, 255, 255, 0.035) !important;
  box-shadow: none !important;
}

.inbound-form-stack :deep(.ant-input:hover),
.inbound-form-stack :deep(.ant-input-affix-wrapper:hover),
.inbound-form-stack :deep(.ant-input-number:hover),
.inbound-form-stack :deep(.ant-picker:hover),
.inbound-form-stack :deep(.ant-select:not(.ant-select-disabled):hover .ant-select-selector) {
  border-color: rgba(99, 102, 241, 0.42) !important;
}

.inbound-form-stack :deep(.ant-input:focus),
.inbound-form-stack :deep(.ant-input-affix-wrapper-focused),
.inbound-form-stack :deep(.ant-input-number-focused),
.inbound-form-stack :deep(.ant-picker-focused),
.inbound-form-stack :deep(.ant-select-focused .ant-select-selector) {
  border-color: rgba(99, 102, 241, 0.62) !important;
  background: rgba(99, 102, 241, 0.055) !important;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.11) !important;
}

.inbound-form-stack :deep(.ant-input),
.inbound-form-stack :deep(.ant-input-affix-wrapper),
.inbound-form-stack :deep(.ant-input-number),
.inbound-form-stack :deep(.ant-picker),
.inbound-form-stack :deep(.ant-select) {
  max-width: 100%;
}

.inbound-form-stack :deep(.ant-input-number) {
  width: 100%;
}

.inbound-form-stack :deep(.ant-divider) {
  margin: 16px 0;
  color: var(--xui-text-muted);
  border-color: var(--xui-border);
  font-size: 11px;
  font-weight: 700;
}

.inbound-form-stack :deep(.ant-collapse) {
  max-width: 820px;
  margin: 0 auto 14px;
  overflow: hidden;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
}

.inbound-form-stack :deep(.ant-collapse-item) {
  border-bottom-color: var(--xui-border);
}

.inbound-form-stack :deep(.ant-collapse-header) {
  min-height: 48px;
  align-items: center !important;
  padding: 13px 16px !important;
  color: var(--xui-text-strong) !important;
  font-size: 12px;
  font-weight: 700;
  background: var(--xui-surface-2);
}

.inbound-form-stack :deep(.ant-collapse-content) {
  border-top-color: var(--xui-border);
  background: var(--xui-surface);
}

.inbound-form-stack :deep(.ant-collapse-content-box) {
  padding: 16px 16px 2px;
}

.inbound-form-stack :deep(.ant-alert) {
  max-width: 820px;
  margin-right: auto;
  margin-left: auto;
  border: 1px solid var(--xui-border);
  border-radius: 7px;
}

.inbound-form-stack :deep(textarea.json-editor) {
  resize: vertical;
  color: var(--xui-text);
  border-color: var(--xui-border);
  background: var(--xui-surface-2);
}

.inbound-form-stack :deep(.ant-checkbox-group) {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 12px;
  border: 1px solid var(--xui-border);
  border-radius: 7px;
  background: var(--xui-surface-2);
}

:global(.inbound-form-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  background: #0e1017;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(99, 102, 241, 0.06);
}

:global(.inbound-form-modal .ant-modal-header) {
  margin: 0;
  padding: 18px 22px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  background: #0e1017;
}

:global(.inbound-form-modal .ant-modal-title) {
  color: var(--xui-text-strong);
  font-size: 15px;
  font-weight: 750;
}

:global(.inbound-form-modal .ant-modal-close) {
  top: 14px;
  right: 14px;
  color: #64748b;
  border-radius: 8px;
}

:global(.inbound-form-modal .ant-modal-body) {
  max-height: min(74vh, 760px);
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: #0e1017;
}

:global(.inbound-form-modal .ant-modal-footer) {
  margin: 0;
  padding: 16px 22px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  background: rgba(0, 0, 0, 0.2);
}

:global(.inbound-form-modal .ant-modal-footer .ant-btn) {
  min-width: 84px;
  height: 36px;
  border-radius: 8px;
}

:global(.inbound-form-modal .ant-modal-footer .ant-btn-primary) {
  border-color: #6366f1;
  background: #6366f1;
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.35);
}

:global(.inbound-modal-root .ant-modal-mask) {
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
}

:global(.inbound-form-modal .ant-modal) {
  padding-bottom: 0;
}

@media (max-width: 768px) {
  .inbound-form-stack {
    min-height: 440px;
    padding: 14px 12px 24px;
  }

  .section-switcher-button {
    align-items: center;
    padding: 8px;
    text-align: center;
  }

  .section-switcher-button small {
    white-space: normal;
  }

  .inbound-form-section {
    padding-right: 12px;
    padding-left: 12px;
  }

  .inbound-form-stack :deep(.ant-form-item) {
    margin-bottom: 13px;
  }

  .inbound-form-stack :deep(.ant-form-item-row) {
    display: block;
  }

  .inbound-form-stack :deep(.ant-form-item-label),
  .inbound-form-stack :deep(.ant-form-item-control) {
    flex: 0 0 100%;
    max-width: 100%;
  }

  .inbound-form-stack :deep(.ant-form-item-label) {
    padding: 0 0 5px;
    text-align: left;
  }

  .inbound-form-stack :deep(.ant-select),
  .inbound-form-stack :deep(.ant-picker),
  .inbound-form-stack :deep(.ant-input-number) {
    width: 100% !important;
  }

  .inbound-form-stack :deep(.ant-input-group.ant-input-group-compact) {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .inbound-form-stack :deep(.ant-input-group.ant-input-group-compact > *) {
    width: 100% !important;
    border-radius: 6px !important;
  }

  .inbound-form-stack :deep(.ant-space) {
    flex-wrap: wrap;
  }

  .wg-peer {
    padding-right: 10px;
    padding-left: 10px;
  }

  :global(.inbound-form-modal .ant-modal) {
    padding-bottom: 12px;
  }

  :global(.inbound-form-modal .ant-modal-header) {
    padding: 15px 16px;
  }

  :global(.inbound-form-modal .ant-modal-body) {
    max-height: calc(100vh - 148px);
  }

  :global(.inbound-form-modal .ant-modal-footer) {
    display: flex;
    padding: 11px 14px;
  }

  :global(.inbound-form-modal .ant-modal-footer .ant-btn) {
    flex: 1;
    min-width: 0;
  }
}
</style>
