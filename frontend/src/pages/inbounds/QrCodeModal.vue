<script setup>
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

import { Protocols } from '@/models/inbound.js';
import QrPanel from './QrPanel.vue';

const { t } = useI18n();

// QR-only modal for inbound-level and per-client share actions.

const props = defineProps({
  open: { type: Boolean, default: false },
  dbInbound: { type: Object, default: null },
  client: { type: Object, default: null },
  remarkModel: { type: String, default: '-ieo' },
  // Address of the node hosting this inbound (empty string for local).
  // When set, share/QR links use it as the host instead of the panel's
  // origin — node-managed inbounds proxy from the node, not the panel.
  nodeAddress: { type: String, default: '' },
});

const emit = defineEmits(['update:open']);

const links = ref([]);
const wireguardConfigs = ref([]);
const wireguardLinks = ref([]);

watch(() => props.open, (next) => {
  if (!next || !props.dbInbound) return;
  const inbound = props.dbInbound.toInbound();
  if (inbound.protocol === Protocols.WIREGUARD) {
    const peerRemark = props.client?.email
      ? `${props.dbInbound.remark}-${props.client.email}`
      : props.dbInbound.remark;
    wireguardConfigs.value = inbound.genWireguardConfigs(peerRemark, '-ieo', props.nodeAddress).split('\r\n');
    wireguardLinks.value = inbound.genWireguardLinks(peerRemark, '-ieo', props.nodeAddress).split('\r\n');
    links.value = [];
  } else {
    const clients = Array.isArray(inbound.clients) ? inbound.clients : [];
    if (props.client) {
      links.value = inbound.genAllLinks(
        props.dbInbound.remark,
        props.remarkModel,
        props.client,
        props.nodeAddress,
      );
    } else if (props.dbInbound.isMultiUser()) {
      links.value = clients.flatMap((client) => inbound.genAllLinks(
        props.dbInbound.remark,
        props.remarkModel,
        client,
        props.nodeAddress,
      ));
    } else {
      links.value = inbound.genAllLinks(
        props.dbInbound.remark,
        props.remarkModel,
        null,
        props.nodeAddress,
      );
    }
    wireguardConfigs.value = [];
    wireguardLinks.value = [];
  }
});

function close() {
  emit('update:open', false);
}
</script>

<template>
  <a-modal :open="open" :title="t('qrCode')" :footer="null" width="min(460px, calc(100vw - 32px))"
    wrap-class-name="qr-code-modal" @cancel="close">
    <div v-if="dbInbound" class="qr-list">
      <QrPanel v-for="(link, idx) in links" :key="`l${idx}`" :value="link.link"
        :remark="link.remark || `Link ${idx + 1}`" />
      <template v-for="(cfg, idx) in wireguardConfigs" :key="`w${idx}`">
        <QrPanel :value="cfg" :remark="`Peer ${idx + 1} config`" :download-name="`peer-${idx + 1}.conf`" />
        <QrPanel v-if="wireguardLinks[idx]" :value="wireguardLinks[idx]" :remark="`Peer ${idx + 1} link`" />
      </template>
    </div>
  </a-modal>
</template>

<style scoped>
.qr-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.qr-list :deep(.qr-panel) {
  margin-bottom: 0;
}

:global(.qr-code-modal .ant-modal-content) {
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--xui-border);
  border-radius: 8px;
  background: var(--xui-surface);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.34);
}

:global(.qr-code-modal .ant-modal-header) {
  margin: 0;
  padding: 17px 20px;
  border-bottom: 1px solid var(--xui-border);
  background: var(--xui-surface);
}

:global(.qr-code-modal .ant-modal-title) {
  font-size: 15px;
  font-weight: 750;
}

:global(.qr-code-modal .ant-modal-body) {
  max-height: min(75vh, 760px);
  padding: 16px;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--xui-bg);
}

@media (max-width: 576px) {
  :global(.qr-code-modal .ant-modal) {
    top: 12px;
    padding-bottom: 12px;
  }

  :global(.qr-code-modal .ant-modal-body) {
    max-height: calc(100vh - 82px);
    padding: 12px;
  }
}
</style>
