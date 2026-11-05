import React, { useCallback } from 'react';
import {
  View,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { Text } from '../../ui/Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { useStageWidth, STAGE_MAX_W } from '../../utils/stage';
import { SettingsHeader, SettingsPillButton } from '../settings/SettingsUI';

/**
 * 30장 초과 시 뜨는 사진 선택 모달 — NewRecordScreen 에서 분리.
 * 화면 state/핸들러는 props 로 받는다.
 */
// 재질·색은 기간 사진 격자(DateRangePhotoSheet, 2026-11-05 통일)와 같은 값 — 흰/흰50% 위주, 보라는 선택 표시에만.
// ponytail: 격자 셀·선택 덮개 스타일이 DateRangePhotoSheet·AlbumCreateScreen과 세 곳에 복사돼 있다 — 공용 추출 후보.
const COLORS = {
  bg: '#0A0A0F',
  divider: '#1A1A26',
  white: '#FFFFFF',
  text50: 'rgba(255,255,255,0.5)',
};
const GRID_GAP = 3; // 사진첩 가로 줄(AlbumTimeline ROW_GAP)과 같은 간격

export function MediaPickerModal({
  visible,
  assets,
  selected,
  max,
  onToggle,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  assets: MediaLibrary.Asset[];
  selected: Set<string>;
  max: number;
  onToggle: (id: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // 셀 크기는 getItemLayout의 length/offset에 그대로 들어간다 — 박제하면 폴드 펼침 시
  // 스크롤 위치가 어긋난다. 스타일시트는 모듈 최상위에서 한 번만 만들어지므로
  // 폭·높이만 인라인으로 내렸다(나머지 셀 스타일은 mpStyles.cell 유지).
  const stageW = useStageWidth();
  // 좌우 여백 없이 3등분, 칸 사이 GRID_GAP(floor — 3칸+간격이 폭을 넘어 줄바꿈되지 않게).
  // 줄 간격은 칸 marginBottom으로 준다(구분선 컴포넌트 대신) — 한 줄 높이가 CELL + GRID_GAP로 고정돼 getItemLayout이 맞는다
  const PICKER_CELL = Math.floor((stageW - GRID_GAP * 2) / 3);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: PICKER_CELL + GRID_GAP,
      // numColumns FlatList는 getItemLayout에 '줄' 번호를 넘긴다(FlatList.js가 감싸지 않고 그대로 전달) — 사진 번호/3 아님
      offset: (PICKER_CELL + GRID_GAP) * index,
      index,
    }),
    [PICKER_CELL],
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {/* pageSheet는 안드로이드에서 무시되어 전체화면이 되므로 상단 인셋을 직접 보정 */}
      <View style={[mpStyles.root, Platform.OS === 'android' && { paddingTop: insets.top }]} accessibilityViewIsModal>
        {/* 헤더 — 설정 계열 공용(SettingsHeader). 오른쪽 '완료' 알약은 고른 게 없으면 눌리지 않음(기존 조건) */}
        <View style={mpStyles.headerWrap}>
          <SettingsHeader
            title={t('comp.selectPhoto')}
            onBack={onClose}
            backA11yLabel={t('album.closeA11y')}
            right={
              <SettingsPillButton compact label={t('common.done')} onPress={onConfirm} disabled={selected.size === 0} />
            }
          />
        </View>

        {/* 안내 + 선택 수 — 사진첩 화면 정보 줄과 같은 틀. 위 선은 SettingsHeader 아래 선이 맡는다 */}
        <View style={mpStyles.info}>
          <Text style={mpStyles.infoText} numberOfLines={2}>
            {t('comp.pickerInfo', { count: assets.length, max })}
          </Text>
          <Text style={[mpStyles.countText, selected.size > 0 && mpStyles.countTextOn]} numberOfLines={1}>
            {selected.size}/{max}
          </Text>
        </View>

        {/* 그리드 */}
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={[mpStyles.gridContent, { paddingBottom: insets.bottom + 16 }]}
          columnWrapperStyle={{ gap: GRID_GAP }}
          // 최대 500장 그리드 — 가상화 튜닝으로 모달 오픈/스크롤 끊김 완화
          initialNumToRender={15}
          maxToRenderPerBatch={15}
          windowSize={5}
          removeClippedSubviews
          getItemLayout={getItemLayout}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                style={[mpStyles.cell, { width: PICKER_CELL, height: PICKER_CELL }]}
                activeOpacity={0.8}
                onPress={() => onToggle(item.id)}
                accessibilityState={{ selected: isSelected }}
              >
                <Image source={{ uri: item.uri }} style={mpStyles.cellImage} />
                {/* 선택 표시 — 사진첩 선택 모드(AlbumTimeline selOverlay·selCheck)와 같은 모양. 안 고른 칸은 덮개 없이 빈 원만 */}
                <View pointerEvents="none" style={[mpStyles.selOverlay, isSelected && mpStyles.selOverlayOn]}>
                  <View style={[mpStyles.selCheck, isSelected && mpStyles.selCheckOn]}>
                    {isSelected && <Text style={mpStyles.selCheckTxt}>✓</Text>}
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const mpStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  // pageSheet 위 손잡이 자리와 붙지 않게 살짝 띄운다(DateRangePhotoSheet와 같은 값)
  headerWrap: { paddingTop: 12 },
  // 사진첩 화면 albumInfo와 같은 값 — 위 선은 헤더 선이 맡는다
  info: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 0.8,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  infoText: { flex: 1, fontSize: 13, color: COLORS.text50 },
  countText: { fontSize: 13, color: COLORS.text50 },
  countTextOn: { color: COLORS.white, fontWeight: '600' },
  // 이 모달은 RN Modal이라 App.tsx 루트 클램프 바깥에서 렌더된다. 셀 폭은 Stage 폭(≤480)
  // 기준으로 계산되므로, 그리드 콘텐츠도 같은 폭으로 가두고 중앙에 둬야 넓은 화면에서
  // 왼쪽으로 쏠리지 않는다. root(페이지 배경)는 전면 유지 — 여기만 좁힌다.
  gridContent: {
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  // width·height는 Stage 폭에서 파생되므로 호출부에서 인라인으로 주입한다. 줄 간격 = marginBottom(getItemLayout과 짝)
  cell: {
    marginBottom: GRID_GAP,
    backgroundColor: COLORS.divider, // 로딩 칸 색
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  // AlbumTimeline 선택 모드 값 복사(selOverlay·selCheck)
  selOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'flex-end' },
  selOverlayOn: { backgroundColor: 'rgba(107,33,168,0.35)' },
  selCheck: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    margin: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selCheckOn: { backgroundColor: '#BF85FC', borderColor: '#BF85FC' },
  selCheckTxt: { fontSize: 13, fontWeight: '800', color: COLORS.white, lineHeight: 15 },
});
