import React from 'react';
import { useTranslation } from 'react-i18next';
import MenuSheet, { MenuSheetItem, MenuSheetDivider, MENU_DANGER } from './MenuSheet';
import { PersonIcon, BlockIcon } from './icons';

// 팔로워/팔로잉 목록 ⋯ 메뉴 — 앱 공용 ⋯ 바텀시트(components/MenuSheet, 2026-11-04 통일).
// 예전엔 iOS 액션시트 흉내(#1E1E2E 카드·가운데 글자·따로 떨어진 취소 카드)였다. 대상 @아이디는 시트 머리 한 줄로.
export default function UserActionSheet({
  visible,
  name,
  showUnfollow,
  onClose,
  onUnfollow,
  onBlock,
}: {
  visible: boolean;
  name: string; // 표시용 핸들 (@ 없이)
  showUnfollow: boolean; // 내가 팔로우 중일 때만 언팔로우 노출
  onClose: () => void;
  onUnfollow: () => void;
  onBlock: () => void;
}) {
  const { t } = useTranslation();
  return (
    <MenuSheet visible={visible} onClose={onClose} title={`@${name}`}>
      {showUnfollow && (
        <>
          <MenuSheetItem icon={<PersonIcon size={18} color="#FFFFFF" />} label={t('friends.unfollow')} onPress={onUnfollow} />
          <MenuSheetDivider />
        </>
      )}
      <MenuSheetItem icon={<BlockIcon size={18} color={MENU_DANGER} />} label={t('friends.block')} onPress={onBlock} danger />
    </MenuSheet>
  );
}
