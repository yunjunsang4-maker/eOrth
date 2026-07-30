/**
 * 과거여행 스캔 성능 계측 — 어느 구간이 병목인지 숫자로 보기 위한 최소 도구.
 *
 * 왜 필요한가: 스캔이 느린 원인 후보가 둘인데 코드만으로는 비율을 정할 수 없다.
 *   ① 페이지네이션·좌표 조회(getAssetsAsync/getAssetInfoAsync = 원본 파일 I/O)
 *   ② 지오코딩 폴백(reverseGeocodeAsync + 250ms 레이트리밋 대기)
 * 사용자의 사진 분포(해안·국경 인접 비율)에 달려 있어 실측이 유일한 답이다.
 * 이 결과로 네이티브 모듈 도입(①을 없앰)의 이득을 숫자로 판단한다.
 *
 * 순수 로직 — 시각은 now()로 주입받아 테스트 가능하게 한다(RN 의존 없음).
 */

export interface ScanProfileRow {
  label: string;
  ms: number;
  count: number; // 그 구간에서 일어난 호출·처리 건수 (평균을 내기 위함)
}

export interface ScanProfileReport {
  totalMs: number;
  rows: (ScanProfileRow & { pct: number; avgMs: number })[];
}

export class ScanProfiler {
  private readonly now: () => number;
  private readonly started: number;
  private acc: Map<string, { ms: number; count: number }> = new Map();
  private order: string[] = [];

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
    this.started = now();
  }

  /** 구간 1회 측정 시작 → 반환된 함수를 끝에서 부른다. count는 그 1회가 처리한 건수 */
  begin(label: string): (count?: number) => void {
    const t0 = this.now();
    return (count = 1) => this.add(label, this.now() - t0, count);
  }

  /** 이미 아는 소요 시간을 직접 더한다(외부에서 잰 경우) */
  add(label: string, ms: number, count = 1): void {
    const cur = this.acc.get(label);
    if (cur) { cur.ms += ms; cur.count += count; }
    else { this.acc.set(label, { ms, count }); this.order.push(label); }
  }

  /** 처리 건수만 세는 카운터(시간 없이 — 예: 캐시 히트 횟수) */
  bump(label: string, count = 1): void {
    this.add(label, 0, count);
  }

  report(): ScanProfileReport {
    const totalMs = this.now() - this.started;
    const rows = this.order.map((label) => {
      const v = this.acc.get(label)!;
      return {
        label,
        ms: Math.round(v.ms),
        count: v.count,
        pct: totalMs > 0 ? Math.round((v.ms / totalMs) * 1000) / 10 : 0,
        avgMs: v.count > 0 ? Math.round((v.ms / v.count) * 100) / 100 : 0,
      };
    });
    return { totalMs: Math.round(totalMs), rows };
  }

  /** 콘솔에 표로 출력 — 실기기 1회 실측용 */
  formatLines(): string[] {
    const { totalMs, rows } = this.report();
    const out = [`[스캔 계측] 총 ${(totalMs / 1000).toFixed(1)}초`];
    for (const r of rows) {
      out.push(
        `  ${r.label.padEnd(22)} ${String((r.ms / 1000).toFixed(1)).padStart(7)}초` +
        ` ${String(r.pct).padStart(5)}%  ${String(r.count).padStart(7)}건` +
        (r.count > 0 && r.ms > 0 ? `  평균 ${r.avgMs}ms` : ''),
      );
    }
    return out;
  }
}
