import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../ui/Text';

import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { SearchIcon, BackChevronIcon } from '../components/icons';
import AuthorAvatar from '../components/AuthorAvatar';
import { AutoPillRing } from '../components/record/CalendarBottomSheet';
import { useSkinAccent } from '../constants/skinTheme';
import { useProfileSettings } from '../store/settingsStore';
import { useRecordData, useSocialGraph, useRecordActions } from '../store/recordStore';
import { andFitText } from '../utils/fitText';
import { countryLabel } from '../utils/countryLabel';
import { isKoreanLang } from '../utils/langKind';
import { COUNTRIES } from '../constants/countries';
import { isSupabaseConfigured } from '../services/supabase';
import { searchProfiles, getMyUserId, getCountryCounts, getFollowerCounts } from '../services/profile';
import { fetchMateSuggestions, fetchIncomingNeighborRequests } from '../services/social';
import { matchPercent, pickReason } from '../utils/matchScore';
import { labelFromKey } from '../utils/travelDnaScore';
import { tap } from '../utils/haptics';
import { profileLink } from '../utils/appLinks';
import Toast from '../components/Toast';
import { useTravelDna } from '../store/travelDnaStore';
import type { RootStackScreenProps } from '../navigation/types';

// ─────────────────────────────────────────────
// 디자인 토큰
// ─────────────────────────────────────────────
const C = {
  bg: '#0A0A0F',
  card: '#2E2E3B',
  accent: '#BF85FC',
  accentDark: '#6B21A8',
  dim: '#A1A1B0',
  white: '#FFFFFF',
  divider: '#1A1A26',
  gray: '#3A3A4A',
  // 2026-10 추천메이트 시안
  headerLine: '#25262A', // 헤더 아래 전폭 구분선
  searchBg: '#18191D',   // 검색창 채움
  mateFill: '#7C3AED',   // 메이트 신청/수락 단색 필 — 스킨 무관 고정색(skinTheme엔 단색 버튼 토큰이 없다)
  chipBg: '#1D1E21',     // 겹치는 나라 칩
  chipBorder: 'rgba(255,255,255,0.12)',
  chipText: 'rgba(255,255,255,0.7)',
  // 피그마 2025:2423 글자색 — 섹션 라벨·일치도는 스킨 무관 고정 보라
  labelPurple: '#AC6FFF',
  textHalf: 'rgba(255,255,255,0.5)', // 근거 문구·검색 안내 문구
};

// 겹치는 나라 칩은 이 개수까지 선명하게, 그 뒤(4번째부터)는 흐리게(시안).
// ⚠️ mate_suggestions의 sample_countries는 지금 서버에서 [1:3]으로 잘려 온다(supabase/schema.sql:1220-1221)
//    — 서버 상한을 올리기 전까지 흐린 칩은 나타나지 않는다.
const BRIGHT_FLAG_CHIPS = 3;

// 딥링크 생성은 utils/appLinks의 profileLink만 사용한다(핸들 인코딩·스킴 소문자 규칙 포함).

// ─────────────────────────────────────────────
// 검색/추천 결과 메이트 타입
// ─────────────────────────────────────────────
interface ContactFriend {
  id: string;
  name: string;
  initial: string;
  username: string;
  countries: number;
  followers?: number;     // 메이트 수
  photo?: string | null; // 프로필 사진 URL (있으면 아바타로 표시)
  emoji?: string | null;  // 프로필 이모지 (사진 없을 때)
  sharedCount?: number;       // 여행겹침 행일 때만
  sharedCountries?: string[]; // 겹친 나라 샘플(한글 country_name)
  mutualCount?: number;       // 함께 아는 메이트 수(여행 DNA)
  matchScore?: number;        // 여행 DNA 종합 점수(mate_suggestions.total_score)
  // 축별 점수 — 추천 근거 문구 선택에 쓴다(placeScore는 pickReason 미사용 — sharedCities/sharedCount로 판단)
  recencyScore?: number;
  surveyScore?: number; // 설문 성향 유사도 — 예전 season/interest/taste 3축을 대체
  sharedCities?: string[];
  dnaTypeKey?: string | null; // 여행 DNA 유형 키(추천 행만) — utils/travelDnaScore.labelFromKey로 문구화
  // 추천 섹션에서 온 행인지 — 검색 결과와 부가정보(방문국·메이트 수) 표기가 다르다.
  // 추천 행은 방문국 수를 조회하지 않으므로 '방문 기록 없음'으로 오표기하면 안 된다.
  fromSuggestion?: boolean;
}

