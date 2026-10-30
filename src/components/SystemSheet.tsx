import React, { useEffect, useRef } from 'react';
import { Platform, UIManager } from 'react-native';
import { TrueSheet, type SheetDetent } from '@lodev09/react-native-true-sheet';

/**
 * iOS 시스템 바텀시트(UISheetPresentationController, @lodev09/react-native-true-sheet) — 3단계(2026-10-30).
 * 유튜브·인스타처럼 iOS는 시스템 시트를 쓴다: 기본 높이에선 떠 있는 글래스, 끝까지 올리면 불투명 전체 시트(iOS 26·27 기본 동작).
 * 앱은 iOS 다크 고정(app.json ios.userInterfaceStyle)이라 시트도 어둡게 뜬다.
 *
 * 네이티브 모듈이라 이 모듈이 들어간 새 빌드에만 있다 — OTA로 옛 빌드에 내려가도 죽지 않게 실제 등록 여부를 본다.
 * 호출처는 `NATIVE_SHEET ? <SystemSheet>내용</SystemSheet> : 기존 Modal 시트`로 쓰고, 안드로이드는 기존 시트 그대로다.
 * 내용(children)에는 딤 배경·손잡이·바깥 카드 배경을 넣지 않는다 — 시스템이 그린다.
 */
export const NATIVE_SHEET = Platform.OS === 'ios' && (() => {
  try { return UIManager.hasViewManagerConfig('TrueSheetView'); } catch { return false; }
})();

export default function SystemSheet({ visible, onClose, detents = ['auto'], scrollable, children }: {
  visible: boolean;
  /** 사용자가 내려서·바깥을 눌러 닫았을 때(호출처가 visible을 false로) */
  onClose: () => void;
  /** 기본 'auto'(내용 높이). 긴 목록은 [0.5, 1] — 중간 높이로 뜨고 끝까지 올리면 전체 */
  detents?: SheetDetent[];
  /** 내용이 ScrollView/FlatList 하나일 때 — 시트 드래그와 스크롤을 시스템이 이어 준다 */
  scrollable?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<TrueSheet>(null);
  const shownRef = useRef(false);
  // 닫힘 이벤트에서 최신 값을 읽는다 — 호출처가 이미 visible=false로 닫은 경우 onClose를 또 부르지 않게
  const visibleRef = useRef(visible);
  visibleRef.current = visible;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (visible && !shownRef.current) {
      shownRef.current = true;
      ref.current?.present().catch(() => { shownRef.current = false; });
    } else if (!visible && shownRef.current) {
      ref.current?.dismiss().catch(() => {});
    }
  }, [visible]);

  return (
    <TrueSheet
      ref={ref}
      detents={detents}
      grabber
      scrollable={scrollable}
      onDidDismiss={() => {
        shownRef.current = false;
        if (visibleRef.current) onCloseRef.current();
      }}
    >
      {children}
    </TrueSheet>
  );
}
