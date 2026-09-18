"""학습 규칙과 앱 표 치환 검증(모델·파일 없이). python tools/photo-lab/teach_verify.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from teach import learn, set_answer, apply_to_taxonomy, existing_pairs, CONCEPTS, REJECT, MARK_START, MARK_END

L = lambda *pairs: [{'label': a, 'confidence': b} for a, b in pairs]

# ── 학습 규칙 ──
t = {}
set_answer(t, 'u1', 'hip', L(('rooftop', 0.5), ('night', 0.3)), 'd1', 'trip')
set_answer(t, 'u2', 'hip', L(('rooftop', 0.6), ('city', 0.2)), 'd2', 'trip')
set_answer(t, 'u3', 'emotional', L(('rooftop', 0.1), ('sunset', 0.9)), 'd3', 'trip')
set_answer(t, 'u4', 'food', L(('bakery', 0.9)), 'd4', 'trip')
got = dict((kw, (c, w)) for kw, c, w in learn(t))
assert got['rooftop'][0] == 'hip', got                     # 1.1 vs 0.1 → p≈0.92
assert 0.55 <= got['rooftop'][1] <= 0.6, got
assert 'night' not in got and 'city' not in got and 'sunset' not in got, got   # 사진 1장뿐 → 미채택
assert 'bakery' not in got, got

# 비율 미달(2장인데 반반)은 미채택
t2 = {}
set_answer(t2, 'a', 'hip', L(('bar', 0.5)), 'x', 't')
set_answer(t2, 'b', 'food', L(('bar', 0.5)), 'y', 't')
assert learn(t2) == [], learn(t2)

# 답 삭제
set_answer(t, 'u4', None, [], '', '')
assert 'u4' not in t

# ── 앱 표 치환 ──
ts = """import x;
const KEYWORD_AFFINITY: [string, RecoConcept, number][] = [
  ['sunset', 'emotional', 0.6],
  ['night', 'hip', 0.5],
];
export const ZERO = 1;
"""
new, n = apply_to_taxonomy(ts, [['rooftop', 'hip', 0.55], ['night', 'hip', 0.5], ['bakery', 'food', 0.6]])
assert n == 2, n                                          # night는 이미 있음 → 건너뜀
assert MARK_START in new and MARK_END in new
assert new.index(MARK_START) < new.index('\n];') < new.index('export const ZERO')
assert "['rooftop', 'hip', 0.55]," in new and "['bakery', 'food', 0.6]," in new
assert new.count("['night', 'hip', 0.5]") == 1

# 두 번째 적용은 구간을 통째로 교체(누적 아님)
new2, n2 = apply_to_taxonomy(new, [['bakery', 'food', 0.6]])
assert n2 == 1 and 'rooftop' not in new2 and new2.count(MARK_START) == 1, new2
assert existing_pairs(new2) == {('sunset', 'emotional'), ('night', 'hip')}  # 마커 구간은 '기존'이 아님

# 빈 학습으로 적용하면 구간만 남고 항목 없음
new3, n3 = apply_to_taxonomy(new2, [])
assert n3 == 0 and 'bakery' not in new3

# ── 수동 탈락 ──
# 골든셋에 들어가면 안 되는 사진(흐림·무관·스크린샷)을 사람이 직접 뺀 표시다.
assert REJECT not in CONCEPTS                              # 컨셉이 아니다 — 판정 대상에 섞이면 안 된다
assert set(CONCEPTS) == {'emotional', 'hip', 'fun', 'food', 'info', 'transit', 'activity'}, CONCEPTS

t3 = {}
set_answer(t3, 'r1', 'hip', L(('rooftop', 0.6)), 'd1', 'trip')
set_answer(t3, 'r2', 'hip', L(('rooftop', 0.6)), 'd2', 'trip')
set_answer(t3, 'r3', REJECT, L(('blurry', 0.9)), 'd3', 'trip')
set_answer(t3, 'r4', REJECT, L(('blurry', 0.9)), 'd4', 'trip')
got3 = dict((kw, (c, w)) for kw, c, w in learn(t3))
assert got3['rooftop'][0] == 'hip', got3
# 탈락 사진은 2장이라 MIN_PHOTOS를 채우지만, learn()이 통째로 건너뛰므로 배우지 않는다
assert 'blurry' not in got3, got3

# 탈락 토글 취소(= 답 삭제)
set_answer(t3, 'r3', None, [], '', '')
assert 'r3' not in t3 and 'r4' in t3

# 모르는 값은 여전히 거부한다 — REJECT를 허용하느라 검증이 통째로 풀리면 오타가 조용히 저장된다
try:
    set_answer(t3, 'r5', 'nope', [], '', '')
    raise AssertionError('모르는 컨셉이 통과했다')
except ValueError:
    pass

# 새 컨셉 2종
set_answer(t3, 'r6', 'transit', L(('airport', 0.9)), 'd6', 'trip')
set_answer(t3, 'r7', 'activity', L(('hiking', 0.9)), 'd7', 'trip')
assert t3['r6']['concept'] == 'transit' and t3['r7']['concept'] == 'activity'

print('teach_verify ok')
