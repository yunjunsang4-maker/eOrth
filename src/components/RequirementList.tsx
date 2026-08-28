import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { Circle as SvgCircle, Path as SvgPath } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { Text } from '../ui/Text';
import { Colors, Typography, Spacing } from '../constants';

/**
 * 입력 조건 체크리스트 — 아이디·비밀번호처럼 형식 제약이 있는 칸 아래에
 * 조건을 "전부 먼저 보여주고", 충족되면 밝아지는(회색 → 보라 네온) 표시로 바꾼다.
 *
 * 왜 빨강 오류 문구 대신 이 방식인가:
 * 빨강(#FF3B30)은 이 앱에서 오류·삭제 전용 색이다. 아직 다 입력하지도 않은
 * 상태를 빨강으로 칠하면 (1) 사용자가 잘못한 것처럼 읽히고 (2) 정작 진짜 오류
 * (예: 이미 사용 중인 아이디)가 떴을 때 구분이 안 된다. 조건을 미리 다 보여주면
 * 무엇을 채워야 하는지 입력 전에 알 수 있어 시행착오 자체가 줄어든다.
 *
 * 미충족 색은 Colors.textMuted를 그대로 쓴다 — 더 흐리게 만들면 "밝아지는" 대비는
 * 커지지만 textMuted에 걸어둔 WCAG AA 대비(≥4.5:1)가 깨진다(constants/colors.ts:34).
 * 대비는 색상 변화(무채색 → 보라)로 확보한다.
 */
export type Requirement = {
  /** 목록 key — 조건 식별자 */
  key: string;
  /** 사용자에게 보이는 조건 문구 (이미 번역된 문자열) */
  label: string;
  /** 충족 여부 */
  met: boolean;
  /** 서버 확인 중(예: 아이디 중복 검사) — 스피너를 보여준다. `met`보다 우선한다. */
  pending?: boolean;
  /**
   * 검사 결과 "불가"로 확정된 상태(예: 이미 사용 중인 아이디) — 빨간 ✕.
   * `pending`·`met`보다 우선한다.
   *
   * 여기서만 빨강을 쓰는 이유: 이건 "아직 안 채움"이 아니라 서버가 확인해준 **진짜 오류**다.
   * 아직 못 채운 조건(회색)과 확정된 오류(빨강)를 색으로 갈라두면 사용자가 무엇을
   * 고쳐야 하는지 바로 안다.
   */
  failed?: boolean;
};

const MET_COLOR = '#BF85FC'; // 보라 네온 — 충족
const FAILED_COLOR = '#FF3B30'; // 빨강 — 확정된 오류 전용
const ICON_BOX = 14;

export default function RequirementList({
  items,
  style,
}: {
  items: Requirement[];
  style?: StyleProp<ViewStyle>;
}) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  return (
    <View style={[styles.wrap, style]}>
      {items.map((item) => {
        // 우선순위: 확정 오류 > 확인 중 > 충족 > 미충족
        const color = item.failed ? FAILED_COLOR : item.met && !item.pending ? MET_COLOR : Colors.textMuted;
        const a11ySuffix = item.failed
          ? t('common.requirementFailed')
          : item.pending
            ? t('common.requirementChecking')
            : item.met
              ? t('common.requirementMet')
              : t('common.requirementUnmet');
        return (
          <View
            key={item.key}
            style={styles.row}
            accessible
            accessibilityLabel={`${item.label}, ${a11ySuffix}`}
          >
            {/* 아이콘 자리는 어느 상태든 같은 크기라 상태가 바뀌어도 줄이 흔들리지 않는다 */}
            <View style={styles.iconSlot}>
              {item.pending && !item.failed ? (
                // 스피너 기본 크기(20dp)를 아이콘 칸(14dp)에 맞춰 축소한다
                <ActivityIndicator size="small" color={Colors.textMuted} style={styles.spinner} />
              ) : (
                <Svg width={ICON_BOX} height={ICON_BOX} viewBox="0 0 24 24" fill="none">
                  {item.failed ? (
                    <SvgPath
                      d="M18 6L6 18M6 6l12 12"
                      stroke={FAILED_COLOR}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : item.met ? (
                    <SvgPath
                      d="M20 6L9 17l-5-5"
                      stroke={MET_COLOR}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : (
                    <SvgCircle cx="12" cy="12" r="4" stroke={Colors.textMuted} strokeWidth={2} fill="none" />
                  )}
                </Svg>
              )}
            </View>
            <Text style={[styles.label, { color }]}>{item.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing[1],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing[2],
  },
  iconSlot: {
    width: ICON_BOX,
    height: ICON_BOX,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    transform: [{ scale: 0.7 }],
  },
  label: {
    flex: 1,
    fontSize: Typography.fontSize.xs,
    fontFamily: Typography.fontFamily.regular,
  },
});
