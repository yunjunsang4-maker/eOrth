import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
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
import type { RootStackScreenProps } from '../navigation/types';

// 스플래시 영상 — expo-video 사용 (expo-av Video는 새 아키텍처에서 크래시 — eorth-expo-av-to-expo-video)
const SPLASH_VIDEO = require('../../assets/splash.mp4');
const { width: SW, height: SH } = Dimensions.get('window');
const SPLASH_RATE = 2.5; // 재생 배속 — 더 빠르게
// 영상 길이 ≈ 5.0초 / 배속 ≈ 2.0초. 이벤트 누락·판정 지연에도 갇히지 않게 여유를 둔 안전 상한.
const MAX_SPLASH_MS = 4000;

type Props = RootStackScreenProps<'Splash'>;

export default function SplashScreen({ navigation }: Props) {
  const { resetRecords } = useRecords();
  const { resetSettings } = useSettings();
  const { resetConversations } = useDM();
  const runAccountBoundary = useAccountBoundary();

  const player = useVideoPlayer(SPLASH_VIDEO, (p) => {
    p.loop = false;
    p.muted = true; // 스플래시는 무음 재생
    // 기본 'auto'는 초기화 시점에 오디오 세션(포커스)을 가져가 백그라운드 음악·영상을
    // 멈추게 한다 — 무음 스플래시는 다른 앱 오디오와 섞여도 되므로 포커스를 잡지 않는다.
    p.audioMixingMode = 'mixWithOthers';
    p.playbackRate = SPLASH_RATE; // 빠르게
    p.play();
  });

  useEffect(() => {
    let navigated = false;

    // 이동 목적지 결정(부수효과 포함). 영상 재생과 병렬로 즉시 시작해,
    // 영상이 끝날 즈음엔 네트워크 판정이 대부분 끝나 있게 한다.
    const resolveDestination = async (): Promise<'Main' | 'BasicInfo' | 'AppIntro'> => {
      // ⚠️ 임시: 온보딩 플로우 확인용. 자동 로그인을 끄려면 true로 둔다. 작업 끝나면 false로 되돌릴 것!
      const FORCE_ONBOARDING = false;
      if (isSupabaseConfigured && !FORCE_ONBOARDING) {
        const session = await getCurrentSession();
        // 확실히 오프라인이면 서버 확인(탈퇴 유예·온보딩 판정)을 건너뛰고 즉시 Main 진입 —
        // 오지/기내에서 타임아웃을 기다리며 스플래시에 갇히지 않게 한다.
        if (session && (await isOnline()) === false) {
          await runAccountBoundary(); // 내부 서버 호출은 로컬 폴백으로 즉시 종료됨
          return 'Main';
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
      const dest = await destination;
      navigation.replace(dest);
    };

    // 영상이 끝나면 이동. 이벤트 누락 대비 안전 타이머도 둔다.
    const sub = player.addListener('playToEnd', () => { go(); });
    const timer = setTimeout(() => { go(); }, MAX_SPLASH_MS);

    return () => {
      navigated = true;
      sub?.remove?.();
      clearTimeout(timer);
    };
  }, []);

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
});
