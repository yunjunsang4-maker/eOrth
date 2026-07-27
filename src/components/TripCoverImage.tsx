// 여행기록카드 배경 사진.
// 원본 대신 카드 크기에 맞춰 구운 축소본을 쓰고(utils/cardThumbs), expo-image의
// 메모리·디스크 캐시로 탭을 오갈 때 다시 디코딩하지 않게 한다.
import React from 'react';
import { StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useCardThumb } from '../utils/cardThumbs';

export default function TripCoverImage({ uri }: { uri: string }) {
  const src = useCardThumb(uri);
  return (
    <Image
      source={{ uri: src }}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      cachePolicy="memory-disk"
      transition={120}
      // 목록에서 뷰가 재사용될 때 이전 카드 사진이 남지 않게 한다
      recyclingKey={src}
    />
  );
}
