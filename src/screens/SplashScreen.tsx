import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import * as NativeSplash from 'expo-splash-screen';
import { APP_START_MS } from '../utils/appStart';
import { useRecords } from '../store/recordStore';
import { useSettings } from '../store/settingsStore';
import { useDM } from '../store/dmStore';
import { clearPersistedStores } from '../store/persist';
import { getPendingDeletion, isDeletionExpired, clearLocalDeletionFlag } from '../store/pendingDeletion';
import { purgeAccountOnServer } from '../services/accountDeletion';
import { isSupabaseConfigured } from '../services/supabase';
import { getCurrentSession, signOut } from '../services/auth';
import { isOnline } from '../utils/connectivity';
import { getMyProfileStatus } from '../services/profile';
import { useAccountBoundary } from '../hooks/useAccountBoundary';
import { withTimeout } from '../utils/withTimeout';
import type { RootStackScreenProps } from '../navigation/types';

// 스플래시 영상 — expo-video 사용 (expo-av Video는 새 아키텍처에서 크래시 — eorth-expo-av-to-expo-video)
// 에셋은 오디오 트랙 없이 내보낸다(ffmpeg -an) — muted·mixWithOthers에 더해 3중 안전장치로,
// 어떤 경로로도 오디오 세션을 건드리지 않아 사용자의 음악·영상 재생이 끊기지 않는다.
const SPLASH_VIDEO = require('../../assets/splash.mp4');
const { width: SW, height: SH } = Dimensions.get('window');

// ─────────────────────────────────────────────
// 네이티브 스플래시 로고 크기 미리보기 (개발 전용)
// ─────────────────────────────────────────────
// 네이티브 스플래시는 LaunchScreen 스토리보드에 구워져서 크기를 바꿀 때마다 EAS 재빌드가
// 필요하다(한 번에 15~25분). 그래서 크기만 여기서 먼저 고른다 —
// 아래를 true 로 바꾸면 영상 대신 미리보기가 뜨고, 핫리로드로 즉시 반영된다.
//
// 이 화면은 app.json 의 expo-splash-screen 설정과 **같은 조건**으로 그린다:
//   같은 이미지 · 배경 #000000 · 폭 = imageWidth(dp). 그래서 여기서 정한 숫자를
//   app.json 의 imageWidth 에 그대로 넣으면 된다.
//
// 다 고른 뒤에는 반드시 false 로 되돌릴 것. (__DEV__ 가드가 있어 배포본에는 영향이 없다)
const SPLASH_LOGO_PREVIEW = false;
const SPLASH_LOGO = require('../../assets/splash-icon.png');
// app.json > plugins > expo-splash-screen > imageWidth 와 같은 값을 둔다.
//
// 150 은 '영상 속 로고와 같은 크기'를 실측해서 나온 값이다:
//   · 영상 1080x2114, 로고 코어 폭 400px (프레임 5~10 내내 일정) → 영상 폭의 37.0%
//   · contentFit="contain" 이고 세로가 긴 화면에서는 폭이 기준이라 화면 폭의 37.0%
//   · 아이폰 393pt 기준 로고 145.6dp, splash-icon.png 는 코어/전체 = 0.968 이므로
//     imageWidth = 145.6 / 0.968 ≈ 150
// 영상 로고는 화면 폭에 비례하고 imageWidth 는 고정 dp 라, 기기 폭이 크게 다르면
// 몇 % 차이는 남는다.
//
// 실측값은 150 이었지만 실기기 겹쳐보기로 확인한 결과 215 로 정했다(2026-08-07).
const SPLASH_LOGO_WIDTH = 215;
const SPLASH_RATE = 2.5; // 재생 배속 — 더 빠르게
// 영상 길이 ≈ 5.0초 / 배속 ≈ 2.0초. 이벤트 누락·판정 지연에도 갇히지 않게 여유를 둔 안전 상한.
const MAX_SPLASH_MS = 4000;
// 진입 목적지 판정의 상한. 이 시간을 넘기면 로컬 신호만으로 폴백해 앱에 들어간다
// (영상 대기 상한인 MAX_SPLASH_MS 와는 별개 — 그건 비동기 작업을 끊지 못한다).
const DEST_TIMEOUT_MS = 8000;
// 네이티브 스플래시(로고)를 최소 이만큼은 보여준 뒤 영상으로 넘긴다.
// 앱 시작 시각(APP_START_MS) 기준이라, 번들 로드가 이미 이 시간을 넘겼으면 곧바로 넘어간다.
const NATIVE_SPLASH_MIN_MS = 700;

