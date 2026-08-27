/**
 * gh-pages로 게시되는 파일 목록과 지문 계산 — check-docs-sync와 publish-pages가 공유한다.
 * 두 스크립트가 각자 목록을 들고 있으면 한쪽에만 파일이 추가돼 다시 어긋난다.
 */
import { createHash } from 'node:crypto';

/** docs/ 아래에서 gh-pages 루트로 그대로 복사되는 파일들 */
export const PUBLISHED_FILES = [
  'terms.html',
  'privacy-policy.html',
  'privacy-policy-en.html',  // 영문 스토어 로케일용 번역(한국어 원문이 정본)
  'support-en.html',         // App Store 영문 지원 URL
  'account-deletion.html',   // 스토어 데이터 안전 양식의 '계정 삭제 요청 URL'(Play 필수 입력란)
  'notices.json',
  'event-dna.js',            // 행사 이벤트 페이지가 쓰는 생성물 (scripts/build-event-dna.mjs)
  'event.html',              // 오프라인 행사 설문 페이지
  'draw-core.js',            // 부스 뽑기 재고 로직 (draw.html·draw-admin.html이 import)
  'draw.html',               // 부스 뽑기 발권 화면 (아이패드 — 관리 기능 없음)
  'draw-admin.html',         // 부스 뽑기 관리 콘솔 (노트북 전용)
  'draw-sw.js',              // 부스 뽑기 오프라인 캐시 서비스 워커 (재게시 시 캐시 버전 올릴 것)
];

/**
 * 줄바꿈·끝 공백 정규화. 이 저장소는 작업트리가 CRLF인데 git 저장본은 LF라
 * (core.autocrlf), 정규화 없이 비교하면 모든 파일이 항상 '변경'으로 잡힌다.
 * 실제로 이 함수를 넣기 전 이미 게시된 파일까지 '게시 대기'로 나왔다.
 */
export const normalizeText = (s) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');

/** 게시 지문 — 내용이 같은지만 보면 되므로 앞 16자리로 충분하다 */
export const sha = (s) => createHash('sha256').update(normalizeText(s)).digest('hex').slice(0, 16);

/** 게시 이력 파일(무엇을 게시했는지의 기록) */
export const STAMP_PATH = 'docs/.published.json';
