import React from 'react';
import { Image, Text } from 'react-native';

// 작성자 아바타 내부 표시: 프로필 사진이 있으면 원형 이미지, 없으면 이모지.
// 부모(원형 컨테이너) 안에 들어가는 inner 노드만 렌더한다(컨테이너 배경/테두리는 그대로 링으로 보임).
export default function AuthorAvatar({
  photo,
  emoji,
  size,
  emojiSize,
}: {
  photo?: string;
  emoji?: string;
  size: number;
  emojiSize?: number;
}) {
  if (photo) {
    return <Image source={{ uri: photo }} style={{ width: size, height: size, borderRadius: size / 2 }} />;
  }
  return <Text style={{ fontSize: emojiSize ?? Math.round(size * 0.6) }}>{emoji || '🧳'}</Text>;
}
