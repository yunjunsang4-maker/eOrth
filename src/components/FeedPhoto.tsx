import React from 'react';
import { Image, type ImageContentFit } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';
import { thumbOf } from '../utils/thumbUrl';

/**
 * 목록(피드·스토리·카드)용 원격 사진.
 *
 * RN Image 대신 expo-image를 쓰는 이유는 **디스크 캐시**다. RN Image의 캐시는 OS 기본 HTTP 캐시에
 * 기대는 수준이라 앱을 다시 열 때마다 같은 사진을 서버에서 다시 받아왔다 — 피드처럼 같은 사진을
 * 반복해서 보는 화면에서 이그레스가 그대로 중복 발생했다.
 * cachePolicy="memory-disk"면 한 번 받은 사진은 기기에 남아 재요청이 사라진다.
 *
 * thumbs를 넘기면 원본 대신 640px 축소본을 골라 쓴다(services/posts.ts가 발행 시 생성).
 * 상세 화면처럼 원본 화질이 필요한 곳에는 이 컴포넌트를 쓰지 않는다.
 */
export default function FeedPhoto({
  uri,
  thumbs,
  style,
  contentFit = 'cover',
  transition = 120,
  onError,
  earlyResize,
}: {
  uri: string;
  /** 기록의 원본→축소본 맵(TravelRecord.thumbs). 없으면 원본을 그대로 쓴다 */
  thumbs?: Record<string, string>;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  transition?: number;
  /** 로드 실패 통지 — 깨진 이미지를 폴백으로 바꾸는 호출부용(광고 카드·초대 아바타) */
  onError?: () => void;
  /**
   * iOS 전용: 뷰 크기로 '디코드 단계에서' 축소(expo-image enforceEarlyResizing, ImageIO 썸네일 디코드).
   * 끄면(기본) 일반 file://·https는 전체를 디코드한 뒤 줄이고 메모리 캐시에도 전체 크기로 남는다
   * (expo-image ios/ImageView.swift shouldEarlyResize). 고정 크기 칸이 많은 격자(사진첩)용. 안드로이드는 prop 자체가 없다(Glide가 원래 목표 크기로 디코드).
   */
  earlyResize?: boolean;
}) {
  return (
    <Image
      source={{ uri: thumbOf(thumbs, uri) }}
      style={style}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      transition={transition}
      onError={onError}
      enforceEarlyResizing={earlyResize}
    />
  );
}
