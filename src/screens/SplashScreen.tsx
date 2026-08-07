import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
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

// 스플래시 영상은 2026-08-07 제거했다(에셋 assets/splash.mp4 도 함께 삭제).
// 이제 스플래시는 네이티브 LaunchScreen(로고) 하나뿐이고, 이 화면은 그 뒤에서
// 진입 목적지만 판정한다 — 화면 자체는 검은 배경만 그린다.
const { width: SW } = Dimensions.get('window');

// ─────────────────────────────────────────────
// 네이티브 스플래시 로고 크기 미리보기 (개발 전용)
// ─────────────────────────────────────────────
// 네이티브 스플래시는 LaunchScreen 스토리보드에 구워져서 크기를 바꿀 때마다 EAS 재빌드가
// 필요하다(한 번에 15~25분). 그래서 크기만 여기서 먼저 고른다 —
// 아래를 true 로 바꾸면 미리보기가 뜨고, 핫리로드로 즉시 반영된다.
//
// 이 화면은 app.json 의 expo-splash-screen 설정과 **같은 조건**으로 그린다:
//   같은 이미지 · 배경 #000000 · 폭 = imageWidth(dp). 그래서 여기서 정한 숫자를
//   app.json 의 imageWidth 에 그대로 넣으면 된다.
//
// 다 고른 뒤에는 반드시 false 로 되돌릴 것. (__DEV__ 가드가 있어 배포본에는 영향이 없다)
const SPLASH_LOGO_PREVIEW = false;
const SPLASH_LOGO = require('../../assets/splash-icon.png');
// app.json > plugins > expo-splash-screen > imageWidth 와 같은 값을 둔다.
// 실기기에서 눈으로 확인해 215 로 정했다(2026-08-07).
const SPLASH_LOGO_WIDTH = 215;
// 진입 목적지 판정의 상한. 이 시간을 넘기면 로컬 신호만으로 폴백해 앱에 들어간다.
const DEST_TIMEOUT_MS = 8000;
// 네이티브 스플래시(로고)를 최소 이만큼은 보여준다.
// 앱 시작 시각(APP_START_MS) 기준이라, 번들 로드가 이미 이 시간을 넘겼으면 곧바로 넘어간다.
const NATIVE_SPLASH_MIN_MS = 700;

type Props = RootStackScreenProps<'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const previewMode = __DEV__ && SPLASH_LOGO_PREVIEW;
  const [previewW, setPreviewW] = useState(SPLASH_LOGO_WIDTH);
  const { resetRecords } = useRecords();
  const { resetSettings, birthday } = useSettings();
  // 오프라인 분기에서 온보딩 완료 여부를 볼 때 최신 값을 쓰기 위한 ref
  // (effect는 마운트 1회만 도는데, 그 사이 계정 경계 처리가 birthday를 바꿀 수 있다)
  const birthdayRef = useRef(birthday);
  birthdayRef.current = birthday;
  const { resetConversations } = useDM();
  const runAccountBoundary = useAccountBoundary();

  useEffect(() => {
    // 미리보기 중에는 화면을 넘기지 않는다 — 크기를 눈으로 볼 시간이 필요하다
    if (previewMode) {
      NativeSplash.hideAsync().catch(() => {});
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

    let cancelled = false;

    const go = async () => {
      if (navigated) return;
      navigated = true;
      // ⚠️ 판정에 상한이 없으면, 체인 안의 서버 호출 하나가 무응답일 때 스플래시에서
      // 영구 정지해 앱 진입 자체가 불가능해진다. 판정이 늦거나 실패하면 오프라인
      // 분기와 같은 기준(세션 유무 + 로컬 birthday)으로 폴백한다.
      const fallback = (): 'Main' | 'BasicInfo' | 'AppIntro' => {
        if (!sessionSeen) return 'AppIntro';
        const b = birthdayRef.current;
        return b && b.trim() ? 'Main' : 'BasicInfo';
      };
      const dest = await withTimeout(destination, DEST_TIMEOUT_MS).catch(fallback);
      if (cancelled) return;
      navigation.replace(dest);
      // 다음 화면이 그려진 뒤에 스플래시를 내린다 — 먼저 내리면 그 사이 검은 화면이
      // 한 프레임 스친다. 이 화면 자체는 아무것도 그리지 않으므로 여기가 유일한 가림막이다.
      requestAnimationFrame(() => { NativeSplash.hideAsync().catch(() => {}); });
    };

    // 로고를 최소 노출 시간만큼 유지한 뒤 이동한다. 판정이 그보다 오래 걸리면
    // 그때까지 로고가 계속 떠 있는다(go 내부에서 await 하므로 자연스럽게 이어진다).
    // 앱 시작 기준이라, 번들 로드가 이미 오래 걸렸으면 대기 없이 즉시 넘어간다.
    const waitMs = Math.max(0, NATIVE_SPLASH_MIN_MS - (Date.now() - APP_START_MS));
    const timer = setTimeout(() => { go(); }, waitMs);

    return () => {
      cancelled = true;
      navigated = true;
      clearTimeout(timer);
      // 화면을 벗어날 때 스플래시가 남아 있으면 다음 화면이 가려진다
      NativeSplash.hideAsync().catch(() => {});
    };
  }, []);

  if (previewMode) {
    const pct = Math.round((previewW / SW) * 1000) / 10;
    return (
      <View style={styles.container}>
        {/* 네이티브 스플래시와 같은 조건: 배경 #000000, 같은 이미지, 폭 = imageWidth(dp) */}
        <View style={styles.previewLogoWrap} pointerEvents="none">
          <Image source={SPLASH_LOGO} style={{ width: previewW }} resizeMode="contain" />
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
          <Text style={styles.previewHint}>
            정한 값을 app.json 의 imageWidth 에 넣고{'\n'}SPLASH_LOGO_PREVIEW 를 false 로 되돌릴 것
          </Text>
        </View>
      </View>
    );
  }

  // 네이티브 스플래시가 이 화면을 덮고 있다. 여기서 뭔가를 그리면 스플래시를 내리는
  // 순간 그게 한 프레임 스치므로, 배경색만 두고 아무것도 그리지 않는다.
  return <View style={styles.container} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    // 네이티브 스플래시 배경과 같은 색 — 내려가는 순간 색이 튀지 않는다
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── 개발 전용 미리보기 (SPLASH_LOGO_PREVIEW) ──
  previewLogoWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  previewPanel: { position: 'absolute', bottom: 60, alignItems: 'center', gap: 10 },
  previewValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  previewHint: { color: '#A1A1B0', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  previewRow: { flexDirection: 'row', gap: 10 },
  previewBtn: {
    minWidth: 56, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#2E2E3B', alignItems: 'center',
  },
  previewBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