// 한글 국가명 → 국기 이모지. 겹치는 나라 칩에 쓴다(RPC sample_countries는 한글명).
const FLAG_BY_KO_NAME: Record<string, string> = {};
for (const c of COUNTRIES) {
  if (!FLAG_BY_KO_NAME[c.name]) FLAG_BY_KO_NAME[c.name] = c.flag;
}
FLAG_BY_KO_NAME['한국'] = FLAG_BY_KO_NAME['대한민국'] ?? '🇰🇷'; // 구 표기 별칭

// ─────────────────────────────────────────────
// 메이트 신청 버튼 — 상태 4종을 시각적으로 구분한다.
//   신청 가능: 단색 보라 필(C.mateFill) — 지금 누를 것
//   수락 대기: 같은 단색 필 — 상대가 나에게 신청해 둔 상태. 신청보다 더 확실한 CTA다
//   신청됨   : 스킨색 아웃라인 고스트 — 되돌릴 수 있는 대기 상태
//   메이트   : 무채색 고스트 — 완료돼 더 이상 유도하지 않음
// 누를 때 살짝 눌리는 스프링(0.94)으로 촉감을 준다. 시안(2026-10)대로 그라데이션·글로우 없음.
// ─────────────────────────────────────────────
function MateButton({
  state,
  label,
  onPress,
  accent,
  tint,
}: {
  state: 'idle' | 'incoming' | 'requested' | 'mate';
  label: string;
  onPress: (e: any) => void;
  accent: string;
  tint: (a: number) => string;
}) {
  const press = useRef(new Animated.Value(0)).current;
  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] });
  const to = (v: number) =>
    Animated.spring(press, { toValue: v, friction: 7, tension: 220, useNativeDriver: true }).start();

  // 수락 대기도 '지금 누를 버튼'이라 신청 가능과 같은 단색 필 위계를 준다
  const ghost = state !== 'idle' && state !== 'incoming';
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <TouchableOpacity
        onPress={onPress}
        onPressIn={() => to(1)}
        onPressOut={() => to(0)}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          s.mateBtn,
          ghost
            ? {
                borderWidth: 1,
                borderColor: state === 'requested' ? tint(0.5) : 'rgba(255,255,255,0.16)',
                backgroundColor: state === 'requested' ? tint(0.12) : 'rgba(255,255,255,0.06)',
              }
            : { backgroundColor: C.mateFill },
        ]}
      >
        {/* 단색 필에만 앱 기준 링(대각 흰 그라데이션). 고스트는 자체 borderWidth가 있어 겹치지 않게 뺀다.
            AutoPillRing은 부모를 실측하므로 필에 borderWidth·overflow hidden을 주지 말 것 */}
        {!ghost && <AutoPillRing />}
        <Text
          style={[
            s.mateBtnTxt,
            state === 'requested' && { color: accent },
            state === 'mate' && { color: C.dim },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// 메이트 아이템 (검색 결과·추천 메이트 공통)
// ─────────────────────────────────────────────
function FriendItem({
  item,
  following,
  requested,
  incoming,
  onToggle,
  onPress,
}: {
  item: ContactFriend;
  following: boolean; // 이미 메이트(서로메이트) 상태
  requested: boolean; // 메이트 신청을 보내고 수락 대기 중인 상태
  incoming: boolean;  // 상대가 나에게 신청해 둔 상태 — 내 행동은 '신청'이 아니라 '수락'
  onToggle: () => void;
  onPress?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const skinAccent = useSkinAccent(); // 고스트 버튼(신청됨)을 스킨 강조색으로 — 일치도는 피그마 고정 보라
  const shared = item.sharedCountries ?? [];
  const overlapCount = item.sharedCount ?? shared.length;
  const pct = matchPercent(item.matchScore);
  // 겹치는 나라 국기 칩 (한 줄, 넘치면 잘림). BRIGHT_FLAG_CHIPS개 이후(4번째부터)는 흐리게(시안의 '스위스' 칩).
  const flags = shared.map((c) => ({
    name: countryLabel(c, i18n.language),
    flag: FLAG_BY_KO_NAME[c] ?? '',
  }));

  // 추천 이유 한 줄.
  // 추천 행: 겹친 나라가 1곳 이상이면 항상 '나와 겹치는 나라 N곳'(시안) — 도시 근거(reasonCity)가
  //   있어도 이쪽이 이긴다. 겹친 나라가 0이면 pickReason(도시 > 시의성 > 설문 성향 > 함께 아는 메이트)
  //   → 그래도 없으면 중립 문구.
  // 검색 결과: pickReason 입력이 전부 비어 null → 방문국·메이트 수를 쓴다
  // (추천 행은 방문국 수를 조회하지 않아 '방문 기록 없음'이 되면 오표기가 된다).
  const reason = pickReason({
    recencyScore: item.recencyScore ?? 0,
    surveyScore: item.surveyScore ?? 0,
    mutualCount: item.mutualCount ?? 0,
    sharedCities: item.sharedCities ?? [],
    sharedCount: overlapCount,
  });
  const reasonText = item.fromSuggestion && overlapCount > 0
    ? t('friends.overlapReason', { count: overlapCount })
    : reason
    ? t(reason.key, reason.params)
    : item.fromSuggestion
      ? t('friends.suggestedReason')
      : `${item.countries > 0 ? t('friends.countriesVisitedN', { count: item.countries }) : t('friends.noVisitRecord')}${item.followers ? ` · ${t('friends.followers')} ${item.followers}` : ''}`;

  // 상대의 여행 DNA 유형 — 서버가 공개하는 건 type_key뿐(축 점수는 비공개, 설계 §9).
  // 키가 없거나(설문 미완료) 해석 불가면 labelFromKey가 null을 주고, 그때는 줄 자체를 뺀다.
  const dnaLabel = labelFromKey(item.dnaTypeKey);
  const dnaText = dnaLabel ? (isKoreanLang(i18n.language) ? dnaLabel.ko : dnaLabel.en) : null; // ja는 영문 라벨

  return (
    <TouchableOpacity style={s.friendItem} onPress={onPress} activeOpacity={0.75}>
      {/* 앱 공용 아바타 — 사진 없거나 로드 실패면 DefaultAvatar(원+림+실루엣)를 그린다.
          배경 컨테이너를 두지 않는다 — 깔면 DefaultAvatar 림이 묻힌다.
          profiles.emoji는 스키마 기본값 '🧳'이 전 계정에 박혀 있어 폴백으로 쓰면 안 된다. */}
      <AuthorAvatar photo={item.photo ?? undefined} size={58} />
      <View style={s.friendInfo}>
        {/* 닉네임 폐지 — 아이디 한 줄만 표시(@ 접두 없음) */}
        <Text style={s.friendUsername} numberOfLines={1}>{item.username}</Text>
        {/* 근거 문구 + 여행 DNA 일치도(RPC 종합 점수). 임계 미만이면 pct가 null → 일치도 생략 */}
        <View style={s.reasonRow}>
          <Text style={s.friendCountries} numberOfLines={1} {...andFitText}>{reasonText}</Text>
          {pct != null && (
            <Text style={s.matchPctTxt} numberOfLines={1}>{t('friends.matchPercent', { pct })}</Text>
          )}
        </View>
        {/* 여행 DNA 유형 — 축 점수는 비공개, 라벨 문구만(설계 §9·§10) */}
        {!!dnaText && (
          <View style={s.dnaTypeChip}>
            <Text style={s.dnaTypeChipTxt} numberOfLines={1}>{dnaText}</Text>
          </View>
        )}
        {/* 겹치는 나라를 국기 칩으로 — 한 줄, 넘치면 가로로 밀어 본다 */}
        {flags.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.flagRow}
            contentContainerStyle={s.flagRowContent}
          >
            {flags.map((f, i) => (
              <View
                key={`${f.name}-${i}`}
                style={[s.flagChip, i >= BRIGHT_FLAG_CHIPS && { opacity: 0.35 }]}
              >
                <Text style={s.flagChipTxt} numberOfLines={1}>{f.flag ? `${f.flag} ` : ''}{f.name}</Text>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
      <MateButton
        state={following ? 'mate' : incoming ? 'incoming' : requested ? 'requested' : 'idle'}
        label={following
          ? t('friends.neighborActive')
          : incoming
            ? t('friends.neighborAccept')
            : requested
              ? t('friends.neighborRequested')
              : t('friends.neighborRequest')}
        onPress={(e) => { e.stopPropagation?.(); onToggle(); }}
        accent={skinAccent.accent}
        tint={skinAccent.tint}
      />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────
// 초대 카드 — 겹침·추천이 희소할 때 노출, 기존 공유(handleShareMe) 재사용
// ─────────────────────────────────────────────
function InviteCard({
  onInvite,
  accent,
  gradient,
}: {
  onInvite: () => void;
  accent: string;
  gradient: [string, string];
}) {
  const { t } = useTranslation();
  return (
    <View style={s.inviteCard}>
      <Text style={s.inviteCardTitle}>{t('friends.inviteCardTitle')}</Text>
      <Text style={s.inviteCardBody}>{t('friends.inviteCardBody')}</Text>
      {/* 화면의 유일한 주요 CTA — 행 버튼보다 크고 글로우도 진하게 둔다 */}
      <TouchableOpacity
        style={[s.inviteCardBtn, { shadowColor: accent }]}
        activeOpacity={0.88}
        onPress={onInvite}
        accessibilityRole="button"
        accessibilityLabel={t('friends.inviteCta')}
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <Text style={s.inviteCardBtnText} {...andFitText}>{t('friends.inviteCta')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─────────────────────────────────────────────
// 메인 화면
// ─────────────────────────────────────────────
type Props = RootStackScreenProps<'FriendSearch'>;

export default function FriendSearchScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const skinAccent = useSkinAccent(); // 검색 결과·버튼을 스킨 강조색으로
  const insets = useSafeAreaInsets();
  const { handle } = useProfileSettings();
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');

  // 딥링크(eorth://user/<handle>)로 진입/재진입 시 검색어 자동 채움
  // ts를 의존성에 포함해 같은 핸들로 다시 들어와도(파라미터 값 동일) 재채움되게 함
  useEffect(() => {
    const q = route.params?.initialQuery;
    if (q) setQuery(q);
  }, [route.params?.initialQuery, route.params?.ts]);
  // 메이트 상태는 store 공유 — 메이트 프로필·메이트 목록·프로필 카운트와 동기화
  const { records, tripGroups } = useRecordData();
  const { isNeighbor, isNeighborRequested, isNeighborRequestReceived, isBlocked } = useSocialGraph();
  const { requestNeighbor, cancelNeighborRequest, acceptNeighbor, removeNeighbor, refreshNeighbors } = useRecordActions();
  // 여행 DNA — 완료 전까지만 배너 노출(매칭 동기가 가장 큰 자리)
  const { isComplete: dnaComplete, isFull: dnaFull } = useTravelDna();
  const [searching, setSearching] = useState(false); // 원격 검색 진행 중
  // 본인 제외용 (원격 검색 결과) — state로 두어 id 로드 완료 시 필터가 재실행되게 함
  const [myId, setMyId] = useState<string | null>(null);

  // 팔로우/검색 피드백 토스트
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(msg);
    setToastVisible(true);
    toastTimer.current = setTimeout(() => setToastVisible(false), 2000);
  };
  // 언마운트 시 토스트 타이머 정리 (사라진 화면에서 setState 방지)
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  // ── 진입/퇴장 애니메이션 ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleGoBack = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 40, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      navigation.goBack();
    });
  }, [navigation]);

  // 메이트 해제 시 목록에 표시된 메이트 수 낙관적 반영 (서버 재조회 없이 ±1)
  // 신청은 수락 전까지 pending이라 카운트는 건드리지 않고, 해제(-1)만 반영한다.
  const bumpFollowerCount = (id: string, delta: number) => {
    const adjust = (list: ContactFriend[]) =>
      list.map((f) => (f.id === id ? { ...f, followers: Math.max(0, (f.followers ?? 0) + delta) } : f));
    setRemoteResults(adjust);
    setSuggestions(adjust);
  };

  const onNeighborToggle = (friend: ContactFriend) => {
    tap();
    if (isNeighbor(friend.id)) {
      removeNeighbor(friend.id);
      bumpFollowerCount(friend.id, -1);
      showToast(t('comp2.toastNeighborRemoved', { name: friend.name }));
    } else if (isNeighborRequestReceived(friend.id)) {
      // 상대가 먼저 신청해 둔 경우 — 여기서 누르는 건 수락이다(신청을 또 보내는 게 아니라).
      acceptNeighbor(friend.id);
      bumpFollowerCount(friend.id, +1); // 메이트 성립 → 상대 메이트 수 +1 (끊기의 -1과 대칭)
      setIncomingCount((n) => Math.max(0, n - 1)); // 상단 '받은 신청' 배너도 같이 줄인다
      showToast(t('comp2.toastNeighborAccepted', { name: friend.name }));
    } else if (isNeighborRequested(friend.id)) {
      cancelNeighborRequest(friend.id);
      showToast(t('comp2.toastNeighborRequestCanceled', { name: friend.name }));
    } else {
      requestNeighbor(friend.id);
      showToast(t('comp2.toastNeighborRequested', { name: friend.name }));
    }
  };

  // 내 코드(공유용) — 반드시 고유 식별자인 핸들만 사용
  const myCode = handle;

  // ── 내 코드 공유 — 초대 카드에서 호출 ──
  const handleShareMe = () => {
    if (!myCode) { showToast(t('friends.setProfileFirst')); return; }
    Share.share({
      message: t('comp2.shareMeMessage', { link: profileLink(myCode) }),
    }).catch(() => {});
  };

  // 받은 메이트 신청 수 — 이 화면은 신청을 '보내기'만 했고 받은 건 볼 수 없었다.
  // 관계 맺기의 나머지 절반이라 배너로 노출하고, 처리는 기존 화면(FollowerList)에 맡긴다.
  const [incomingCount, setIncomingCount] = useState(0);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    fetchIncomingNeighborRequests()
      .then((rows) => { if (alive) setIncomingCount(rows.length); })
      .catch(() => {});
    // 행 버튼의 '메이트 수락' 판정도 store의 받은/보낸 대기 신청을 본다 — 앱 시작 이후 도착한
    // 신청은 여기서 갱신해야 반영된다(안 하면 신청받은 사람이 '메이트 신청'으로 보인다)
    refreshNeighbors();
    return () => { alive = false; };
  }, [refreshNeighbors]);

  // 추천 메이트(여행 DNA) — 진입 시 1회 로드. 로컬 여행기록카드·미발행·나만보기 나라도
  // extra_countries로 보강(내 매칭 입력 전용 — 타인에게 비노출)
  const [suggestions, setSuggestions] = useState<ContactFriend[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let alive = true;
    (async () => {
      try {
        const localCountries = Array.from(new Set([
          // isMyPost !== false: undefined는 내 기록(레거시 포함) — store의 내 기록 판정과 동일 기준
          ...records.filter((r) => r.isMyPost !== false && r.countryName).map((r) => r.countryName as string),
          ...tripGroups.map((g) => g.countryName).filter((c): c is string => !!c),
        ]));
        const rows = await fetchMateSuggestions(10, localCountries);
        if (!alive || rows.length === 0) return;
        setSuggestions(rows.map((r) => ({
          id: r.authorId,
          name: r.handle || t('friends.travelerDefault'),
          initial: (r.handle || '?').slice(0, 1),
          username: r.handle || '',
          countries: 0,
          photo: r.profilePhoto,
          emoji: r.emoji,
          sharedCount: r.sharedCount,
          sharedCountries: r.sampleCountries,
          mutualCount: r.mutualCount,
          matchScore: r.totalScore,
          recencyScore: r.recencyScore,
          surveyScore: r.surveyScore,
          sharedCities: r.sharedCities,
          dnaTypeKey: r.dnaTypeKey,
          fromSuggestion: true,
        })));
      } catch { /* 부가 기능 — 실패 시 섹션 미표시 */ }
    })();
    return () => { alive = false; };
  }, []);

  // 백엔드 사용자 검색 (아이디/핸들) — 실제 테스터 찾기
  const [remoteResults, setRemoteResults] = useState<ContactFriend[]>([]);
  const [searchError, setSearchError] = useState(false); // 검색 실패 ↔ 결과 없음 구분
  useEffect(() => { getMyUserId().then(setMyId); }, []);
  useEffect(() => {
    const q = query.trim();
    if (!isSupabaseConfigured || q.length === 0) { setRemoteResults([]); setSearching(false); setSearchError(false); return; }
    let alive = true;
    setSearching(true);
    setSearchError(false);
    const timer = setTimeout(async () => {
      try {
        const rows = await searchProfiles(q);
        if (!alive) return;
        const others = rows.filter((p) => p.id !== myId);
        // 방문 국가 수·팔로워 수 일괄 조회 후 병합 (실패해도 0으로 처리)
        const ids = others.map((p) => p.id);
        const [counts, fcounts] = await Promise.all([getCountryCounts(ids), getFollowerCounts(ids)]);
        if (!alive) return;
        setRemoteResults(
          others.map((p) => ({
            id: p.id,
            name: p.handle || t('friends.travelerDefault'),
            initial: (p.handle || '?').slice(0, 1),
            username: p.handle || '',
            countries: counts[p.id] ?? 0,
            followers: fcounts[p.id] ?? 0,
            photo: p.profile_photo,
            emoji: p.emoji,
          }))
        );
      } catch {
        if (alive) { setRemoteResults([]); setSearchError(true); } // 검색 실패 시 이전 결과 잔류 방지 + 에러 표시
      } finally {
        if (alive) setSearching(false);
      }
    }, 300); // 디바운스
    return () => { alive = false; clearTimeout(timer); };
  }, [query, myId]);

  const isSearching = query.trim().length > 0;
  // 차단한 사용자는 검색·추천 결과에서 제외 (노출·재팔로우 방지)
  // f.id = 검색 결과 profiles.id / 추천의 author_id — 둘 다 profile uuid
  const notBlocked = (f: ContactFriend) => !isBlocked({ name: f.name, handle: f.username, id: f.id });
  const displayList = remoteResults.filter(notBlocked);
  // 추천 메이트 (팔로우한 뒤에도 '팔로잉' 상태로 남겨 되돌리기 가능)
  const visibleSuggestions = suggestions.filter(notBlocked);

  // 메이트 행 렌더(검색결과·추천 메이트 공통) — 중복 제거. 시안대로 행 사이 구분선 없음
  const renderRows = (list: ContactFriend[]) =>
    list.map((item) => (
      <FriendItem
        key={item.id}
        item={item}
        following={isNeighbor(item.id)}
        requested={isNeighborRequested(item.id)}
        incoming={isNeighborRequestReceived(item.id)}
        onToggle={() => onNeighborToggle(item)}
        onPress={() => navigation.navigate('FriendProfile', { userId: item.id, username: item.username })}
      />
    ));

  return (
    <View style={s.container}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={s.backBtn} onPress={handleGoBack} accessibilityRole="button" accessibilityLabel={t('friends.back')}>
          <BackChevronIcon />
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('friends.searchTitle')}</Text>
        <View style={s.backBtn} />
      </View>
      {/* 헤더 아래 전폭 구분선 */}
      <View style={s.headerLine} />

      <Animated.View style={{ flex: 1, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

      {/* ── 검색창 ── */}
      <View style={s.searchWrap}>
        <SearchIcon size={16} color="#A1A1B0" />
        <TextInput cursorColor="#BF85FC" selectionHandleColor="#BF85FC"
          style={s.searchInput}
          placeholder={t('friends.nameOrIdPlaceholder')}
          placeholderTextColor={C.textHalf}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel={t('friends.nameOrIdA11y')}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('friends.clearSearchA11y')}>
            <Text style={s.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 메이트 리스트 ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {isSearching ? (
          /* 검색 결과 (아이디/핸들) */
          <>
            <Text style={s.sectionLabel}>{t('friends.searchResults')}</Text>
            {searching ? (
              <ActivityIndicator color={skinAccent.accent} style={{ marginTop: 40 }} />
            ) : searchError ? (
              <Text style={s.emptyText}>{t('friends.searchError')}</Text>
            ) : displayList.length === 0 ? (
              <Text style={s.emptyText}>{t('friends.noResultSearch')}</Text>
            ) : (
              renderRows(displayList)
            )}
          </>
        ) : (
          <>
            {/* 받은 메이트 신청 — 있으면 가장 먼저. 탭하면 수락/거절 화면으로 */}
            {incomingCount > 0 && (
              <TouchableOpacity
                style={[s.requestBanner, { borderColor: skinAccent.tint(0.45), backgroundColor: skinAccent.tint(0.12) }]}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('FollowerList')}
                accessibilityRole="button"
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.requestBannerTitle}>{t('friends.neighborRequestsN', { count: incomingCount })}</Text>
                  <Text style={s.requestBannerBody}>{t('friends.incomingBannerBody')}</Text>
                </View>
                <Text style={[s.requestBannerArrow, { color: skinAccent.accent }]}>›</Text>
              </TouchableOpacity>
            )}

            {/* 여행 DNA 배너 — 매칭 동기가 가장 큰 자리. 완료 전까지만 노출한다 */}
            {!dnaFull && (
              <TouchableOpacity
                style={dnaBanner.wrap}
                activeOpacity={0.85}
                onPress={() => navigation.navigate('TravelDnaSurvey', { mode: 'full' })}
              >
                <View style={{ flex: 1 }}>
                  {/* 제목은 두 상태 모두 같다 — 상태 구분은 오른쪽 CTA가 한다.
                      제목까지 continueSurvey를 쓰면 같은 문구가 한 줄에 두 번 보인다 */}
                  <Text style={dnaBanner.title}>{t('dna.bannerTitle')}</Text>
                  <Text style={dnaBanner.desc}>{t('dna.bannerDesc')}</Text>
                </View>
                <Text style={dnaBanner.cta}>
                  {dnaComplete ? t('dna.continueSurvey') : t('dna.startSurvey')}
                </Text>
              </TouchableOpacity>
            )}

            {visibleSuggestions.length > 0 && (
              <>
                <Text style={s.sectionLabel}>{t('friends.suggestedFriends')}</Text>
                {renderRows(visibleSuggestions)}
              </>
            )}
            {(visibleSuggestions.length < 3) && myCode ? (
              <InviteCard onInvite={handleShareMe} accent={skinAccent.accent} gradient={skinAccent.btnGradient} />
            ) : null}
            {/* 추천이 없을 때는 초대 카드가 이미 안내 역할을 하므로 문구를 겹쳐 쓰지 않는다 */}
            {visibleSuggestions.length === 0 && !myCode && (
              <Text style={s.emptyText}>{t('friends.coldStartNudge')}</Text>
            )}

            {/* 이미 맺은 메이트로 가는 길 — '메이트찾기'에서 내 메이트 목록으로 갈 수 없었다 */}
            <View style={s.myMatesWrap}>
              <TouchableOpacity
                style={[s.myMatesBtn, { borderColor: skinAccent.tint(0.4) }]}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('FollowerList')}
                accessibilityRole="button"
              >
                <Text style={[s.myMatesLinkTxt, { color: skinAccent.accent }]}>{t('friends.viewMyMates')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      </Animated.View>

      {/* 팔로우/검색 피드백 토스트 */}
      <Toast visible={toastVisible} message={toastMessage} />
    </View>
  );
}

// ─────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────
const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // 헤더
  header: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 36, // 예전엔 ‹ 글자의 lineHeight 36이 버튼 높이를 만들었다 — 자식이 16px SVG(BackChevronIcon)가 되면서 명시 필요(터치 영역·헤더 높이 유지). 오른쪽 자리표시 View도 같은 스타일이라 대칭 유지
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.72,
  },

  // 헤더 아래 전폭 구분선(좌우 여백 없음)
  headerLine: {
    height: 1,
    backgroundColor: C.headerLine,
  },
  // 검색창 — 좌우 16 전폭, 높이 40 고정(시안)
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    marginHorizontal: 16,
    marginTop: 22,
    marginBottom: 18,
    backgroundColor: C.searchBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.white,
    padding: 0,
  },
  clearBtn: {
    fontSize: 14,
    color: C.dim,
    paddingHorizontal: 4,
  },

  // 스크롤
  scrollContent: {
    paddingHorizontal: 16,
  },

  // 받은 신청 배너
  requestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  requestBannerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: C.white,
  },
  requestBannerBody: {
    fontSize: 12,
    color: C.dim,
    marginTop: 2,
  },
  requestBannerArrow: {
    fontSize: 26,
    fontWeight: '300',
    // 타이트 행간은 안드로이드에서 글리프 상하가 잘림 → 안드로이드만 fontSize*1.2로 완화
    lineHeight: Platform.OS === 'ios' ? 28 : 31,
  },

  // 내 메이트 목록 — 보조 액션이라 아웃라인 필(주요 CTA인 초대 버튼과 위계 구분)
  myMatesWrap: {
    alignItems: 'center',
    paddingVertical: 18,
  },
  myMatesBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  myMatesLinkTxt: {
    fontSize: 13,
    fontWeight: '700',
  },

  // 섹션 라벨
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.labelPurple,
    marginBottom: 14,
  },

  // 메이트 아이템 — 위아래 12씩 → 사람과 사람 사이 24
  friendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 16, // 프사 ↔ 글(아이디·근거 문구) 사이 16
  },

  // 근거 문구 + 일치도 한 줄
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2, // 아이디 ↔ 근거 문구 세로 2
  },
  matchPctTxt: {
    color: C.labelPurple,
    fontSize: 10,
    fontWeight: '600',
  },

  // 겹치는 나라 국기 칩 — 한 줄 고정, 넘치면 잘린다
  flagRow: {
    marginTop: 6,
    flexGrow: 0,
  },
  flagRowContent: {
    gap: 4,
  },
  // 높이는 고정하지 않는다 — 테두리 1×2 + paddingVertical 1×2 + lineHeight 12 = 기본 배율에서 시안 16.
  // 안드로이드는 lineHeight도 글꼴 배율(상한 1.2)을 따라 커지므로, height:16 고정이면 안쪽 14를 넘겨
  // 한글·국기 이모지 위아래가 잘린다. minHeight로 두어 배율이 커지면 칩이 같이 자라게 한다.
  flagChip: {
    minHeight: 16,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.chipBorder,
    backgroundColor: C.chipBg,
    justifyContent: 'center',
  },
  flagChipTxt: {
    fontSize: 9,
    // 9pt×1.2(안드로이드 행간 관례)=10.8보다 넉넉한 12 — 국기 이모지가 한글보다 키가 크다
    lineHeight: 12,
    includeFontPadding: false, // 안드로이드 기본 상하 여백 제거(iOS 무시) — 작은 칩 안 글리프가 아래로 밀림
    color: C.chipText,
    fontWeight: '600',
  },
  friendInfo: {
    flex: 1,
  },

  // 여행 DNA 유형 칩 — flagChip과 같은 크기감, 보라 네온 톤으로 구분
  dnaTypeChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(191,133,252,0.14)',
  },
  dnaTypeChipTxt: {
    fontSize: 10,
    color: C.accent,
    fontWeight: '700',
  },
  friendUsername: {
    fontSize: 16,
    fontWeight: '700',
    color: C.white,
    letterSpacing: 0.48,
  },
  friendCountries: {
    flexShrink: 1, // 길면 근거 문구가 줄고 일치도는 남는다
    fontSize: 10,
    color: C.textHalf,
  },

  // 메이트 신청 버튼 — 완전한 필(pill), 높이 30
  mateBtn: {
    minWidth: 80,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mateBtnTxt: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    letterSpacing: 0.36,
  },

  // 빈 상태
  emptyText: {
    fontSize: 14,
    color: C.dim,
    textAlign: 'center',
    marginTop: 40,
  },

  // 초대 카드
  inviteCard: {
    marginTop: 20,
    marginHorizontal: 4,
    padding: 18,
    borderRadius: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.divider,
    alignItems: 'center',
  },
  inviteCardTitle: { color: C.white, fontSize: 15, fontWeight: '700', marginBottom: 6, textAlign: 'center' },
  inviteCardBody: { color: C.dim, fontSize: 13, lineHeight: 18, marginBottom: 14, textAlign: 'center' },
  inviteCardBtn: {
    paddingHorizontal: 26,
    paddingVertical: 12,
    borderRadius: 999,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    // 컬러 글로우는 iOS 전용 — 안드로이드 elevation은 색 지정 불가(회색 사각 그림자). shadowColor(accent)는 사용처 인라인
    ...Platform.select({
      ios: {
        shadowOpacity: 0.5,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
      },
      default: {},
    }),
  },
  inviteCardBtnText: { color: C.white, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
});

// 여행 DNA 배너
const dnaBanner = StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#2E2E3B', borderRadius: 16, padding: 16,
    marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(191,133,252,0.35)',
  },
  title: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  desc: { color: '#A1A1B0', fontSize: 12, marginTop: 4 },
  cta: { color: '#BF85FC', fontSize: 13, fontWeight: '700' },
});
