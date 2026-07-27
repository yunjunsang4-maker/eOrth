import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Animated,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path as SvgPath } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { LockClosedIcon as SvgLockClosedIcon } from '../icons';
import { useSkinAccent } from '../../constants/skinTheme';

/**
 * 사진·게시물별 비공개 대상(메이트) 선택 바텀시트 — 피드/블로그/컷 공용.
 *
 * 예전엔 세 화면이 구조가 똑같은 사본을 각각 들고 있었고 설명 문구만 달랐다.
 * 그래서 문구 두 줄만 프롭으로 받고 나머지는 여기 하나로 합쳤다 —
 * 디자인을 손볼 때 세 군데를 따라다니지 않아도 된다.
 */
export function PrivacyModal({
  visible,
  selectedFriends,
  allFriends,
  onToggle,
  onSetAll,
  onClose,
  desc,
  allPrivateDesc,
}: {
  visible: boolean;
  selectedFriends: string[];
  allFriends: string[];
  onToggle: (friend: string) => void;
  onSetAll: (friends: string[]) => void;
  onClose: () => void;
  /** "선택한 메이트에게 이 OO이 비공개됩니다" — 화면마다 대상(미디어/게시물/스트립)이 다르다 */
  desc?: string;
  /** "모든 메이트에게 이 OO을 숨겨요" */
  allPrivateDesc?: string;
}) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent();
  const translateY = useRef(new Animated.Value(500)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 13,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 500,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const count = selectedFriends.length;
  const allPrivate = allFriends.length > 0 && count === allFriends.length;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={pm.overlay} accessibilityViewIsModal>
        <TouchableOpacity style={StyleSheet.absoluteFillObject} activeOpacity={1} onPress={onClose} />
        <Animated.View style={[pm.sheet, { transform: [{ translateY }] }]}>
          <View style={pm.handle} />

          {/* 헤더 — 아이콘을 accent 배지에 넣어 시트의 시작점을 만든다 */}
          <View style={pm.header}>
            <View style={[pm.headerIcon, { backgroundColor: skinAccent.tint(0.14), borderColor: skinAccent.tint(0.3) }]}>
              <SvgLockClosedIcon size={18} color={skinAccent.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={pm.headerTitle}>{t('blog.privacyTitle')}</Text>
              <Text style={pm.headerDesc}>{desc ?? t('comp.privacyMediaDesc')}</Text>
            </View>
            {count > 0 && (
              <View style={[pm.countPill, { backgroundColor: skinAccent.tint(0.16), borderColor: skinAccent.tint(0.35) }]}>
                <Text style={[pm.countPillTxt, { color: skinAccent.accent }]}>{count}</Text>
              </View>
            )}
          </View>

          {/* 전체 비공개 — 목록과 성격이 달라 카드로 띄워 구분한다 */}
          {allFriends.length > 0 && (
            <TouchableOpacity
              style={[
                pm.row,
                pm.allPrivateRow,
                allPrivate && [pm.rowActive, { backgroundColor: skinAccent.tint(0.14), borderColor: skinAccent.accent }],
              ]}
              onPress={() => onSetAll(allPrivate ? [] : [...allFriends])}
              activeOpacity={0.75}
            >
              <View style={[pm.avatar, allPrivate && { backgroundColor: skinAccent.tint(0.3) }]}>
                <SvgLockClosedIcon size={17} color={allPrivate ? skinAccent.accent : '#A1A1B0'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[pm.rowTitle, allPrivate && pm.rowTitleActive]}>{t('blog.allPrivate')}</Text>
                <Text style={pm.rowDesc}>{allPrivateDesc ?? t('comp.allPrivateMediaDesc')}</Text>
              </View>
              <CheckBox on={allPrivate} accent={skinAccent.accent} />
            </TouchableOpacity>
          )}

          {/* 목록 머리 — 전체 해제를 목록 위 우측에 두어 무엇에 대한 해제인지 붙여 놓는다 */}
          <View style={pm.listHead}>
            <Text style={pm.listHeadTxt}>{t('blog.appFriendSelect')}</Text>
            {count > 0 && (
              <TouchableOpacity onPress={() => onSetAll([])} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[pm.clearAllTxt, { color: skinAccent.accent }]}>{t('blog.clearAll')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={pm.listScroll} showsVerticalScrollIndicator={false}>
            {allFriends.map(friend => {
              const on = selectedFriends.includes(friend);
              return (
                <TouchableOpacity
                  key={friend}
                  style={[pm.row, on && [pm.rowActive, { backgroundColor: skinAccent.tint(0.12), borderColor: skinAccent.tint(0.5) }]]}
                  onPress={() => onToggle(friend)}
                  activeOpacity={0.75}
                >
                  <View style={[pm.avatar, on && { backgroundColor: skinAccent.tint(0.3) }]}>
                    <Text style={[pm.avatarTxt, on && { color: skinAccent.accent }]}>{friend[0]}</Text>
                  </View>
                  <Text style={[pm.rowTitle, { flex: 1 }, on && pm.rowTitleActive]} numberOfLines={1}>{friend}</Text>
                  <CheckBox on={on} accent={skinAccent.accent} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 완료 — 앱 기본 버튼 그라데이션 */}
          <TouchableOpacity onPress={onClose} activeOpacity={0.85} style={pm.doneWrap}>
            <LinearGradient
              colors={skinAccent.btnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={pm.doneBtn}
            >
              <Text style={pm.doneTxt}>
                {count > 0 ? t('blog.privacyDoneN', { count }) : t('blog.setPublic')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** 체크 표시 — '✓' 문자는 폰트마다 두께·크기가 달라 SVG로 그린다 */
function CheckBox({ on, accent }: { on: boolean; accent: string }) {
  return (
    <View style={[pm.checkbox, on && { backgroundColor: accent, borderColor: accent }]}>
      {on && (
        <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
          <SvgPath d="M20 6L9 17l-5-5" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )}
    </View>
  );
}

const pm = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#16161F',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 18,
    paddingBottom: 30,
    maxHeight: '82%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 18,
  },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerIcon: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  headerDesc: { fontSize: 12, color: '#A1A1B0', marginTop: 3, lineHeight: 16 },
  countPill: {
    minWidth: 26, height: 24, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  countPillTxt: { fontSize: 12, fontWeight: '700' },

  // 행은 카드로 — 선택 시 배경만 바뀌면 어두운 테마에서 구분이 약해 테두리도 함께 켠다
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'transparent',
    marginBottom: 8,
  },
  rowActive: {},
  allPrivateRow: { marginBottom: 14 },
  rowTitle: { fontSize: 14.5, color: '#A1A1B0', fontWeight: '600' },
  rowTitleActive: { color: '#FFFFFF', fontWeight: '700' },
  rowDesc: { fontSize: 11.5, color: '#7A7A89', marginTop: 2 },

  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 2 },
  listHeadTxt: { fontSize: 11, fontWeight: '700', color: '#7A7A89', letterSpacing: 0.6 },
  clearAllTxt: { fontSize: 12, fontWeight: '700' },
  listScroll: { maxHeight: 300 },

  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },

  checkbox: {
    width: 23, height: 23, borderRadius: 11.5,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },

  doneWrap: { marginTop: 14, borderRadius: 16, overflow: 'hidden' },
  doneBtn: { paddingVertical: 15, alignItems: 'center' },
  doneTxt: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
});
