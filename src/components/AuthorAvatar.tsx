import React, { useState, useEffect } from 'react';
import { Image, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { PersonIcon } from './icons';

// eOrth 공식 예시 아바타 이미지(지구본) — 소셜 예시 기록의 '이어스' 프로필 사진
const APP_LOGO = require('../../assets/example-avatar.png');

// 작성자 아바타 내부 표시: 프로필 사진이 있으면 원형 이미지, 없으면 프로필 탭과 동일한 사람 실루엣.
// 부모(원형 컨테이너) 안에 들어가는 inner 노드만 렌더한다(컨테이너 배경/테두리는 그대로 링으로 보임).
// isExample(eOrth 공식 예시)면 앱 로고로 원을 채운다.
//
// ⚠️ 이모지 폴백은 쓰지 않는다. profiles.emoji는 스키마 기본값('🧳')이 모든 계정에 박혀 있어
//    폴백으로 쓰면 사진 없는 사용자가 전부 여행가방 이모지로 보인다(프로필 탭과도 불일치).
//    사진이 없거나 불러오지 못하면 사람 실루엣으로 통일한다.
export default function AuthorAvatar({
  photo,
  emoji: _emoji, // (구) 이모지 폴백 — 위 주석 참조, 미사용. 호출부 호환 위해 유지
  size,
  emojiSize,
  isExample,
}: {
  photo?: string;
  emoji?: string;
  size: number;
  emojiSize?: number;
  isExample?: boolean;
}) {
  // 깨진/만료된 URL(삭제된 사진·네트워크 오류)에서 빈 원이 남지 않도록 실루엣으로 회귀
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [photo]); // 사진이 바뀌면 다시 시도

  if (isExample) {
    // 예시 아바타는 원형 구성 이미지라 원을 꽉 채워 '중앙 정렬'(확대/크롭 없이 1:1).
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <Image source={APP_LOGO} style={{ width: size, height: size }} resizeMode="cover" />
      </View>
    );
  }
  if (photo && !failed) {
    // 원격 프로필 사진은 expo-image로 — 피드 한 화면에서 같은 아바타가 수십 번 반복 요청되던 것을
    // 디스크 캐시로 없앤다(앱 재시작 후에도 유지). 로컬 asset(예시 아바타)은 위 RN Image 그대로.
    return (
      <ExpoImage
        source={{ uri: photo }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        cachePolicy="memory-disk"
        contentFit="cover"
        transition={120}
        onError={() => setFailed(true)}
      />
    );
  }
  return <PersonIcon size={emojiSize ?? Math.round(size * 0.6)} color="#A0A0B0" />;
}
