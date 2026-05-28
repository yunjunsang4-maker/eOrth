import { Alert } from 'react-native';

export const REPORT_REASONS = [
  '스팸 또는 광고',
  '부적절한 콘텐츠',
  '사칭 계정',
  '혐오 발언',
  '기타',
];

/** 차단 확인 Alert. 확인 시 onConfirm 실행. */
export const handleBlock = (
  username: string,
  onConfirm: () => void
) => {
  Alert.alert(
    '차단하기',
    `@${username}을 차단할까요?\n차단하면 서로의 게시물과 프로필이 보이지 않아요.`,
    [
      { text: '취소', style: 'cancel' },
      { text: '차단하기', style: 'destructive', onPress: onConfirm },
    ]
  );
};

/** 신고 모달을 열도록 showModal(true) 호출. */
export const handleReport = (
  showModal: (visible: boolean) => void
) => {
  showModal(true);
};
