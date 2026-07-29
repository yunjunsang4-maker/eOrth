/**
 * 날씨 아이콘 — 기록 화면과 게시물 상세가 같은 그림을 쓰도록 하는 단일 출처.
 *
 * 기록 화면(NewRecordScreen)은 제작 SVG 세트를 쓰는데 게시물 상세는 이모지(☀️/🌤️)를
 * 써서 같은 날씨가 화면마다 다르게 보였다. 이모지는 기기 폰트에 따라 모양·색도 달라진다.
 *
 * 저장값은 한글 canonical 6종('맑음'·'부분흐림'·'흐림'·'비'·'눈'·'바람')이지만,
 * 과거 기록·가져오기 데이터에는 별칭('화창'·'구름조금'·'소나기'·'천둥' 등)이 남아 있다.
 * normalizeWeather가 그 별칭을 canonical로 접어 어느 화면에서도 그림이 나오게 한다.
 */
import React from 'react';
import { SunIcon, CloudyIcon, RainIcon, SnowIcon, WindIcon, PartlyCloudyIcon } from './icons';
// 정규화 로직은 렌더와 분리해 순수 모듈에 둔다(weatherKey.verify.ts로 검증)
import { normalizeWeather } from '../utils/weatherKey';

export { normalizeWeather };

/**
 * 날씨 아이콘 렌더. 값이 없거나 모르는 표기면 null을 반환하니 호출부에서 자리(칩 등)를
 * 통째로 감추면 된다 — 뜻 모를 기본 아이콘을 보여주지 않는다.
 * ('부분흐림'은 다색 디자인 아이콘이라 color를 받지 않는다 — 기록 화면과 동일)
 */
export default function WeatherIcon({ value, size = 16, color }: {
  value?: string | null;
  size?: number;
  color?: string;
}): React.ReactElement | null {
  const key = normalizeWeather(value);
  if (!key) return null;
  switch (key) {
    case '맑음': return <SunIcon size={size} color={color} />;
    case '부분흐림': return <PartlyCloudyIcon size={size} />;
    case '흐림': return <CloudyIcon size={size} color={color} />;
    case '비': return <RainIcon size={size} color={color} />;
    case '눈': return <SnowIcon size={size} color={color} />;
    case '바람': return <WindIcon size={size} color={color} />;
  }
}
