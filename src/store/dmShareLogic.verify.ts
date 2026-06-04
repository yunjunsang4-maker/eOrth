// DM 빠른 공유 순수 로직 검증 (jest 미사용). 실행: npx tsx src/store/dmShareLogic.verify.ts
import { nowTimeString, buildSharedRecord, pickTopFriends, hitTestTarget } from './dmShareLogic';
import type { Friend, Message } from './dmTypes';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log('  ✓ ' + msg);
  else { failures++; console.error('  ✗ ' + msg); }
}

// nowTimeString
{
  assert(nowTimeString(new Date(2025, 0, 1, 9, 5)) === '오전 9:05', '오전 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 14, 30)) === '오후 2:30', '오후 시간 포맷');
  assert(nowTimeString(new Date(2025, 0, 1, 0, 0)) === '오전 12:00', '자정 12시');
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
  const top = pickTopFriends(friends, conv, 3);
  assert(top.length === 3, '상위 3명');
  assert(top[0].handle === 'b' && top[1].handle === 'c' && top[2].handle === 'a', '메시지 수 desc 정렬');
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
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
