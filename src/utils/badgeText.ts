// 배지 이름·설명·카테고리명 다국어 헬퍼.
//
// 한국어 원문은 constants/badges.ts 상수가 단일 출처다 — ko.ts 에 키를 두지 않는다.
// i18n 이 fallbackLng: 'ko' 이므로 en.ts 의 badge.* 키가 없을 때만 defaultValue(상수)로
// 떨어지고, ko 언어에서는 항상 defaultValue 를 쓴다. 이 구조 덕에:
//   · 배지 문구를 고칠 때 상수만 고치면 한국어는 끝 (중복 편집 없음)
//   · 새 배지의 영어 번역이 늦어도 깨지지 않고 한국어로 표시된다
//
// 영어 번역은 en.ts 의 badge 섹션: n<id>(이름) / d<id>(설명) / <category.key>(챕터명).
import type { TFunction } from 'i18next';
import type { Badge, BadgeCategory } from '../constants/badges';

export const badgeName = (b: Badge, t: TFunction): string =>
  t(`badge.n${b.id}`, { defaultValue: b.name });

export const badgeDesc = (b: Badge, t: TFunction): string =>
  t(`badge.d${b.id}`, { defaultValue: b.desc });

export const badgeCategoryName = (c: BadgeCategory, t: TFunction): string =>
  t(`badge.${c.key}`, { defaultValue: c.name });
