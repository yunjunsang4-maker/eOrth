import React, { useCallback, useMemo, useRef } from 'react';
import type { StyleProp, TextStyle } from 'react-native';
import { Text } from '../ui/Text';
import { splitMentions } from '../utils/mentions';
import { getProfileByHandle } from '../services/profile';
import { navigationRef } from '../navigation/navigationRef';

// 댓글 본문 렌더러 — `@아이디`를 보라 네온으로 칠하고 탭하면 그 사람 프로필로 보낸다.
//
// ⚠️ 바깥 Text 하나 안에 중첩 Text 로 그린다. 세그먼트마다 별도 Text 를 늘어놓고
//    View 로 감싸면 줄바꿈 지점과 numberOfLines(말줄임)가 기존과 달라져, 댓글 목록의
//    한 줄 높이·"더 보기" 판정이 통째로 어긋난다. 중첩 Text 는 한 문단으로 흘러
//    기존 <Text> 한 개와 렌더 결과가 같다.
//
// 언급이 하나도 없으면 세그먼트를 만들지 않고 평범한 Text 로 반환한다(대다수 댓글의 경로).

const DEFAULT_MENTION_STYLE: TextStyle = { color: '#BF85FC', fontWeight: '600' };

export default function MentionText({
  text,
  style,
  mentionStyle,
  numberOfLines,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
  mentionStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  // 연타 방지 — 프로필 조회는 네트워크 왕복이라, 빠르게 두 번 누르면 같은 화면이
  // 스택에 두 장 쌓인다(뒤로가기를 두 번 눌러야 빠져나온다).
  const busyRef = useRef(false);

  const openProfile = useCallback((handle: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    (async () => {
      try {
        const p = await getProfileByHandle(handle);
        const nav = navigationRef.current;
        // 탈퇴·아이디 변경으로 조회가 비면 조용히 무시한다(설계: 토스트 없음).
        // 옛 댓글의 @토큰은 재연결하지 않는 것이 이번 범위의 결정이다.
        if (p?.id && nav?.isReady()) {
          nav.navigate('FriendProfile', { userId: p.id, username: p.handle ?? handle });
        }
      } catch {
        // 네트워크 실패도 조용히 무시 — 본문 탭은 부가 동작이라 오류 UI 를 띄우지 않는다
      } finally {
        busyRef.current = false;
      }
    })();
  }, []);

  const segments = useMemo(() => splitMentions(text), [text]);
  const hasMention = segments.some((s) => s.type === 'mention');

  if (!hasMention) {
    return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) => (
        seg.type === 'mention' && seg.handle
          ? (
            <Text
              key={`m${i}`}
              style={[DEFAULT_MENTION_STYLE, mentionStyle]}
              suppressHighlighting
              onPress={() => openProfile(seg.handle as string)}
            >
              {seg.value}
            </Text>
          )
          : <Text key={`t${i}`}>{seg.value}</Text>
      ))}
    </Text>
  );
}
