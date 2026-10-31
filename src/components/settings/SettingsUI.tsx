// 설정 화면 디자인(피그마 191:595 시안) 공용 부품 — SettingsScreen에서 옮겨 왔다.
// 카드·헤더·그룹·알약 버튼·모달 틀·선택 목록 행을 한 곳에 두어, 설정 계열 화면과 팝업이 같은 재질·치수를 쓰게 한다.
import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ui/Text';
import { select } from '../../utils/haptics';
import { QuestionIcon, LockClosedIcon as SvgLockClosedIcon, BackChevronIcon } from '../icons';
import { SettingsChevronIcon } from '../icons/SettingsIcons';
import { PillRing } from '../record/CalendarBottomSheet';
import { useSkinAccent } from '../../constants/skinTheme';
import { andFitText } from '../../utils/fitText';
import HeaderGlassButton from '../HeaderGlassButton';

export const SETTINGS_COLORS = {
  bg:         '#0A0A0F',
  white:      '#FFFFFF',
  textDim:    '#A1A1B0',
  purpleNeon: '#BF85FC',
  // 피그마 191:595 시안 값
  label:      '#AC6FFF',                  // 그룹 라벨·선택 체크
  line:       'rgba(255,255,255,0.15)',   // 헤더선·행 구분선(0.8pt)·팝업 알약 테두리
  text50:     'rgba(255,255,255,0.5)',    // 값·placeholder·안내문·푸터
  searchBg:   'rgba(255,255,255,0.06)',
  logout:     '#FF0138',
  // 펼친 본문(FAQ 답변·공지 본문) — 값(50%)보다 한 단계 밝게 읽히는 긴 글
  text70:     'rgba(255,255,255,0.7)',
  // 오류·삭제 전용 빨강(디자인 토큰) — 입력 오류 테두리·문구, 사진 삭제
  red:        '#FF3B30',
};
const COLORS = SETTINGS_COLORS;

// ─── 카드 재질 — 시안의 '흰색 3%'(카드)·'빨강 10%'(로그아웃) ───
// GlassSurface(리퀴드 글래스)는 쓰지 않는다: iOS 26 GlassView는 뒤를 블러하고 자체 밝기·반사광을 더해 검은 배경에서
// 회색 판으로 보이고, 구형 iOS 폴백도 흰 두께 그라데이션·specular 장식이 회색빛을 낸다(2026-10-26 사용자 지적).
// 카드 뒤는 단색 배경(#0A0A0F)뿐이라 시안 반투명색을 미리 합성한 불투명색을 칠한다 — 모든 플랫폼에서 시안처럼 검다.
//   #111116 = #0A0A0F + 흰 3%, #23090E = #0A0A0F + #FF0000 10%.
// 테두리는 앱 공용 기준 링(PillRing — 좌상단·우하단 흰색 대각 그라데이션, 2026-09-30 전면 통일)을 쓴다(사용자 지시).
const CARD_FILL = '#111116';
const LOGOUT_FILL = '#23090E';

/** 카드 배경 + 공용 링 — 부모(overflow:hidden + borderRadius) 안에 깔고 콘텐츠는 형제로 위에 올린다.
 *  링은 폭·높이를 숫자로 받아야 해서(안드로이드 RNSVG `%` 갱신 함정) 실측해 넘긴다. */
const CardSurface = ({ radius, fill = CARD_FILL, baseRim, noRing }: {
  radius: number;
  fill?: string;
  /** 공용 링 아래 깔 1px 단색 테두리 — 같은 채움 위에 놓인 버튼처럼 링의 투명 구간에서 윤곽이 사라질 때만 */
  baseRim?: string;
  /** 공용 링 생략 — 채움만으로 배경과 구분되는 버튼(차단 해제) */
  noRing?: boolean;
}) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: fill }]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width), h = Math.round(e.nativeEvent.layout.height);
        setSize((p) => (p.w === w && p.h === h ? p : { w, h })); // 같은 값 setState 루프 방지
      }}
    >
      {/* 단색 테두리는 형제 View로 — 컨테이너에 borderWidth를 주면 absolute 자식(링)이 테두리 안쪽 기준으로 1px 밀린다 */}
      {baseRim ? <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: baseRim }]} /> : null}
      {noRing ? null : <PillRing width={size.w} height={size.h} radius={radius} />}
    </View>
  );
};

