import { Alert } from 'react-native';
import type { TFunction } from 'i18next';

// 신고 사유 i18n 키 (표시는 ReportModal에서 t()로 변환)
export const REPORT_REASON_KEYS = [
  'social.reportReason1',
  'social.reportReason2',
  'social.reportReason3',
  'social.reportReason4',
  'social.reportReason5',
];

/** 차단 확인 Alert. 확인 시 onConfirm 실행. */
export const handleBlock = (
  username: string,
  onConfirm: () => void,
  t: TFunction
) => {
  Alert.alert(
    t('social.blockTitle'),
    t('social.blockConfirmMsg', { username }),
    [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('social.blockTitle'), style: 'destructive', onPress: onConfirm },
    ]
  );
};

/** 신고 모달을 열도록 showModal(true) 호출. */
export const handleReport = (
  showModal: (visible: boolean) => void
) => {
  showModal(true);
};
