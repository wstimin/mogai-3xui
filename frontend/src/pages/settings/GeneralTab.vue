<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

import { HttpUtil, LanguageManager } from '@/utils';
import SettingListItem from '@/components/SettingListItem.vue';

const { t } = useI18n();

const props = defineProps({
  // Reactive AllSetting instance shared with the parent page.
  allSetting: { type: Object, required: true },
});

// Remark model — legacy stores it as a single string where index 0 is
// the separator char and the rest is the order of model keys
// (i=Inbound, e=Email, o=Other). Surface it as two v-models that read
// and write the underlying string.
const remarkModels = computed(() => ({
  i: t('pages.settings.remarkParts.inbound'),
  e: t('pages.settings.remarkParts.email'),
  o: t('pages.settings.remarkParts.misc'),
}));
const remarkSeparators = [' ', '-', '_', '@', ':', '~', '|', ',', '.', '/'];

const remarkModel = computed({
  get: () => {
    const rm = props.allSetting.remarkModel || '';
    return rm.length > 1 ? rm.substring(1).split('') : [];
  },
  set: (value) => {
    const sep = (props.allSetting.remarkModel || '-').charAt(0);
    props.allSetting.remarkModel = sep + value.join('');
  },
});

const remarkSeparator = computed({
  get: () => {
    const rm = props.allSetting.remarkModel || '-';
    return rm.length > 1 ? rm.charAt(0) : '-';
  },
  set: (value) => {
    const tail = (props.allSetting.remarkModel || '-').substring(1);
    props.allSetting.remarkModel = value + tail;
  },
});

const remarkSample = computed(() => {
  const parts = remarkModel.value.map((key) => remarkModels.value[key]);
  return parts.length === 0 ? '' : parts.join(remarkSeparator.value);
});

const datepicker = computed({
  get: () => props.allSetting.datepicker || 'gregorian',
  set: (value) => { props.allSetting.datepicker = value; },
});

const datepickerList = computed(() => [
  { name: t('pages.settings.calendars.gregorian'), value: 'gregorian' },
  { name: t('pages.settings.calendars.jalalian'), value: 'jalalian' },
]);

// Language is stored client-side in a cookie, NOT in AllSetting. The
// legacy panel reloads on change so the Go side renders templates in
// the new language.
const lang = ref(LanguageManager.getLanguage());
function onLangChange() {
  LanguageManager.setLanguage(lang.value);
}

// LDAP inbound tags are CSV on the wire; expose as an array so the
// multi-select v-model works directly.
const ldapInboundTagList = computed({
  get: () => {
    const csv = props.allSetting.ldapInboundTags || '';
    return csv.length ? csv.split(',').map((s) => s.trim()).filter(Boolean) : [];
  },
  set: (list) => {
    props.allSetting.ldapInboundTags = Array.isArray(list) ? list.join(',') : '';
  },
});

const inboundOptions = ref([]);
async function loadInboundTags() {
  const msg = await HttpUtil.get('/panel/api/inbounds/list');
  if (msg?.success && Array.isArray(msg.obj)) {
    inboundOptions.value = msg.obj.map((ib) => ({
      label: `${ib.tag} (${ib.protocol}@${ib.port})`,
      value: ib.tag,
    }));
  } else {
    inboundOptions.value = [];
  }
}

onMounted(loadInboundTags);
</script>

