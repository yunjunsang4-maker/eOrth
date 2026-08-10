import React, { useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  StyleSheet,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import { useTranslation } from 'react-i18next';
import { useSkinAccent } from '../../constants/skinTheme';
import { useStageWidth, STAGE_MAX_W } from '../../utils/stage';

/**
 * 30장 초과 시 뜨는 사진 선택 모달 — NewRecordScreen 에서 분리.
 * 화면 state/핸들러는 props 로 받는다.
 */
const COLORS = {
  bg: '#0A0A0F',
  divider: '#1A1A26',
  textDim: '#A1A1B0',
  white: '#FFFFFF',
  purpleNeon: '#BF85FC',
};

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
  const skinAccent = useSkinAccent();
  const insets = useSafeAreaInsets();
  // 셀 크기는 getItemLayout의 length/offset에 그대로 들어간다 — 박제하면 폴드 펼침 시
  // 스크롤 위치가 어긋난다. 스타일시트는 모듈 최상위에서 한 번만 만들어지므로
  // 폭·높이만 인라인으로 내렸다(나머지 셀 스타일은 mpStyles.cell 유지).
  const stageW = useStageWidth();
  const PICKER_CELL = Math.floor((stageW - 6) / 3);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: PICKER_CELL + 2,
      offset: (PICKER_CELL + 2) * Math.floor(index / 3),
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
        {/* 헤더 */}
        <View style={mpStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={mpStyles.cancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={mpStyles.title}>{t('comp.selectPhoto')}</Text>
          <TouchableOpacity
            onPress={onConfirm}
            style={{ padding: 4 }}
            disabled={selected.size === 0}
          >
            <Text style={[mpStyles.confirmText, { color: skinAccent.accent }, selected.size === 0 && { opacity: 0.4 }]}>
              {t('common.done')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* 안내 */}
        <View style={[mpStyles.infoBar, { backgroundColor: skinAccent.tint(0.12) }]}>
          <Text style={mpStyles.infoText}>
            {t('comp.pickerInfo', { count: assets.length, max })}
          </Text>
          <Text style={[mpStyles.countText, { color: skinAccent.accent }]}>
            {selected.size}/{max}
          </Text>
        </View>

        {/* 그리드 */}
        <FlatList
          data={assets}
          keyExtractor={(item) => item.id}
          numColumns={3}
          contentContainerStyle={mpStyles.gridContent}
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
              >
                <Image source={{ uri: item.uri }} style={mpStyles.cellImage} />
                {/* 선택 오버레이 */}
                {isSelected && <View style={[mpStyles.selectedOverlay, { backgroundColor: skinAccent.tint(0.3) }]} />}
                {/* 체크박스 */}
                <View style={[mpStyles.checkbox, isSelected && [mpStyles.checkboxActive, { backgroundColor: skinAccent.accent, borderColor: skinAccent.accent }]]}>
                  {isSelected && <Text style={mpStyles.checkmark}>✓</Text>}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  cancelText: {
    fontSize: 15,
    color: COLORS.textDim,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  infoBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(107,33,168,0.15)',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.divider,
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textDim,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.purpleNeon,
  },
  // 이 모달은 RN Modal이라 App.tsx 루트 클램프 바깥에서 렌더된다. 셀 폭은 Stage 폭(≤480)
  // 기준으로 계산되므로, 그리드 콘텐츠도 같은 폭으로 가두고 중앙에 둬야 넓은 화면에서
  // 왼쪽으로 쏠리지 않는다. root(페이지 배경)는 전면 유지 — 여기만 좁힌다.
  gridContent: {
    paddingTop: 2,
    width: '100%',
    maxWidth: STAGE_MAX_W,
    alignSelf: 'center',
  },
  // width·height는 Stage 폭에서 파생되므로 호출부에서 인라인으로 주입한다.
  cell: {
    margin: 1,
    position: 'relative',
  },
  cellImage: {
    width: '100%',
    height: '100%',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(191,133,252,0.3)',
  },
  checkbox: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.6)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: COLORS.purpleNeon,
    borderColor: COLORS.purpleNeon,
  },
  checkmark: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: 'bold',
  },
});
