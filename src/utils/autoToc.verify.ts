/**
 * autoToc 단독 검증 스크립트 (jest 미사용).
 * 실행: npx tsx src/utils/autoToc.verify.ts
 * 앱 코드에서 import 하지 않으므로 번들에 포함되지 않음(개발용).
 */
import { analyzeForToc, applyTocSuggestions } from './autoToc';
import {
  BlogBlock,
  createTextBlock,
  createImageBlock,
  createHeadingBlock,
} from '../types/blogBlocks';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log('  ✓ ' + msg);
  } else {
    failures++;
    console.error('  ✗ ' + msg);
  }
}

const filler = '오늘은 정말 즐거운 하루였고 맛있는 음식도 먹고 좋은 곳도 많이 구경했습니다. 날씨도 좋아서 기분이 최고였고 멋진 풍경 사진도 잔뜩 찍어 남겼습니다. 거리를 천천히 걸으며 현지 분위기를 만끽했고 작은 골목 카페에서 커피도 한 잔 즐겼어요. 정말 기억에 오래 남을 행복한 하루였습니다.';

// 1) 짧은 글 → 제안 없음
{
  const blocks: BlogBlock[] = [createTextBlock('짧은 글입니다.')];
  assert(analyzeForToc(blocks).length === 0, '짧은 글이면 제안 없음');
}

// 2) 텍스트 블록 3개 미만 → 제안 없음 (분량 충분해도)
{
  const blocks: BlogBlock[] = [
    createTextBlock('1일차 ' + filler + filler),
    createTextBlock('2일차 ' + filler + filler),
  ];
  assert(analyzeForToc(blocks).length === 0, '텍스트 블록 3개 미만이면 제안 없음');
}

// 3) 일차 신호가 뚜렷한 긴 글 → 제안 2개 이상
{
  const blocks: BlogBlock[] = [
    createTextBlock('1일차 도쿄 도착. ' + filler),
    createTextBlock('둘째 날 아침 시장 구경. ' + filler),
    createTextBlock('3일차 마지막 일정. ' + filler),
  ];
  const out = analyzeForToc(blocks);
  assert(out.length >= 2, '일차 신호 글이면 제안 2개 이상');
  assert(out.some(s => s.text.startsWith('1일차')), '제안에 "1일차" 포함');
  assert(out.every(s => s.text.length <= 21), '소제목은 말줄임 길이 이내');
}

// 4) 기존 heading 2개 이상 → 제안 없음
{
  const blocks: BlogBlock[] = [
    createHeadingBlock('소제목 A', 2),
    createTextBlock('1일차 도쿄 도착. ' + filler),
    createHeadingBlock('소제목 B', 2),
    createTextBlock('둘째 날 아침. ' + filler),
    createTextBlock('3일차 마지막. ' + filler),
  ];
  assert(analyzeForToc(blocks).length === 0, '기존 heading이 2개 이상이면 제안 없음');
}

// 5) 신호 없는 단일 주제 긴 글 → 제안 없음(목차 불필요)
{
  const blocks: BlogBlock[] = [
    createTextBlock(filler),
    createTextBlock(filler),
    createTextBlock(filler),
  ];
  assert(analyzeForToc(blocks).length === 0, '신호 없는 단일 주제 글이면 제안 없음');
}

// 6) applyTocSuggestions: 대상 블록 앞에 heading 삽입, 순서/개수 보존
{
  const t1 = createTextBlock('가');
  const t2 = createTextBlock('나');
  const t3 = createTextBlock('다');
  const blocks: BlogBlock[] = [t1, t2, t3];
  const next = applyTocSuggestions(blocks, [
    { beforeBlockId: t2.id, level: 2, text: '둘째 섹션' },
  ]);
  assert(next.length === 4, 'heading 1개 삽입 후 길이 4');
  assert(next[1].type === 'heading', 't2 앞에 heading 삽입');
  assert(next[1].type === 'heading' && next[1].value === '둘째 섹션', 'heading 텍스트 일치');
  assert(next[2].id === t2.id, 'heading 다음이 원래 t2');
}

// 7) applyTocSuggestions: 빈 배열이면 원본 그대로
{
  const blocks: BlogBlock[] = [createTextBlock('가'), createTextBlock('나')];
  assert(applyTocSuggestions(blocks, []) === blocks, '제안 없으면 원본 반환');
}

// 8) 신호 없는 긴 글(여러 단락) → 분량 기반 분할로 제안 2개 이상
{
  const para = filler + filler + filler; // ~420자, 일차/시간대 마커 없음
  const blocks: BlogBlock[] = Array.from({ length: 10 }, () => createTextBlock(para));
  assert(analyzeForToc(blocks).length >= 2, '마커 없는 긴 글은 분량 기준으로 제안 2개 이상');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
