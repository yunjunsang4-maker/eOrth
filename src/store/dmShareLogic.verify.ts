// DM 빠른 공유 순수 로직 검증 (jest 미사용). 실행: npx tsx src/store/dmShareLogic.verify.ts
import { nowTimeString, buildSharedRecord, pickTopFriends, hitTestTarget } from './dmShareLogic';
import type { Friend, Message } from './dmTypes';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// nowTimeString — 언어별 오전/오후 위치가 다르다(ko·ja·zh-Hant: 앞, 그 외: 뒤)
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

  // ja는 자기 표기가 있다(午前/午後 + 반각 공백 하나). ko와 같은 자리, 글자만 다르다.
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'ja') === '午前 9:05', 'ja 오전 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 14, 30), 'ja') === '午後 2:30', 'ja 오후 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 0, 0), 'ja') === '午前 12:00', 'ja 자정 12시');
  assert(nowTimeString(new Date(2025, 0, 1, 12, 0), 'ja') === '午後 12:00', 'ja 정오 12시');
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'ja-JP') === '午前 9:05', 'ja-JP 지역 태그도 일본어 포맷');

  // zh-Hant도 자기 표기가 있다(上午/下午 + 반각 공백 하나). 자리는 ja와 같고 글자만 다르다.
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'zh-Hant') === '上午 9:05', 'zh-Hant 오전 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 14, 30), 'zh-Hant') === '下午 2:30', 'zh-Hant 오후 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 0, 0), 'zh-Hant') === '上午 12:00', 'zh-Hant 자정 12시');
  assert(nowTimeString(new Date(2025, 0, 1, 12, 0), 'zh-Hant') === '下午 12:00', 'zh-Hant 정오 12시');
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'zh-TW') === '上午 9:05', 'zh-TW 지역 태그도 번체 포맷');
  // ⚠️ 간체(zh-CN)는 아직 미지원이라 영어로 떨어진다 — 번체를 내보내면 안 된다
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'zh-CN') === '9:05 AM', 'zh-CN(간체) → 영어 폴백');

  // ⚠️ 미지의 언어는 ko가 아니라 영어로 떨어진다(2026-09 3개 국어 배선에서 뒤집힘).
  // 언어가 늘어날 때 "en이 아니면 한국어"가 일본어 사용자에게 한글을 내보냈기 때문이다.
  // 단, 인자 생략(= i18next 초기화 전)은 여전히 ko다 — 앱 기본 언어가 ko이므로.
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), 'fr') === '9:05 AM', '미지의 언어 → 영어 폴백');
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5), '') === '오전 9:05', '빈 문자열 → 초기화 전으로 보고 ko');
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