/** 설정 카드 — SettingGroup과 같은 재질(#111116 + 공용 링, 모서리 22)의 맨 카드. 행·본문은 children으로 직접 그린다
 *  (공지·FAQ·차단 목록·권한 배너처럼 SettingItem 모양이 아닌 내용). */
export const SettingsCard = ({ children, radius = 22, baseRim, style }: {
  children?: React.ReactNode;
  radius?: number;
  /** 같은 채움의 팝업 카드 위에 놓일 때만 — SettingsPillButton.baseRim과 같은 이유 */
  baseRim?: string;
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[s.settingGroup, { borderRadius: radius }, style]}>
    <CardSurface radius={radius} baseRim={baseRim} />
    {children}
  </View>
);

/** 입력칸 — 설정 카드 재질의 한 줄(또는 여러 줄) 칸. TextInput·접두사·글자 수는 children으로 넣고
 *  글자 스타일은 settingsText.input을 쓴다. error면 빨간 1px 테두리를 링 위에 겹친다. */
export const SettingsField = ({ children, error, baseRim, style }: {
  children?: React.ReactNode;
  error?: boolean;
  baseRim?: string;
  style?: StyleProp<ViewStyle>;
}) => (
  <SettingsCard radius={FIELD_RADIUS} baseRim={baseRim} style={[s.field, style]}>
    {children}
    {/* 오류 테두리는 형제 오버레이로 — 터치는 아래 TextInput으로 통과(View pointerEvents는 안드로이드도 지킨다) */}
    {error ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.fieldError]} /> : null}
  </SettingsCard>
);
const FIELD_RADIUS = 22;

/** 빈 상태·안내 — 아이콘(선택) + 흰 50% 문구. 목록이 비었을 때 화면 가운데에 둔다. */
export const SettingsEmptyState = ({ icon, title, desc, style }: {
  icon?: React.ReactNode;
  title: string;
  desc?: string;
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[s.empty, style]}>
    {icon}
    <Text style={s.emptyTitle}>{title}</Text>
    {desc ? <Text style={s.emptyDesc}>{desc}</Text> : null}
  </View>
);

const BACK_HIT_SLOP = { top: 4, bottom: 4, left: 4, right: 4 };
const BACK_W = 40; // 뒤로 버튼 폭 = 오른쪽 슬롯 최소 폭(s.backBtn·s.headerSide와 같은 값)

// ─── 헤더 — 뒤로(chevron) · 가운데 제목 · 오른쪽 슬롯(없으면 뒤로 버튼과 같은 폭의 빈 자리로 제목을 가운데 유지) ───
export const SettingsHeader = ({ title, onBack, right, backA11yLabel }: {
  title: string;
  onBack: () => void;
  /** 오른쪽 슬롯 — 최소 폭 40(뒤로 버튼과 같음). 더 넓으면 제목이 그만큼 왼쪽으로 비켜난다 */
  right?: React.ReactNode;
  /** 뒤로 버튼 스크린리더 라벨 — 화면마다 써 오던 키(friends.back 등)를 그대로 유지하려고 받는다. 생략 = settings.back */
  backA11yLabel?: string;
}) => {
  const { t } = useTranslation();
  // 오른쪽 슬롯이 뒤로 버튼(40)보다 넓으면(저장 알약 70 등) 제목 칸 중심이 그만큼 왼쪽으로 쏠린다 —
  // 넓은 만큼 제목 왼쪽에 여백을 줘서 화면 가운데로 되돌린다.
  const [rightW, setRightW] = useState(BACK_W);
  return (
    <View style={s.header}>
      {/* 버튼은 40×40(시안 배치), 터치 영역은 hitSlop으로 48×48 — 권장 최소 44 이상 */}
      <HeaderGlassButton back style={s.backBtn} activeOpacity={0.7} onPress={onBack} hitSlop={BACK_HIT_SLOP} accessibilityLabel={backA11yLabel ?? t('settings.back')}>
        <BackChevronIcon />
      </HeaderGlassButton>
      <Text style={[s.headerTitle, s.headerTitleFlex, { paddingLeft: Math.max(0, rightW - BACK_W) }]} numberOfLines={1}>{title}</Text>
      <View
        style={s.headerSide}
        onLayout={(e) => {
          const w = Math.round(e.nativeEvent.layout.width);
          setRightW((p) => (p === w ? p : w)); // 같은 값 setState 루프 방지
        }}
      >
        {right}
      </View>
    </View>
  );
};

