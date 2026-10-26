// 소셜 피드 2단 매거진 → FlashList masonry 데이터 변환(순수 함수, 검증: feedMasonry.verify.ts).
//
// 왜 FlashList의 열 배치를 그대로 쓰지 않나:
//  · `optimizeItemArrangement`(2.0.2 실제 기본값 true — 타입 주석은 기본 false처럼 적혀 있지만
//    RecyclerViewManager가 `?? true`로 켠다)는 **실측 높이**로 "짧은 열"에 넣는다. 예전 피드는
//    **추정 높이(estDiaryHeight 등)**로 나눴으므로 카드가 다른 열로 간다. 게다가 실측이라
//    늦게 등록된 폰트·광고 소스 교체(하우스→AdMob)로 높이가 1px만 바뀌어도 그 아래 카드들의
//    열이 연쇄로 뒤바뀐다(화면에 보이는 카드가 옆 열로 튐).
//  · false(순번 교대)는 높이와 무관하게 0·1·0·1 열에 넣는다 — 역시 예전 배치와 다르다.
// 그래서 열은 여기서 **추정 높이 균형(동률이면 왼쪽)**으로 미리 정하고, FlashList는 순번 교대(false)로
// 두되 "다음 순번 열"이 원하는 열과 다르면 높이 0짜리 빈 칸(gap)을 하나 끼워 순번을 넘긴다.
// 순번 교대 배치는 각 열에 쌓인 실제 높이 바로 아래에 놓으므로 열은 여기서 정한 그대로다.
//
// ⚠️ 추정치 정확도가 곧 화면 정확도다(2026-10-03 QA M1). FlashList의 가시 범위 이진 탐색은 데이터 순서가
//    y순이라고 가정하는데, 열을 추정으로 고정하면 실측과 어긋난 만큼 두 열 높이 차 D가 쌓이고, 렌더 버퍼는
//    스크롤 반대쪽이 drawDistance×0.6(1000 → 600)뿐이라 D > 600이면 한 열 카드가 빈칸으로 보인다.
//    예전 estDiaryHeight(블로그 234/274 vs 실측 126~218, 카드 간격 12 누락)로는 게시물 100개에서 14~23%의
//    피드가 빈칸을 냈다 → 아래 estimateFeedCellHeight를 실제 셀 스타일에서 다시 유도했다(시뮬 200개 0%).
//    카드 스타일(SocialScreen d.pola*/jour*/scrap*/cut*, ads/adPolaroidStyles, FeatureShowcaseCard)을
//    바꾸면 여기 숫자도 같이 고칠 것.

/** 카드 사이 세로 간격 — SocialScreen d.cellGap(열의 첫 카드 외 paddingTop 12)과 같은 값 */
export const FEED_CARD_GAP = 12;

// 피드 FlashList drawDistance(렌더 범위 여유, px). FlashList는 이 값의 2배를 스크롤 방향 0.7 / 반대쪽 0.3으로
// 나눈다(1250 → 1750/750, EngagedIndicesTracker). 두 열 높이 차가 반대쪽(750)을 넘으면 한 열이 빈칸으로 보인다 —
// 차를 줄이는 건 estimateFeedCellHeight의 정확도이고, 이 값은 남는 차(형식 안 높이 편차의 누적)를 받는 여유분이다.
// 시뮬(QA qa5 높이 모델, 폭 360/393/430, 진짜 FlashList 클래스): 1000이면 게시물 200개에서 피드 0~7%가 빈칸,
// 1250이면 0%(400개는 0~5%). 기본 250이면 차 150부터 빈칸. 빈칸 회귀는 feedMasonry.verify.ts가 이 값으로 본다.
// ponytail: 고정값 — 실기기에서 열 한쪽이 늦게 그려지는 빈칸이 보이면 늘리고, 메모리가 문제면 줄일 것.
export const FEED_DRAW_DISTANCE = 1250;

export type FeedEstimateCtx = {
  /** 카드 폭 = (스테이지 폭 - 42) / 2 (셀 좌우 패딩 16+5) */
  cardW: number;
  /**
   * 피드 카드 표시 모드(diaryCardMode)가 'full'인가. false(설정 '소셜 카드 상호작용 표시' 꺼짐)면 모든 형식이
   * "미디어 + 국가"만 그린다 — 시간·@아이디·♡·⋯·캡션·스크랩 제목/발췌가 빠지고, 사진 있는 블로그는 스크랩 형태가 된다.
   */
  full: boolean;
  /** 추천 메이트 카드 행 수 */
  mates: number;
  /** 네컷 프레임 가로/세로 비 — 프레임 정의(constants/cutFrames)를 아는 쪽(SocialScreen)이 넘긴다 */
  cutAspect: (item: any) => number;
};

/**
 * 셀 하나의 추정 높이(카드 간격 12 포함). 형식별로 실제 스타일에서 유도한 **실측 범위의 중앙값**이다.
 * (줄 높이는 글자 크기 ×≈1.25로 잡았다. 범위는 글이 몇 줄이냐에 따라 갈린다.)
 */
