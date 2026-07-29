// Centralizes the AllSetting fetch/save lifecycle the legacy panel
// scattered across data() + methods + a busy-loop dirty checker.

import { onMounted, reactive, ref, watch } from 'vue';
import { HttpUtil } from '@/utils';
import { AllSetting } from '@/models/setting.js';

export function useAllSetting() {
  const fetched = ref(false);
  const spinning = ref(false);
  const saveDisabled = ref(true);

  // Two reactive snapshots: the last server-side state and the one the
  // user is editing. `equals` compares enumerable props field-by-field.
  const oldAllSetting = reactive(new AllSetting());
  const allSetting = reactive(new AllSetting());

  function applyServerState(obj) {
    const fresh = new AllSetting(obj);
    Object.assign(oldAllSetting, fresh);
    Object.assign(allSetting, fresh);
    saveDisabled.value = true;
  }

  async function fetchAll() {
    const msg = await HttpUtil.post('/panel/setting/all');
    if (msg?.success) {
      fetched.value = true;
      applyServerState(msg.obj);
    }
  }

  async function saveAll() {
    spinning.value = true;
    try {
      const msg = await HttpUtil.post('/panel/setting/update', allSetting);
      if (msg?.success) await fetchAll();
    } finally {
      spinning.value = false;
    }
  }

  function discardChanges() {
    Object.assign(allSetting, new AllSetting(oldAllSetting));
    saveDisabled.value = true;
  }

  watch(allSetting, () => {
    saveDisabled.value = oldAllSetting.equals(allSetting);
  }, { deep: true, flush: 'sync' });

  onMounted(() => {
    fetchAll();
  });

  return {
    fetched,
    spinning,
    saveDisabled,
    oldAllSetting,
    allSetting,
    fetchAll,
    saveAll,
    discardChanges,
  };
}