export type SettingItem = {
  icon: React.ReactNode;
  label: string;
  value?: string;
  badge?: string;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  /** 있으면 라벨 바로 오른쪽에 작은 물음표 버튼 — 무엇이 바뀌는지 보여주는 도움말을 연다 */
  onHelp?: () => void;
  /** 물음표 버튼의 스크린리더 라벨 (onHelp와 짝) */
  helpA11yLabel?: string;
  /** 라벨 아래 보조 설명(11·흰 50%) — 알림 토글 설명, 계정 이메일·비밀번호 상태 */
  description?: string;
  /** 토글 행 비활성 — 흐리게(0.4) + 스위치 잠금 + 꺼진 것으로 표시(전체 알림이 꺼졌을 때의 하위 토글) */
  disabled?: boolean;
  /** false = 꺾쇠 숨김. 눌러도 아무 일 없는 정보 행(연결된 소셜 계정 등)이 눌리는 행처럼 보이지 않게 */
  chevron?: boolean;
};

// ─── 설정 그룹(라벨 + 카드) ───
// 검색으로 항목이 다 걸러지면(items 빈 배열) 라벨과 카드를 통째로 그리지 않는다.
export const SettingGroup = ({
  label,
  items,
  radius = 22,
  style,
  labelStyle,
  baseRim,
}: {
  label?: string;
  items: SettingItem[];
  /** 카드 모서리 — 기본 22, 메이트 추천 단독 카드는 30(시안) */
  radius?: number;
  style?: StyleProp<ViewStyle>;
  /** 그룹 라벨 간격 덮어쓰기 — 메이트 안내문 바로 뒤 '앱 설정'만 위 간격 25 */
  labelStyle?: StyleProp<TextStyle>;
  /** 카드 윤곽선 — SettingsCard.baseRim 그대로 전달(계정 설정처럼 배경과 겹쳐 보일 때) */
  baseRim?: string;
}) => {
  const skinAccent = useSkinAccent();
  if (items.length === 0) return null;
  return (
  <>
    {label ? <Text style={[settingsText.groupLabel, labelStyle]}>{label}</Text> : null}
    <SettingsCard radius={radius} baseRim={baseRim} style={style}>
      {items.map((item, index) => {
      const rowStyle = [s.settingItem, item.description ? s.settingItemTall : null, item.disabled ? s.settingItemDisabled : null];
      const content = (
        <>
          <View style={s.settingLeft}>
            {/* 아이콘마다 원본 크기가 달라(13.5~27) 고정폭 슬롯 가운데에 둔다 — 슬롯 중심 = 카드 왼쪽 36pt */}
            <View style={s.settingIconWrap}>{item.icon}</View>
            {item.description ? (
              <View style={s.settingLabelCol}>
                <Text style={s.settingLabel}>{item.label}</Text>
                <Text style={s.settingDesc}>{item.description}</Text>
              </View>
            ) : (
              <Text style={s.settingLabel}>{item.label}</Text>
            )}
            {item.onHelp && (
              // 바깥 행이 눌리는 행이어도 이 버튼이 먼저 눌린다: RN 응답자 협상은 버블 단계에서 가장 안쪽
              // 터치 대상부터 onStartShouldSetResponder를 묻는다(Pressability.js). 토글·정보 행은 바깥이 View라 경쟁이 없다.
              <TouchableOpacity
                style={s.settingHelpBtn}
                onPress={item.onHelp}
                activeOpacity={0.6}
                hitSlop={{ top: 12, bottom: 12, left: 10, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={item.helpA11yLabel ?? item.label}
              >
                <QuestionIcon size={15} color={COLORS.textDim} />
              </TouchableOpacity>
            )}
          </View>
          {item.onToggle != null ? (
            <Switch
              // 비활성 행은 저장값과 무관하게 꺼진 것으로 보인다(상위 토글이 꺼져 실제로 안 울리므로)
              value={item.disabled ? false : item.toggle}
              disabled={item.disabled}
              accessibilityLabel={item.label}
              // RN iOS Switch는 style 앞에 alignSelf:'flex-start'를 강제로 섞는다(Switch.js) —
              // 행이 minHeight 60이라 그대로 두면 토글이 행 위쪽에 붙는다. 가운데로 되돌린다.
              style={s.settingSwitch}
              // 스위치가 켜지고 꺼지는 순간 — SettingGroup이 공용이라 이 그룹의 모든 토글에 적용된다.
              // '햅틱' 스위치 자신도 여기를 지난다: 끌 때는 게이트가 아직 열려 있어 마지막 한 번이
              // 울리고, 켤 때는 반영 전이라 울리지 않는다. 어느 쪽이든 오작동이 아니다.
              onValueChange={(v) => { select(); item.onToggle?.(v); }}
              trackColor={{ false: '#3A3A4A', true: skinAccent.accent }}
              thumbColor="#FFFFFF"
            />
          ) : item.badge ? (
            <View style={[s.premiumBadge, { backgroundColor: skinAccent.tint(0.15), borderColor: skinAccent.tint(0.3) }]}>
              <SvgLockClosedIcon size={9} color={skinAccent.accent} />
              <Text style={[s.premiumBadgeText, { color: skinAccent.accent }]}>{item.badge}</Text>
            </View>
          ) : (
            <View style={s.settingRight}>
              {item.value ? <Text style={s.settingValue} numberOfLines={1}>{item.value}</Text> : null}
              {item.chevron === false ? null : <SettingsChevronIcon />}
            </View>
          )}
        </>
      );
      return (
      <React.Fragment key={item.label}>
        {item.onPress && item.onToggle == null ? (
          <TouchableOpacity
            style={rowStyle}
            activeOpacity={0.7}
            // 검색 중 행을 누르면 키보드부터 내린다 — 열린 채로 시트·모달이 뜨면 iOS에서 키보드가 시트를 가린다
            onPress={() => { Keyboard.dismiss(); item.onPress!(); }}
            // 물음표가 있는 행은 행 자체를 접근성 요소로 묶지 않는다 — TouchableOpacity는 기본 accessible이라
            // iOS VoiceOver가 행 전체를 한 덩어리로 읽어 안쪽 물음표 버튼에 초점이 가지 않는다.
            accessible={item.onHelp ? false : undefined}
          >
            {content}
          </TouchableOpacity>
        ) : (
          // 토글 행·정보 행(앱 버전·연결된 소셜 계정)은 누를 동작이 없어 일반 View로 그린다.
          //  · 토글 행: disabled TouchableOpacity로 감싸면 기본 accessible이라 iOS VoiceOver가 행을 한 덩어리
          //    ("흐리게 표시됨")로 묶어 안쪽 Switch에 초점이 가지 않는다 → View는 accessible이 아니어서 Switch가
          //    (accessibilityLabel=라벨로) 따로 초점을 받는다. 물음표 버튼도 마찬가지로 따로 잡힌다.
          //  · 정보 행: disabled를 주면 스크린리더가 '비활성'으로 읽는다 → 라벨·값을 한 요소로만 묶고(accessible)
          //    비활성 상태는 붙이지 않는다. 물음표가 있으면 묶지 않는다(위와 같은 이유).
          <View style={rowStyle} accessible={item.onToggle == null && !item.onHelp ? true : undefined}>
            {content}
          </View>
        )}
        {/* 행 구분선 — 시안은 카드 전체 폭(들여쓰기 없음) */}
        {index < items.length - 1 && <SettingsDivider />}
      </React.Fragment>
      );
      })}
    </SettingsCard>
  </>
  );
};

/** 행 구분선 — 카드 전체 폭 0.8pt 흰 15%. 앞 행 아래쪽에 겹쳐 그려(marginTop -0.8) 행 간격이 60.8이 되지 않는다.
 *  FlatList의 ItemSeparatorComponent로도 그대로 쓴다. */
export const SettingsDivider = () => <View style={s.itemDivider} />;

/** 팝업 선택 목록 행 — 설정 행과 같은 치수(높이 60·좌 20/우 19·라벨 14 흰색). 선택되면 오른쪽 끝에 보라 ✓. */
export const SettingsOptionRow = ({ label, onPress, selected, left, right, danger }: {
  label: string;
  onPress: () => void;
  /** 삭제·차단·신고 같은 위험 행 — 라벨 빨강(디자인 토큰) */
  danger?: boolean;
  /** 생략 = 선택 개념이 없는 행(체크 자리도 없음) */
  selected?: boolean;
  /** 라벨 앞 부속물(스킨 색 원 등) */
  left?: React.ReactNode;
  /** 라벨 뒤·체크 앞 부속물(잠금·미리보기·'변경' 등) */
  right?: React.ReactNode;
}) => (
  <TouchableOpacity
    style={[s.settingItem, s.optionRow]}
    activeOpacity={0.7}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityState={selected != null ? { selected } : undefined}
  >
    {left}
    <Text style={[s.settingLabel, s.optionLabel, danger && { color: COLORS.red }]} numberOfLines={1}>{label}</Text>
    {right}
    {selected ? <Text style={s.optionCheck}>✓</Text> : null}
  </TouchableOpacity>
);

/** 알약 버튼 — 높이 60·모서리 30(compact = 36·18, 행 안에 들어가는 작은 버튼). 배경은 터치러블 밖 형제로 깔아
 *  눌림 중에도 채움이 흐려지지 않는다. */
export const SettingsPillButton = ({ label, onPress, tone = 'default', icon, baseRim, noRing, disabled, compact, style }: {
  label: string;
  onPress: () => void;
  /** danger = 로그아웃·계정 삭제·차단 해제(빨강 10% 채움 + 빨간 글자) */
  tone?: 'default' | 'danger';
  icon?: React.ReactNode;
  /** 같은 채움의 카드 위에 놓일 때(팝업) 링 투명 구간에서 윤곽이 사라지지 않게 까는 1px 테두리 색 */
  baseRim?: string;
  /** 공용 그라데이션 링 생략 — 채움색이 배경과 달라 테두리가 필요 없는 버튼(차단 해제) */
  noRing?: boolean;
  /** 눌리지 않음 + 흐리게(0.4) — 입력 조건 미충족·제출 중 */
  disabled?: boolean;
  /** 목록 행·배너 안에 들어가는 작은 알약(높이 36). 폭은 글자에 맞춘다 */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) => (
  <View style={[s.pillBtn, compact && s.pillBtnCompact, disabled && s.pillDisabled, style]}>
    <CardSurface radius={compact ? 18 : 30} fill={tone === 'danger' ? LOGOUT_FILL : CARD_FILL} baseRim={baseRim} noRing={noRing} />
    <TouchableOpacity
      style={[s.pillInner, compact && s.pillInnerCompact]}
      activeOpacity={0.7}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={disabled ? { disabled: true } : undefined}
    >
      {icon}
      {/* 안드로이드 한글 폰트가 넓어 좁은 알약(나란히·compact)에서 두 줄로 깨지지 않게 한 줄 + 자동 축소 */}
      <Text style={[tone === 'danger' ? s.pillTextDanger : s.pillText, compact && s.pillTextCompact]} {...andFitText}>{label}</Text>
    </TouchableOpacity>
  </View>
);

/** 팝업 틀 — 투명 fade Modal + 어두운 오버레이 + CardSurface 카드(모서리 22·높이 상한 85%) + 제목·설명 + 본문 + 하단 알약.
 *  중앙 카드라 안전영역은 오버레이 여백으로 충분하다. 본문 목록은 flexShrink로 상한 안에서 스크롤해야 알약이 화면에 남는다. */
export const SettingsModal = ({
  visible, title, description, closeLabel, onClose, onDismiss, avoidKeyboard, backdropDismiss = true, titleStyle, cardStyle, children,
}: {
  visible: boolean;
  title: string;
  titleStyle?: StyleProp<TextStyle>;
  description?: string;
  /** 하단 알약 문구(취소·닫기) */
  closeLabel: string;
  /** 하단 알약 */
  onClose: () => void;
  /** 배경 탭·안드로이드 뒤로 — 생략하면 onClose. 단계가 있는 팝업은 '한 단계 뒤로'를 넘긴다 */
  onDismiss?: () => void;
  /** 입력칸이 있는 팝업 — statusBarTranslucent 모달은 안드로이드 adjustResize가 꺼져 KAV로 키보드를 직접 피한다 */
  avoidKeyboard?: boolean;
  /** false = 배경 탭으로 닫지 않는다(안드로이드 뒤로는 그대로 onDismiss). 비밀번호 등 입력 중인 폼이 실수 탭에 날아가지 않게 */
  backdropDismiss?: boolean;
  cardStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) => {
  const dismiss = onDismiss ?? onClose;
  const body = (
    // 배경 탭 닫기는 카드 '뒤'에 깐 형제 층이 받는다 — 카드는 일반 View라 터치를 가로채지 않는다.
    // ⚠️ 예전엔 카드를 Pressable(onPress 빈 함수)로 감싸 탭을 삼켰는데, Pressable은 터치 시작에 응답자를 먼저 차지하고
    //    안드로이드 blockNativeResponder 기본값 true로 안쪽 네이티브 스크롤까지 막았다 — 장기 체류 안내 슬라이드(가로
    //    ScrollView)가 넘어가지 않던 원인(2026-10-27). 카드 빈 곳 탭은 카드 View → 오버레이 View로 올라가도 받는 이가 없어
    //    닫히지 않는다(오닫힘 방지는 그대로).
    // 배경 층은 accessible={false}·focusable={false} — 스크린리더 사용자는 하단 알약(또는 안드로이드 뒤로)으로 닫는다.
    <View style={s.modalOverlay} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} accessible={false} focusable={false} onPress={backdropDismiss ? dismiss : undefined} />
      <View style={[s.modalCard, cardStyle]}>
        <CardSurface radius={22} />
        <Text style={[settingsText.sheetTitle, titleStyle]}>{title}</Text>
        {description ? <Text style={settingsText.sheetDesc}>{description}</Text> : null}
        {children}
        {/* 팝업 카드와 채움이 같아 링 가운데(투명) 구간에서 윤곽이 사라진다 — 옅은 흰 테두리를 아래에 깐다 */}
        <SettingsPillButton label={closeLabel} onPress={onClose} baseRim={COLORS.line} style={s.modalClose} />
      </View>
    </View>
  );
  return (
    <Modal
      visible={visible}
      transparent statusBarTranslucent navigationBarTranslucent
      animationType="fade"
      onRequestClose={dismiss}
    >
      {avoidKeyboard ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>{body}</KeyboardAvoidingView>
      ) : body}
    </Modal>
  );
};

/** 설정 화면 글자 스타일 — 그룹 라벨(12 Bold 보라)·카드 아래 안내문 */
export const settingsText = StyleSheet.create({
  // 그룹 라벨 — 12 Bold #AC6FFF, x=33(카드보다 17 안쪽), 위 23·아래 9
  groupLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.label,
    marginTop: 23,
    marginBottom: 9,
    marginLeft: 17,
  },
  // 카드 아래 안내문 — 10pt·흰 50%·행간 1.4, x=33, 카드 아래 9
  groupNote: {
    fontSize: 10,
    lineHeight: 14,
    color: COLORS.text50,
    marginTop: 9,
    marginLeft: 17,
    marginRight: 17,
  },
  // 입력칸 라벨 — 그룹 라벨과 같은 들여쓰기(17)·흰 50%
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text50,
    marginBottom: 8,
    marginLeft: 17,
  },
  // SettingsField 안 TextInput 글자 — 설정 행 라벨과 같은 14 흰색. 세로 여백은 입력칸 자신이 가져 칸 전체가 눌린다
  input: {
    flex: 1,
    fontSize: 14,
    color: COLORS.white,
    paddingHorizontal: 0,
    paddingVertical: 15,
  },
  // 팝업·시트 제목 — 헤더 제목(18 ExtraBold·자간 0.72)을 가운데 정렬. SettingsModal·LanguageSheet가 쓴다
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.72,
    color: COLORS.white,
    textAlign: 'center',
    fontFamily: Platform.select({ ios: 'AppleSDGothicNeo-ExtraBold', default: undefined }),
  },
  // 팝업·시트 설명 — 설정 값 텍스트와 같은 흰 50%
  sheetDesc: { fontSize: 13, lineHeight: 19, color: COLORS.text50, textAlign: 'center', marginTop: 8 },
});

