// src/utils/privateMemo.verify.ts
import { isPrivateMemoRecord, stripPrivateMemo } from './privateMemo';

let failed = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.error(`✗ ${msg}\n   expected ${e}\n   got      ${a}`); }
  else console.log(`✓ ${msg}`);
}

// 1) 핵심 — 블로그 메모는 발행 사본·받은 행에서 빠진다(이웃 노출 버그의 본체)
eq(
  stripPrivateMemo({ id: 'b1', viewType: 'blog', memo: '비밀 메모', title: '제목' }),
  { id: 'b1', viewType: 'blog', title: '제목' },
  '블로그: memo 키가 지워지고 나머지 필드는 그대로'
);

// 2) 피드·네컷의 memo는 공개 본문(캡션·글) — 지우면 남의 피드에서 글이 사라진다
eq(
  stripPrivateMemo({ id: 'f1', viewType: 'feed', memo: '피드 캡션' }),
  { id: 'f1', viewType: 'feed', memo: '피드 캡션' },
  '피드: memo(공개 캡션)는 유지'
);
eq(
  stripPrivateMemo({ id: 'c1', viewType: 'cut', memo: '네컷 글' }),
  { id: 'c1', viewType: 'cut', memo: '네컷 글' },
  '네컷: memo(공개 글)는 유지'
);

// 3) viewType 없음 = 기본 'feed'(posts.ts `rec.viewType ?? 'feed'`) — 공개로 취급
eq(
  stripPrivateMemo({ id: 'o1', memo: '옛 피드 글' }),
  { id: 'o1', memo: '옛 피드 글' },
  'viewType 없음(옛 피드 기록): memo 유지'
);

// 4) 모르는 값·대소문자 흔들림은 블로그가 아니다(렌더러도 === 'blog'로만 판정)
eq(isPrivateMemoRecord({ viewType: 'Blog' }), false, "'Blog'(대문자)는 블로그 아님 — PostDetail 판정과 동일");
eq(isPrivateMemoRecord({ viewType: null }), false, 'viewType null은 블로그 아님');
eq(isPrivateMemoRecord({ viewType: 'blog' }), true, "'blog'는 비공개 메모 대상");

// 5) 블로그인데 memo가 없거나 비어 있음 — 빈 문자열도 지운다(키 자체가 서버에 남지 않게)
eq(
  stripPrivateMemo({ id: 'b2', viewType: 'blog', memo: '' }),
  { id: 'b2', viewType: 'blog' },
  "블로그 memo '': 키를 지운다"
);
{
  const noMemo = { id: 'b3', viewType: 'blog' };
  eq(stripPrivateMemo(noMemo) === noMemo, true, '블로그인데 memo 키가 없으면 같은 참조를 돌려준다(불필요한 복사 없음)');
}
{
  // memo: undefined — 'memo' in rec가 true라 키를 지운다(스프레드 병합 시 undefined로 덮는 부작용 방지)
  const out = stripPrivateMemo({ id: 'b4', viewType: 'blog', memo: undefined });
  eq('memo' in out, false, '블로그 memo: undefined도 키 자체를 지운다');
}

// 6) 입력을 변형하지 않는다 — 발행 사본에서 지울 때 작성자 로컬 기록의 메모가 사라지면 안 된다
{
  const local = { id: 'b5', viewType: 'blog', memo: '내 메모' };
  stripPrivateMemo(local);
  eq(local.memo, '내 메모', '입력(로컬 기록)의 memo는 그대로 남는다');
}

if (failed) { console.error(`\n${failed} 실패`); process.exit(1); }
console.log('\n✅ 모든 검증 통과');
