import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import { Text } from '../ui/Text';
import AuthorAvatar from './AuthorAvatar';
import { filterMentionCandidates } from '../utils/mentions';

// 댓글 입력창 위에 뜨는 @자동완성 칩 줄.
//
// 후보는 전부 로컬 데이터다(내 메이트 + 글 작성자 + 이 글의 댓글 작성자) — 서버 검색이
// 없으므로 네트워크 실패 경로 자체가 없다(설계 2026-09-09).
//
// ⚠️ keyboardShouldPersistTaps="always" 는 필수다. 없으면 첫 탭이 키보드를 내리는 데
//    쓰이고 칩은 눌리지 않아, 사용자가 "두 번 눌러야 들어간다"고 느낀다.

export interface MentionCandidate {
  handle: string;
  photo?: string;
  emoji?: string;
}

export default function MentionSuggestBar({
  candidates,
  query,
  exclude,
  onPick,
  style,
}: {
  candidates: MentionCandidate[];
  query: string;
  exclude?: string;
  onPick: (handle: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const list = useMemo(
    () => filterMentionCandidates(candidates, query, { exclude }),
    [candidates, query, exclude],
  );

  // 후보가 없으면 자리를 차지하지 않는다 — 빈 바가 남으면 입력창이 그만큼 밀려 올라간다
  if (list.length === 0) return null;

  return (
    <View style={[s.wrap, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={s.row}
      >
        {list.map((c) => (
          <TouchableOpacity
            key={c.handle}
            style={s.chip}
            activeOpacity={0.75}
            onPress={() => onPick(c.handle)}
          >
            {/* AuthorAvatar 는 원형 컨테이너 '안쪽'만 그린다 — 원/배경은 부모가 만든다 */}
            <View style={s.avatar}>
              <AuthorAvatar photo={c.photo} emoji={c.emoji} size={24} />
            </View>
            {/* ⚠️ andFitText(adjustsFontSizeToFit)를 쓰지 않는다. ① 아이디는 [A-Za-z0-9_]
                ASCII 전용이라 한글 글리프 폭 문제(andFitText를 쓰는 원래 이유)가 애초에 없고,
                ② 자동 축소는 중첩 Text에서 측정이 어긋나 maxWidth와 겹치면 안드로이드에서만
                글자가 과하게 줄거나 축소가 안 먹는다. 긴 아이디는 말줄임으로 자른다. */}
            <Text style={s.chipText} numberOfLines={1} ellipsizeMode="tail">
              <Text style={s.chipAt}>@</Text>{c.handle}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 6 },
  row: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 4,
    borderRadius: 18,
    backgroundColor: '#2E2E3B',
    borderWidth: 1,
    borderColor: '#1A1A26',
    maxWidth: 180,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1A1A26',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  // '@'만 보라 네온 — 본문(MentionText)의 언급 색과 같은 토큰이라 "이게 태그다"가 바로 읽힌다
  chipAt: { color: '#BF85FC' },
});