const s = StyleSheet.create({
  // 헤더 — 시안: 제목 18 ExtraBold·자간 0.72, 아래 전폭 0.8pt 흰 15% 구분선
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderBottomWidth: 0.8,
    borderBottomColor: COLORS.line,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.72,
    color: COLORS.white,
    // 시안 서체 AppleSDGothicNeo ExtraBold — iOS는 이름으로 지정, 안드로이드는 weight 800으로 근사(BlogRecordScreen countryChipText와 같은 방식)
    fontFamily: Platform.select({ ios: 'AppleSDGothicNeo-ExtraBold', default: undefined }),
  },
  // 제목이 양옆 사이 남는 폭을 차지하고 가운데 정렬 — 양옆 폭이 같으면 화면 가운데와 일치한다
  headerTitleFlex: { flex: 1, textAlign: 'center', marginHorizontal: 8 },
  headerSide: {
    minWidth: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 설정 카드 — 배경은 CardSurface가 깐다(모서리는 SettingGroup radius로 덮어씀)
  settingGroup: {
    borderRadius: 22,
    overflow: 'hidden',
  },
  // 행 높이 60, 아이콘 슬롯 왼쪽 20 → 슬롯 중심 36, 라벨 시작 20+32+12=64(x=80)
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingLeft: 20,
    paddingRight: 19,
  },
  // 왼쪽 묶음이 남는 폭을 차지하되 줄어들 수 있게 해서, 라벨이 길어져도(영어 '메이트 추천' 등)
  // 오른쪽 스위치·값을 밀어내거나 겹치지 않고 라벨이 줄바꿈된다.
  settingLeft: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  settingSwitch: { alignSelf: 'center' },
  // 설명이 붙은 행 — 두세 줄이 되면 minHeight 60을 넘으므로 위아래 여백을 준다
  settingItemTall: { paddingVertical: 12 },
  settingItemDisabled: { opacity: 0.4 },
  settingLabelCol: { flexShrink: 1, gap: 2 },
  settingDesc: { fontSize: 11, lineHeight: 16, color: COLORS.text50 },
  // settingLeft의 gap 12는 아이콘-라벨 간격용이라, 물음표는 음수 여백으로 라벨에 붙인다(실간격 6)
  settingHelpBtn: { marginLeft: -6 },
  settingIconWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.white,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: '50%', // 값이 길어도 라벨 자리를 다 먹지 않게 — 넘치면 값이 말줄임된다
  },
  settingValue: {
    flexShrink: 1,
    fontSize: 14,
    color: COLORS.text50,
  },
  // 행 구분선 — 카드 전체 폭, 0.8pt 흰 15%
  itemDivider: {
    height: 0.8,
    marginTop: -0.8,
    backgroundColor: COLORS.line,
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(107,33,168,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(191,133,252,0.3)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  premiumBadgeText: {
    fontSize: 9,
    color: COLORS.purpleNeon,
  },

  // 팝업 선택 행 — 부속물 간격 12(설정 행 아이콘-라벨 간격과 같다)
  optionRow: { gap: 12 },
  optionLabel: { flex: 1 },
  optionCheck: { fontSize: 16, color: COLORS.label },

  // 알약 — 높이 60·모서리 30
  pillBtn: {
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
  },
  pillInner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pillText: { fontSize: 14, fontWeight: '500', color: COLORS.white },
  pillTextDanger: { fontSize: 14, color: COLORS.logout },
  pillBtnCompact: { height: 36, borderRadius: 18 },
  pillInnerCompact: { paddingHorizontal: 16, gap: 6 },
  pillTextCompact: { fontSize: 13 },
  pillDisabled: { opacity: 0.4 },

  // 입력칸 — 행 높이와 맞춘 최소 50, 좌우 18
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  fieldError: { borderRadius: FIELD_RADIUS, borderWidth: 1, borderColor: COLORS.red },

  // 빈 상태 — 문구는 흰 50%
  empty: { alignItems: 'center', gap: 12, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text50, textAlign: 'center' },
  emptyDesc: { fontSize: 12, lineHeight: 18, color: COLORS.text50, textAlign: 'center', marginTop: -4 },

  // 팝업
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(10,10,15,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  // 설정 카드와 같은 모서리 22·검은 채움(CardSurface가 깐다)
  modalCard: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '85%', // 목록이 길어도·큰 글자에서도 하단 알약이 화면 안에 남도록
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 24,
    paddingBottom: 16,
  },
  // 제목은 헤더 '설정'(headerTitle) 스타일을 그대로 쓰고 가운데 정렬만 더한다
  modalClose: { marginTop: 14 },
});
