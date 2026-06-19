/**
 * Step 4 — 백그라운드 스케줄러 + 실행 조건 게이팅
 *
 * 🚨 최우선 제약(발열/배터리):
 *  - 사진 분석은 실시간 금지. OS 스케줄러(WorkManager/BGTaskScheduler)가
 *    '유휴(idle)' 시점에 깨워줄 때만 동작한다(유휴 판정은 OS가 담당).
 *  - 깨어난 뒤에도 아래 조건을 직접 확인하여 미충족 시 즉시 스킵한다:
 *      · 충전 중이거나 배터리 60% 이상
 *      · Wi-Fi 연결
 *      · 저전력 모드 아님
 *
 * defineTask 는 모듈 로드 시점(앱 시작)에 호출되어야 하므로 파일 최상위에 둔다.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { runPhotoAIPipeline } from './pipeline';

export const PHOTO_AI_TASK = 'photo-ai-bestcut-scan';

// 기본 실행 주기(분). iOS는 시스템이 더 보수적으로 조정할 수 있음.
const DEFAULT_INTERVAL_MIN = 720; // 12시간

export interface RunConstraints {
  /** 최소 배터리 잔량(0~1). 기본 0.6 */
  minBatteryLevel?: number;
  /** Wi-Fi 필수 여부. 기본 true */
  requireWifi?: boolean;
  /** 충전 중이면 배터리 잔량 조건을 면제할지. 기본 true */
  allowWhileCharging?: boolean;
}

export interface ConstraintCheck {
  ok: boolean;
  reason?: string;
}

/**
 * 현재 기기 상태가 분석 실행 조건을 만족하는지 확인.
 */
export async function checkRunConstraints(
  c: RunConstraints = {}
): Promise<ConstraintCheck> {
  const minBatteryLevel = c.minBatteryLevel ?? 0.6;
  const requireWifi = c.requireWifi ?? true;
  const allowWhileCharging = c.allowWhileCharging ?? true;

  try {
    // 저전력 모드면 무조건 스킵
    if (await Battery.isLowPowerModeEnabledAsync()) {
      return { ok: false, reason: '저전력 모드' };
    }

    const state = await Battery.getBatteryStateAsync();
    const level = await Battery.getBatteryLevelAsync();
    const charging =
      state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL;

    const batteryOk = (allowWhileCharging && charging) || level >= minBatteryLevel;
    if (!batteryOk) {
      return { ok: false, reason: `배터리 부족 (${Math.round(level * 100)}%)` };
    }

    if (requireWifi) {
      const net = await Network.getNetworkStateAsync();
      const onWifi = net.type === Network.NetworkStateType.WIFI && !!net.isConnected;
      if (!onWifi) {
        return { ok: false, reason: 'Wi-Fi 미연결' };
      }
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : '상태 확인 실패' };
  }
}

// ─────────────────────────────────────────────
// 백그라운드 태스크 정의 (앱 시작 시 등록)
// ─────────────────────────────────────────────
TaskManager.defineTask(PHOTO_AI_TASK, async () => {
  try {
    const gate = await checkRunConstraints();
    if (!gate.ok) {
      console.log(`[photoAI] 배치 스킵: ${gate.reason}`);
      return BackgroundTask.BackgroundTaskResult.Success; // 조건 미충족은 정상 종료
    }

    const result = await runPhotoAIPipeline();
    if (!result.ok) {
      console.warn(`[photoAI] 파이프라인 실패: ${result.errorMessage}`);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }

    console.log(
      `[photoAI] 배치 완료: 신규 ${result.data?.newPhotos}장, 그룹 ${result.data?.groups.length}개`
    );
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (e) {
    console.warn('[photoAI] 배치 예외:', e);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

// ─── 등록 / 해제 ───

/**
 * 백그라운드 배치 태스크 등록(중복 등록 방지).
 */
export async function registerPhotoAITask(
  minIntervalMinutes: number = DEFAULT_INTERVAL_MIN
): Promise<boolean> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    // 사용자가 기기 설정에서 백그라운드 실행을 막아둔 경우
    if (status === BackgroundTask.BackgroundTaskStatus.Restricted) {
      return false;
    }
    const already = await TaskManager.isTaskRegisteredAsync(PHOTO_AI_TASK);
    if (!already) {
      await BackgroundTask.registerTaskAsync(PHOTO_AI_TASK, {
        minimumInterval: minIntervalMinutes,
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function unregisterPhotoAITask(): Promise<void> {
  try {
    if (await TaskManager.isTaskRegisteredAsync(PHOTO_AI_TASK)) {
      await BackgroundTask.unregisterTaskAsync(PHOTO_AI_TASK);
    }
  } catch {
    // 무시
  }
}

/**
 * 사용자가 직접 '지금 분석'을 눌렀을 때(포그라운드) 호출.
 * skipConstraints=true 면 조건 무시(사용자 명시 의도), 기본은 조건 확인.
 */
export async function runNow(skipConstraints = false) {
  if (!skipConstraints) {
    const gate = await checkRunConstraints();
    if (!gate.ok) return { ok: false as const, errorMessage: gate.reason };
  }
  return runPhotoAIPipeline();
}