type Props = RootStackScreenProps<'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const previewMode = __DEV__ && SPLASH_LOGO_PREVIEW;
  const [previewW, setPreviewW] = useState(SPLASH_LOGO_WIDTH);
  const [previewOverlay, setPreviewOverlay] = useState(true);
  const { resetRecords } = useRecords();
  const { resetSettings, birthday } = useSettings();
  // 오프라인 분기에서 온보딩 완료 여부를 볼 때 최신 값을 쓰기 위한 ref
  // (effect는 마운트 1회만 도는데, 그 사이 계정 경계 처리가 birthday를 바꿀 수 있다)
  const birthdayRef = useRef(birthday);
  birthdayRef.current = birthday;
  const { resetConversations } = useDM();
  const runAccountBoundary = useAccountBoundary();

  const player = useVideoPlayer(SPLASH_VIDEO, (p) => {
    p.loop = false;
    p.muted = true; // 스플래시는 무음 재생
    // 기본 'auto'는 초기화 시점에 오디오 세션(포커스)을 가져가 백그라운드 음악·영상을
    // 멈추게 한다 — 무음 스플래시는 다른 앱 오디오와 섞여도 되므로 포커스를 잡지 않는다.
    p.audioMixingMode = 'mixWithOthers';
    p.playbackRate = SPLASH_RATE; // 빠르게
    // 여기서 재생하지 않는다 — 네이티브 스플래시를 내리는 시점에 맞춰 시작해야
    // 로고가 떠 있는 0.7초 동안 영상 앞부분이 보이지 않은 채 흘러가지 않는다.
  });

  useEffect(() => {
    // 미리보기 중에는 화면을 넘기지 않는다 — 크기를 눈으로 비교할 시간이 필요하다.
    // 영상은 반복 재생·등속으로 돌려서 로고가 뜬 구간을 계속 볼 수 있게 한다.
    if (previewMode) {
      NativeSplash.hideAsync().catch(() => {});
      player.loop = true;
      player.playbackRate = 1;
      player.play();
      return;
    }
    let navigated = false;
    // 판정이 상한을 넘겼을 때 쓸 폴백 근거 — 세션 유무는 로컬에서 즉시 알 수 있다.
    let sessionSeen = false;

    // 이동 목적지 결정(부수효과 포함). 영상 재생과 병렬로 즉시 시작해,
    // 영상이 끝날 즈음엔 네트워크 판정이 대부분 끝나 있게 한다.
    const resolveDestination = async (): Promise<'Main' | 'BasicInfo' | 'AppIntro'> => {
      // ⚠️ 임시: 온보딩 플로우 확인용. 자동 로그인을 끄려면 true로 둔다. 작업 끝나면 false로 되돌릴 것!
      const FORCE_ONBOARDING = false;
      if (isSupabaseConfigured && !FORCE_ONBOARDING) {
        const session = await getCurrentSession();
        sessionSeen = !!session;
        // 확실히 오프라인이면 서버 확인(탈퇴 유예·온보딩 판정)을 건너뛰고 즉시 Main 진입 —
        // 오지/기내에서 타임아웃을 기다리며 스플래시에 갇히지 않게 한다.
        if (session && (await isOnline()) === false) {
          await runAccountBoundary(); // 내부 서버 호출은 로컬 폴백으로 즉시 종료됨
          // 온라인 분기와 같은 기준(로컬 birthday = 온보딩 완료 신호)으로 판정한다.
          // 생략하면 온보딩 중 이탈한 사용자가 비행기모드로 앱을 켜는 것만으로 Main에 들어간다.
          const localBirthday = birthdayRef.current;
          return localBirthday && localBirthday.trim() ? 'Main' : 'BasicInfo';
        }
        const pending = session ? await getPendingDeletion() : null;
        // 탈퇴 유예(30일) 만료 → 서버까지 영구 파기 후 초기 화면으로.
        if (session && pending && isDeletionExpired(pending)) {
          const purged = await purgeAccountOnServer('full');
          if (purged) {
            resetRecords();
            resetSettings();
            resetConversations();
            await clearPersistedStores().catch(() => {});
            await clearLocalDeletionFlag().catch(() => {});
          }
          await signOut(); // 파기된(또는 유예 만료된) 계정의 토큰 제거
          return 'AppIntro';
        }
        // 탈퇴 유예 중이면 자동 로그인하지 않고 로그인 화면에서 복구 여부를 묻는다
        if (session && !pending) {
          // 계정 경계 처리: 세션이 이전과 다른 계정이면 이전 로컬을 비우고 새 계정 데이터를 복원.
          await runAccountBoundary();
          // 온보딩 완료(생일 채움) 여부 확인 — 미완이면 온보딩으로 재진입.
          let onboarded = false;
          const { reached, profile } = await getMyProfileStatus();
          if (!reached) {
            // 서버 도달 실패(오프라인/타임아웃): 세션이 있으니 기존 사용자로 간주(Main).
            onboarded = true;
          } else {
            onboarded = !!(profile && profile.birthday && profile.birthday.trim());
          }
          return onboarded ? 'Main' : 'BasicInfo';
        }
      }
      return 'AppIntro';
    };

    const destination = resolveDestination();

    const go = async () => {
      if (navigated) return;
      navigated = true;
      // ⚠️ MAX_SPLASH_MS 는 '영상 대기' 상한일 뿐 이 판정의 상한이 아니다.
      // 상한이 없으면 판정 체인 안의 서버 호출 하나가 무응답일 때 스플래시 마지막
      // 프레임에서 영구 정지해 앱 진입 자체가 불가능해진다. 판정이 늦거나 실패하면
      // 오프라인 분기와 같은 기준(세션 유무 + 로컬 birthday)으로 폴백한다.
      const fallback = (): 'Main' | 'BasicInfo' | 'AppIntro' => {
        if (!sessionSeen) return 'AppIntro';
        const b = birthdayRef.current;
        return b && b.trim() ? 'Main' : 'BasicInfo';
      };
      const dest = await withTimeout(destination, DEST_TIMEOUT_MS).catch(fallback);
      navigation.replace(dest);
    };

    // 네이티브 스플래시(로고)를 최소 노출 시간만큼 유지한 뒤, 영상 재생과 함께 내린다.
    // 재생을 먼저 걸고 내려야 로고 → 검은 화면 → 영상 순으로 끊겨 보이지 않는다.
    // 앱 시작 기준이라, 번들 로드가 이미 오래 걸렸으면 대기 없이 즉시 넘어간다.
    const waitMs = Math.max(0, NATIVE_SPLASH_MIN_MS - (Date.now() - APP_START_MS));
    const revealTimer = setTimeout(() => {
      player.play();
      NativeSplash.hideAsync().catch(() => {});
    }, waitMs);

    // 영상이 끝나면 이동. 이벤트 누락 대비 안전 타이머도 둔다.
    // (상한은 로고 노출이 끝난 시점부터 재야 영상 재생 시간이 그만큼 깎이지 않는다)
    const sub = player.addListener('playToEnd', () => { go(); });
    const timer = setTimeout(() => { go(); }, waitMs + MAX_SPLASH_MS);

    return () => {
      navigated = true;
      sub?.remove?.();
      clearTimeout(revealTimer);
      clearTimeout(timer);
      // 화면을 벗어날 때 스플래시가 남아 있으면 다음 화면이 가려진다
      NativeSplash.hideAsync().catch(() => {});
    };
  }, []);

  if (previewMode) {
    const pct = Math.round((previewW / SW) * 1000) / 10;
    return (
      <View style={styles.container}>
        {/* 겹쳐보기: 영상 속 로고와 크기가 같은지 직접 대조한다 */}
        {previewOverlay && (
          <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
        )}
        {/* 네이티브 스플래시와 같은 조건: 배경 #000000, 같은 이미지, 폭 = imageWidth(dp) */}
        <View style={styles.previewLogoWrap} pointerEvents="none">
          <Image
            source={SPLASH_LOGO}
            style={{ width: previewW, opacity: previewOverlay ? 0.55 : 1 }}
            resizeMode="contain"
          />
        </View>
        <View style={styles.previewPanel}>
          <Text style={styles.previewValue}>imageWidth: {previewW}dp</Text>
          <Text style={styles.previewHint}>화면 폭의 {pct}% · 이 화면 폭 {Math.round(SW)}dp</Text>
          <View style={styles.previewRow}>
            {[-20, -5, 5, 20].map((d) => (
              <TouchableOpacity
                key={d}
                style={styles.previewBtn}
                onPress={() => setPreviewW((w) => Math.max(40, w + d))}
                activeOpacity={0.7}
              >
                <Text style={styles.previewBtnText}>{d > 0 ? `+${d}` : d}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.previewBtn, styles.previewToggle]}
            onPress={() => setPreviewOverlay((v) => !v)}
            activeOpacity={0.7}
          >
            <Text style={styles.previewBtnText}>
              {previewOverlay ? '영상 끄기 (로고만)' : '영상 위에 겹쳐보기'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.previewHint}>
            겹쳐보기에서 두 로고의 좌우 끝이 맞으면 같은 크기다{'\n'}
            정한 값을 app.json 의 imageWidth 에 넣고{'\n'}SPLASH_LOGO_PREVIEW 를 false 로 되돌릴 것
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // 영상 배경(우주 검정)과 동일한 백드롭
    alignItems: 'center',
    justifyContent: 'center',
  },
  video: {
    // contain: cover는 세로가 긴 화면에서 좌우를 크롭해 피사체가 화면 밖으로 넘쳤음.
    // 영상 배경(우주 검정)이 백드롭 #000과 같아 여백이 티 나지 않고 피사체만 온전히 담긴다.
    width: SW,
    height: SH,
  },
  // ── 개발 전용 미리보기 (SPLASH_LOGO_PREVIEW) ──
  previewLogoWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  previewPanel: { position: 'absolute', bottom: 60, alignItems: 'center', gap: 10 },
  previewToggle: { paddingHorizontal: 18 },
  previewValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  previewHint: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  previewRow: { flexDirection: 'row', gap: 10 },
  previewBtn: {
    minWidth: 56, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#2E2E3B', alignItems: 'center',
  },
  previewBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
