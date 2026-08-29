/**
 * 위치 권한 배너 표시 판정 (알림 설정 화면)
 *
 * 앱 루트에 상주하는 감지기 4종은 전부 snapService.detectCurrentCountry()로 현재 국가를
 * 읽는다. 그 함수는 기본적으로 권한 팝업을 띄우지 않는다 — 마운트 즉시 호출되므로 여기서
 * 요청하면 로그인 전 스플래시 위에 위치 팝업이 뜨고, 그건 App Store 5.1.1의 전형적 거부
 * 사유다. 그 설계의 대가로 **권한이 없으면 토글은 켜져 있는데 기능만 조용히 죽는다.**
 * 사용자는 원인을 알 방법이 없으므로 알림 설정 화면에서 배너로 알린다.
 *
 * 판정을 화면에서 떼어 여기 둔 이유: 이 조건은 감지기 4종의 게이트와 한 글자씩 맞아야
 * 하는데, 렌더 코드 안에 묻어두면 감지기가 늘거나 게이트가 바뀔 때 조용히 어긋난다
 * (배너가 안 뜨는 오류는 화면상 아무 흔적이 없어 눈으로 못 잡는다).
 *
 * ⚠️ 아래 표는 **손으로 옮겨 적은 것이고 어떤 검사도 이것을 지키지 않는다.**
 *    `locationDetectorBanner.verify.ts`는 이 파일의 순수 함수만 부르지 감지기 소스를 열지
 *    않으므로, 감지기 쪽 게이트를 떼어내도 `npm test`는 전부 통과한다(11차 QA 발견 27).
 *    감지기를 추가·수정하면 이 표와 아래 타입을 **사람이** 함께 고쳐야 한다.
 *
 * 각 감지기의 실제 게이트(2026-08-30 코드 실측):
 *   SnapDetector.tsx:86     snapEnabled            && notifPrefs.master
 *   ArrivalNotifier.tsx:85  arrivalDetect          && notifPrefs.master
 *   MomentNotifier.tsx:37   notifPrefs.travelMoment && notifPrefs.master
 *   ReturnDetector.tsx:58   notifPrefs.returnDetect && notifPrefs.master
 * 넷 모두 master를 요구한다 → master가 꺼져 있으면 위치는 애초에 쓰이지 않는다.
 * (memoryRemind·marketing·소셜 알림 4종은 위치를 전혀 읽지 않으므로 여기 없다)
 */

export type LocationDetectorToggles = {
  /** notifPrefs.master — 감지기 4종의 공통 상위 게이트 */
  master: boolean;
  /** settingsStore.arrivalDetect — ArrivalNotifier */
  arrivalDetect: boolean;
  /** settingsStore.snapEnabled — SnapDetector */
  snapEnabled: boolean;
  /** notifPrefs.travelMoment — MomentNotifier */
  travelMoment: boolean;
  /** notifPrefs.returnDetect — ReturnDetector */
  returnDetect: boolean;
};

/** 위치를 실제로 읽는 감지기가 지금 하나라도 살아 있는가 */
export function anyLocationDetectorActive(toggles: LocationDetectorToggles): boolean {
  if (!toggles.master) return false;
  return (
    toggles.arrivalDetect || toggles.snapEnabled || toggles.travelMoment || toggles.returnDetect
  );
}

/**
 * 위치 권한 배너를 띄울 것인가.
 *
 * @param locationGranted 위치 권한 상태. null = 아직 확인 전(비동기 조회 중).
 *
 * null에서 띄우지 않는 이유: 화면 진입 직후 한 프레임 배너가 번쩍였다가 사라진다.
 * 감지 토글이 전부 꺼져 있을 때 띄우지 않는 이유: 쓰지도 않을 권한을 조르는 꼴이라
 * 그 자체가 5.1.1 위험이다.
 */
export function shouldShowLocationBanner(
  locationGranted: boolean | null,
  toggles: LocationDetectorToggles,
): boolean {
  if (locationGranted !== false) return false;
  return anyLocationDetectorActive(toggles);
}
