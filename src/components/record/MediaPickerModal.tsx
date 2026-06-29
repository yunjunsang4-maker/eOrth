import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  FlatList,
  StyleSheet,
  Dimensions,
} from 'react-native';
import * as MediaLibrary from 'expo-media-library';

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

const PICKER_CELL = Math.floor((Dimensions.get('window').width - 6) / 3);

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
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={mpStyles.root} accessibilityViewIsModal>
        {/* 헤더 */}
        <View style={mpStyles.header}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <Text style={mpStyles.cancelText}>취소</Text>
          </TouchableOpacity>
          <Text style={mpStyles.title}>사진 선택</Text>
          <TouchableOpacity
            onPress={onConfirm}
            style={{ padding: 4 }}
            disabled={selected.size === 0}
          >
            <Text style={[mpStyles.confirmText, selected.size === 0 && { opacity: 0.4 }]}>
              완료
            </Text>
          </TouchableOpacity>
        </View>

        {/* 안내 */}
        <View style={mpStyles.infoBar}>
          <Text style={mpStyles.infoText}>
            {assets.length}장 중 최대 {max}장 선택 가능
          </Text>
          <Text style={mpStyles.countText}>
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
          getItemLayout={(_, index) => ({
            length: PICKER_CELL + 2,
            offset: (PICKER_CELL + 2) * Math.floor(index / 3),
            index,
          })}
          renderItem={({ item }) => {
            const isSelected = selected.has(item.id);
            return (
              <TouchableOpacity
                style={mpStyles.cell}
                activeOpacity={0.8}
                onPress={() => onToggle(item.id)}
              >
                <Image source={{ uri: item.uri }} style={mpStyles.cellImage} />
                {/* 선택 오버레이 */}
                {isSelected && <View style={mpStyles.selectedOverlay} />}
                {/* 체크박스 */}
                <View style={[mpStyles.checkbox, isSelected && mpStyles.checkboxActive]}>
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
  gridContent: {
    paddingTop: 2,
  },
  cell: {
    width: PICKER_CELL,
    height: PICKER_CELL,
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