export function estimateFeedCellHeight(item: any, ctx: FeedEstimateCtx): number {
  const { cardW, mates } = ctx;
  // 빈 피드에 주입되는 공식 예시(isExample)는 모드와 상관없이 항상 full로 그린다(SocialScreen DiaryCard와 같은 판정)
  const full = ctx.full || !!item.isExample;
  let h: number;
  if (item._adSlot) {
    // 광고 폴라로이드(adPolaroidStyles): 테두리 2 + 패딩 10/8 + 정사각 사진(cardW-22) + 캡션 8+15 = cardW+21, 배지 등으로 ~+15
    h = cardW + 28;
  } else if (item._mateSlot) {
    h = 102 + mates * 48; // 패딩+제목+CTA ≈102 + 행당 48(링 아바타+서브라인)
  } else if (item._featureCard) {
    h = cardW / 0.713; // FeatureShowcaseCard card aspectRatio 0.713
  } else {
    const vt = item.viewType || 'feed';
    if (vt === 'cut') {
      // cutCardLight 패딩 6×2+테두리 2 = 14, 캔버스 폭 cardW-14 ÷ 프레임 비 + 푸터 d.cutMeta(paddingTop 8 / Bottom 2):
      //  full    = 8 + 국가·시간 행 15 + gap 5 + @아이디·♡ 행 18 + 2 = 48
      //  minimal = 8 + 국가(cutMetaCountry lineHeight 15) + 2 = 25
      h = (cardW - 14) / ctx.cutAspect(item) + 14 + (full ? 48 : 25);
    } else if ((vt === 'album' || (vt === 'blog' && !full)) && item.medias?.[0]) {
      // 사진 판정 item.medias?.[0] = SocialScreen firstPhoto(item)의 네컷 외 분기(`item.medias?.[0] || null`)와 같은 기준.
      // scrap: 테두리 2 + 패딩 20 + 사진(cardW-22)/1.3 + 사진 marginBottom 8 = 사진+30, 그 아래
      //  full    = 제목 1줄 17 + 발췌(70%에 5+16×2) ≈26 + 메타 8+18 → 사진+99 (앨범만 — full 블로그는 저널)
      //  minimal = 국가(cutMetaCountry lineHeight 15)만 → 사진+45 (앨범·사진 있는 블로그 공통)
      h = (cardW - 22) / 1.3 + (full ? 99 : 45);
    } else if (vt === 'blog' || vt === 'album') {
      // 저널(jour): full 블로그는 사진이 있어도 글로만 그린다(사진 가산 없음 — 예전 +40은 과대 추정이었다).
      // 테두리 3 + 패딩 24 + 나라 21 + 제목 1~2줄 24~44 + 소제목 0/21 + 본문 0~3줄 0~51 = 72~164
      //  full    = + 푸터(marginTop 10 + paddingTop 8 + 구분선 1 + 시간 17 + @아이디·♡ 행 18 = 54) → 126~218, 중앙 172
      //  minimal = 푸터 없음 → 72~164, 중앙 118 (여기 오는 건 글만 블로그·사진 없는 앨범)
      h = full ? 172 : 118;
    } else {
      // 폴라로이드: 테두리 2 + 패딩 10/8 + 정사각 사진(cardW-22) + 나라 행(paddingTop 8 + 15) 23
      //  full    = + 캡션 19(대부분 있음) + 메타 27 → cardW+66 (캡션 없으면 +47)
      //  minimal = 나라 행까지만 → 2 + 18 - 22 + 23 = cardW+21
      h = full ? cardW + 66 : cardW + 21;
    }
  }
  return h + FEED_CARD_GAP;
}

export type FeedCell<T> =
  | { kind: 'item'; key: string; item: T; col: 0 | 1; first: boolean }
  | { kind: 'gap'; key: string; col: 0 | 1 };

/**
 * @param items    피드 순서대로의 항목(게시물·광고·추천 메이트·기능 소개 카드)
 * @param estimate 열 분배용 추정 높이 — 예전 columns useMemo가 쓰던 값 그대로
 * @returns FlashList data. 순번 교대 배치에서 각 item이 정해진 col에 떨어지도록 gap이 섞여 있다.
 *          first = 그 열의 첫 카드(위 간격 12를 주지 않는다 — 예전 `gap: 12`는 카드 사이에만 생겼다)
 */
export function buildMasonryCells<T extends { id: string }>(
  items: T[],
  estimate: (item: T) => number,
): FeedCell<T>[] {
  const out: FeedCell<T>[] = [];
  const h = [0, 0];
  const count = [0, 0];
  let next: 0 | 1 = 0; // FlashList 순번 교대가 다음 칸을 넣을 열
  for (const item of items) {
    const col: 0 | 1 = h[0] <= h[1] ? 0 : 1;
    h[col] += estimate(item);
    if (col !== next) {
      // 같은 열에 연달아 넣어야 할 때 — 반대 열 순번을 높이 0 칸으로 소모한다.
      // 키는 뒤따르는 항목 id에 묶어 재계산해도 같은 칸이 같은 키를 갖게 한다.
      out.push({ kind: 'gap', key: `gap:${item.id}`, col: next });
    }
    out.push({ kind: 'item', key: item.id, item, col, first: count[col] === 0 });
    count[col] += 1;
    next = col === 0 ? 1 : 0;
  }
  return out;
}