<template>
  <a-collapse default-active-key="1">
    <a-collapse-panel key="1" :header="t('pages.settings.panelSettings')">
      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.remarkModel') }}</template>
        <template #description>{{ t('pages.settings.sampleRemark') }}: <i>#{{ remarkSample }}</i></template>
        <template #control>
          <a-input-group :style="{ width: '100%' }">
            <a-select v-model:value="remarkModel" mode="multiple"
              :style="{ paddingRight: '.5rem', minWidth: '80%', width: 'auto' }">
              <a-select-option v-for="(label, key) in remarkModels" :key="key" :value="key">
                {{ label }}
              </a-select-option>
            </a-select>
            <a-select v-model:value="remarkSeparator" :style="{ width: '20%' }">
              <a-select-option v-for="sep in remarkSeparators" :key="sep" :value="sep">{{ sep }}</a-select-option>
            </a-select>
          </a-input-group>
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.panelListeningIP') }}</template>
        <template #description>{{ t('pages.settings.panelListeningIPDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.webListen" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.panelListeningDomain') }}</template>
        <template #description>{{ t('pages.settings.panelListeningDomainDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.webDomain" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.panelPort') }}</template>
        <template #description>{{ t('pages.settings.panelPortDesc') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.webPort" :min="1" :max="65535" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.panelUrlPath') }}</template>
        <template #description>{{ t('pages.settings.panelUrlPathDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.webBasePath" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.sessionMaxAge') }}</template>
        <template #description>{{ t('pages.settings.sessionMaxAgeDesc') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.sessionMaxAge" :min="60" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.pageSize') }}</template>
        <template #description>{{ t('pages.settings.pageSizeDesc') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.pageSize" :min="0" :step="5" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.language') }}</template>
        <template #control>
          <a-select v-model:value="lang" :style="{ width: '100%' }" @change="onLangChange">
            <a-select-option v-for="l in LanguageManager.supportedLanguages" :key="l.value" :value="l.value"
              :label="l.value">
              <span role="img" :aria-label="l.name">{{ l.icon }}</span>
              &nbsp;&nbsp;<span>{{ l.name }}</span>
            </a-select-option>
          </a-select>
        </template>
      </SettingListItem>
    </a-collapse-panel>

    <a-collapse-panel key="2" :header="t('pages.settings.notifications')">
      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.expireTimeDiff') }}</template>
        <template #description>{{ t('pages.settings.expireTimeDiffDesc') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.expireDiff" :min="0" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.trafficDiff') }}</template>
        <template #description>{{ t('pages.settings.trafficDiffDesc') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.trafficDiff" :min="0" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>
    </a-collapse-panel>

    <a-collapse-panel key="3" :header="t('pages.settings.certs')">
      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.publicKeyPath') }}</template>
        <template #description>{{ t('pages.settings.publicKeyPathDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.webCertFile" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.privateKeyPath') }}</template>
        <template #description>{{ t('pages.settings.privateKeyPathDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.webKeyFile" type="text" />
        </template>
      </SettingListItem>
    </a-collapse-panel>

    <a-collapse-panel key="4" :header="t('pages.settings.externalTraffic')">
      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.externalTrafficInformEnable') }}</template>
        <template #description>{{ t('pages.settings.externalTrafficInformEnableDesc') }}</template>
        <template #control>
          <a-switch v-model:checked="allSetting.externalTrafficInformEnable" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.externalTrafficInformURI') }}</template>
        <template #description>{{ t('pages.settings.externalTrafficInformURIDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.externalTrafficInformURI" placeholder="(http|https)://domain[:port]/path/"
            type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.restartXrayOnClientDisable') }}</template>
        <template #description>{{ t('pages.settings.restartXrayOnClientDisableDesc') }}</template>
        <template #control>
          <a-switch v-model:checked="allSetting.restartXrayOnClientDisable" />
        </template>
      </SettingListItem>
    </a-collapse-panel>

    <a-collapse-panel key="5" :header="t('pages.settings.dateAndTime')">
      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.timeZone') }}</template>
        <template #description>{{ t('pages.settings.timeZoneDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.timeLocation" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.datepicker') }}</template>
        <template #description>{{ t('pages.settings.datepickerDescription') }}</template>
        <template #control>
          <a-select v-model:value="datepicker" :style="{ width: '100%' }">
            <a-select-option v-for="item in datepickerList" :key="item.value" :value="item.value">
              {{ item.name }}
            </a-select-option>
          </a-select>
        </template>
      </SettingListItem>
    </a-collapse-panel>

    <a-collapse-panel key="6" :header="t('pages.settings.ldap.title')">
      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.enable') }}</template>
        <template #control>
          <a-switch v-model:checked="allSetting.ldapEnable" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.host') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapHost" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.port') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.ldapPort" :min="1" :max="65535" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.useTLS') }}</template>
        <template #control>
          <a-switch v-model:checked="allSetting.ldapUseTLS" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.bindDN') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapBindDN" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('password') }}</template>
        <template #control>
          <a-input-password v-model:value="allSetting.ldapPassword" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.baseDN') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapBaseDN" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.userFilter') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapUserFilter" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.userAttribute') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapUserAttr" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.vlessField') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapVlessField" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.flagField') }}</template>
        <template #description>{{ t('pages.settings.ldap.flagFieldDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapFlagField" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.truthyValues') }}</template>
        <template #description>{{ t('pages.settings.ldap.truthyValuesDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapTruthyValues" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.invertFlag') }}</template>
        <template #description>{{ t('pages.settings.ldap.invertFlagDesc') }}</template>
        <template #control>
          <a-switch v-model:checked="allSetting.ldapInvertFlag" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.syncSchedule') }}</template>
        <template #description>{{ t('pages.settings.ldap.syncScheduleDesc') }}</template>
        <template #control>
          <a-input v-model:value="allSetting.ldapSyncCron" type="text" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.inboundTags') }}</template>
        <template #description>{{ t('pages.settings.ldap.inboundTagsDesc') }}</template>
        <template #control>
          <a-select v-model:value="ldapInboundTagList" mode="multiple" :style="{ width: '100%' }">
            <a-select-option v-for="opt in inboundOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </a-select-option>
          </a-select>
          <div v-if="inboundOptions.length === 0" class="ldap-no-inbounds">
            {{ t('pages.settings.ldap.noInbounds') }}
          </div>
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.autoCreate') }}</template>
        <template #control>
          <a-switch v-model:checked="allSetting.ldapAutoCreate" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.autoDelete') }}</template>
        <template #control>
          <a-switch v-model:checked="allSetting.ldapAutoDelete" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.defaultTotal') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.ldapDefaultTotalGB" :min="0" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.defaultExpiry') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.ldapDefaultExpiryDays" :min="0" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>

      <SettingListItem paddings="small">
        <template #title>{{ t('pages.settings.ldap.defaultIpLimit') }}</template>
        <template #control>
          <a-input-number v-model:value="allSetting.ldapDefaultLimitIP" :min="0" :style="{ width: '100%' }" />
        </template>
      </SettingListItem>
    </a-collapse-panel>
  </a-collapse>
</template>

<style scoped>
.ldap-no-inbounds {
  margin-top: 6px;
  color: #64748b;
  font-size: 12px;
}
</style>
