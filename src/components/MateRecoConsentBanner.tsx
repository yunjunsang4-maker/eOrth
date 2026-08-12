import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { Text } from '../ui/Text';
import { andFitText } from '../utils/fitText';
import { useSettings } from '../store/settingsStore';
import { fetchMateRecoOptin, saveMateRecoOptin } from '../services/profile';
import { emitToast } from '../store/toastStore';

const C = {
  card: '#2E2E3B',
  neon: '#BF85FC',
  dim: '#A1A1B0',
  divider: '#1A1A26',
  white: '#FFFFFF',
};

/** 배너를 닫은 뒤 다시 뜨기까지의 간격 */
const REASK_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * 기존 이용자용 재동의 배너.
 *
 * 신규 가입자는 온보딩(MateRecoConsentScreen)에서 이미 답하므로 여기 걸리지 않는다.
 * 서버 값이 null(=아직 물어본 적 없음)일 때만 뜬다 — `!optin` 으로 판정하면 '거부(false)'까지
 * 걸려서 이미 답한 사람에게 계속 묻게 된다.
 *
 * 닫기(✕)는 로컬에 시각만 남기고 서버 값은 건드리지 않는다. 7일 뒤 다시 뜬다.
 */
export default function MateRecoConsentBanner() {
  const { t } = useTranslation();
  const { mateRecoAskedAt, setMateRecoAskedAt } = useSettings();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // 닫은 지 7일이 안 됐으면 서버를 조회하지도 않는다(불필요한 왕복 방지).
    if (mateRecoAskedAt && Date.now() - mateRecoAskedAt < REASK_AFTER_MS) return;
    fetchMateRecoOptin()
      .then((v) => { if (alive && v === null) setVisible(true); })
      .catch(() => {});
    return () => { alive = false; };
  }, [mateRecoAskedAt]);

  if (!visible) return null;

  const answer = async (optin: boolean) => {
    if (busy) return;
    setBusy(true);
    const ok = await saveMateRecoOptin(optin);
    if (ok) {
      setVisible(false);
    } else {
      // 저장 실패 — 서버는 여전히 null 이므로 배너를 남긴다. 잘못된 화면을 만들지 않는다.
      emitToast(t('mateConsent.saveFail'));
      setBusy(false);
    }
  };

  const dismiss = () => {
    setMateRecoAskedAt(Date.now());
    setVisible(false);
  };

  return (
    <View style={st.wrap}>
      <View style={st.headRow}>
        <Text style={st.title}>{t('mateConsent.bannerTitle')}</Text>
        <TouchableOpacity onPress={dismiss} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="닫기">
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
            <SvgPath d="M18 6L6 18M6 6l12 12" stroke={C.dim} strokeWidth={2} strokeLinecap="round" />
          </Svg>
        </TouchableOpacity>
      </View>
      <Text style={st.body}>{t('mateConsent.bannerBody')}</Text>
      <View style={st.btnRow}>
        <TouchableOpacity style={[st.btn, st.declineBtn]} onPress={() => answer(false)} disabled={busy} activeOpacity={0.85}>
          <Text style={st.declineTxt} {...andFitText}>{t('mateConsent.bannerDecline')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[st.btn, st.agreeBtn]} onPress={() => answer(true)} disabled={busy} activeOpacity={0.85}>
          <Text style={st.agreeTxt} {...andFitText}>{t('mateConsent.bannerAgree')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: {
    marginHorizontal: 12, marginTop: 12, padding: 14,
    backgroundColor: C.card, borderRadius: 14,
    borderWidth: 1, borderColor: C.divider,
  },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  title: { flex: 1, fontSize: 14, fontWeight: '700', color: C.white, lineHeight: 20 },
  body: { fontSize: 12, color: C.dim, lineHeight: 18, marginTop: 6 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  declineBtn: { borderWidth: 1, borderColor: C.divider },
  declineTxt: { fontSize: 13, color: C.dim, fontWeight: '600' },
  agreeBtn: { backgroundColor: C.neon },
  agreeTxt: { fontSize: 13, color: '#1A1A26', fontWeight: '700' },
});
