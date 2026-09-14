// DM 빠른 공유 순수 로직 검증 (jest 미사용). 실행: npx tsx src/store/dmShareLogic.verify.ts
import { nowTimeString, buildSharedRecord, pickTopFriends, hitTestTarget } from './dmShareLogic';
import type { Friend, Message } from './dmTypes';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// nowTimeString — 언어별 오전/오후 위치가 다르다(ko: 앞, en: 뒤)
{
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'ko') === '오전 9:05', 'ko 오전 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 14, 30), 'ko') === '오후 2:30', 'ko 오후 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 0, 0), 'ko') === '오전 12:00', 'ko 자정 12시');
  assert(nowTimeString(new Date(2025, 0, 1, 12, 0), 'ko') === '오후 12:00', 'ko 정오 12시');

  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'en') === '9:05 AM', 'en 오전 — AM은 뒤에');
  assert(nowTimeString(new Date(2025, 0, 1, 14, 30), 'en') === '2:30 PM', 'en 오후 — PM은 뒤에');
  assert(nowTimeString(new Date(2025, 0, 1, 0, 0), 'en') === '12:00 AM', 'en 자정 12시');
  assert(nowTimeString(new Date(2025, 0, 1, 12, 0), 'en') === '12:00 PM', 'en 정오 12시');
  // 'en-US' 같은 지역 태그도 영어로 잡혀야 한다 (i18n.language가 항상 2글자는 아니다)
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'en-US') === '9:05 AM', 'en-US도 영어 포맷');

  // 미지의 언어는 ko로 떨어진다. 검증은 노드에서 i18next 초기화 없이 돌므로
  // 인자를 생략한 호출도 같은 ko 폴백을 탄다.
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'fr') === '오전 9:05', '미지의 언어 → ko 폴백');
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5)) === '오전 9:05', 'lang 생략 — 초기화 전이면 ko');
}

// buildSharedRecord
{
  const rec: any = { id: 'r1', country: '🇯🇵 일본', content: '교토', viewType: 'feed', date: '2025.03.05', medias: ['m1', 'm2'] };
  const s = buildSharedRecord(rec);
  assert(s.id === 'r1' && s.viewType === 'feed', '피드 기본 필드');
  assert(s.mediaUri === 'm1', '첫 미디어를 대표 이미지로');

  const album: any = { id: 'r2', country: '', content: '', viewType: 'album', date: '', medias: ['a','b','c','d','e'] };
  assert(buildSharedRecord(album).albumUris?.length === 4, '앨범은 최대 4장');

  const blog: any = { id: 'r3', country: '', content: '대체제목', viewType: 'blog', date: '',
    blogBlocks: [{ type: 'heading', value: '진짜제목' }, { type: 'text', value: '본문미리보기' }] };
  const bs = buildSharedRecord(blog);
  assert(bs.blogTitle === '진짜제목', '블로그 heading을 제목으로');
  assert(bs.blogPreview === '본문미리보기', '블로그 text를 미리보기로');
}

// pickTopFriends
{
  const friends: Friend[] = [
    { name: 'A', handle: 'a', emoji: '😀' },
    { name: 'B', handle: 'b', emoji: '😀' },
    { name: 'C', handle: 'c', emoji: '😀' },
    { name: 'D', handle: 'd', emoji: '😀' },
  ];
  const conv: Record<string, Message[]> = {
    a: [{} as Message],
    b: [{} as Message, {} as Message, {} as Message],
    c: [{} as Message, {} as Message],
    d: [],
  };
  const origOrder = friends.map((f) => f.handle).join(',');
  const top = pickTopFriends(friends, conv, 3);
  assert(top.length === 3, '상위 3명');
  assert(top[0].handle === 'b' && top[1].handle === 'c' && top[2].handle === 'a', '메시지 수 desc 정렬');
  assert(friends.map((f) => f.handle).join(',') === origOrder, 'pickTopFriends 입력 배열 불변');
}

// hitTestTarget
{
  const targets = [
    { key: 'f1', x: 0, y: 0, w: 50, h: 50 },
    { key: 'other', x: 0, y: 60, w: 50, h: 50 },
  ];
  assert(hitTestTarget(25, 25, targets) === 'f1', '첫 원 안쪽 명중');
  assert(hitTestTarget(25, 80, targets) === 'other', '기타 원 명중');
  assert(hitTestTarget(200, 200, targets) === null, '바깥은 null');
  assert(hitTestTarget(0, 0, targets) === 'f1', '경계(좌상단) 포함');
  assert(hitTestTarget(50, 50, targets) === 'f1', '경계(우하단) 포함');
  assert(hitTestTarget(58, 25, targets, 10) === 'f1', 'margin 10이면 8px 바깥도 명중');
  assert(hitTestTarget(58, 25, targets) === null, 'margin 없으면 바깥은 null');
  assert(hitTestTarget(25, 55, targets, 10) === 'f1', 'margin 겹침 구간은 먼저 오는 타깃 우선');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
