import React from 'react';
import { Image } from 'react-native';
import { PersonIcon } from './icons';

// eOrth 앱 아이콘 — 공식 예시 아바타용
const APP_LOGO = require('../../assets/icon.png');

// 작성자 아바타 내부 표시: 프로필 사진이 있으면 원형 이미지, 없으면 프로필 탭과 동일한 사람 실루엣.
// 부모(원형 컨테이너) 안에 들어가는 inner 노드만 렌더한다(컨테이너 배경/테두리는 그대로 링으로 보임).
// isExample(eOrth 공식 예시)면 앱 로고로 원을 채운다.
export default function AuthorAvatar({
  photo,
  emoji: _emoji, // (구) 이모지 폴백 — 프로필 탭과 통일하며 미사용, 호출부 호환 위해 유지
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
  if (isExample) {
    return <Image source={APP_LOGO} style={{ width: size, height: size, borderRadius: size / 2 }} resizeMode="cover" />;
  }
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return <PersonIcon size={emojiSize ?? Math.round(size * 0.6)} color="#A0A0B0" />;
}
