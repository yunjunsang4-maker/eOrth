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
# 앱 RECO_CONCEPTS와 같은 17종. 랩 목록이 앱보다 좁으면 사람이 찍을 수 없는 컨셉이 생기고,
# 넓으면 set_answer가 통과시킨 정답이 앱 표에 반영될 때 컨셉 키가 없어 죽는다.
#
# **순서까지 단정한다**(2026-09-18 QA 참고 7). 예전엔 set 동치 + len만 봐서 순서가
# 무검증이었다. 순서가 중요한 이유 둘:
#  - ui.html의 버튼 배열 순서가 이 목록 순서 그대로다(사람이 찍는 자리가 바뀐다).
#  - 앱 topConcept의 동률 우선순위가 RECO_CONCEPTS 순서라, 랩과 앱의 순서가 어긋나면
#    같은 사진을 랩과 앱이 다르게 판정한다.
# tuple로 비교하면 순서·개수·중복 오타가 한 줄에 다 걸린다(set+len 두 줄이 필요 없다).
assert CONCEPTS == (
    'emotional', 'hip', 'fun', 'food', 'info', 'transit', 'activity',
    'people', 'night', 'animal', 'cafe', 'culture', 'nature', 'stay', 'shopping',
    'vivid', 'mono',
), CONCEPTS
assert len(CONCEPTS) == 17, CONCEPTS       # 개수를 문서로 남긴다(위 tuple이 이미 고정한다)
# 톤 컨셉 3종은 키워드 표가 없다 — 랩에서 찍어도 learn()이 라벨→컨셉을 배울 재료가
# 없을 뿐이고(라벨이 붙은 사진이면 배운다), 사람이 찍는 것 자체는 막지 않는다.
set_answer({}, 'tone1', 'mono', L(('sky', 0.5)), 'dtone', 'trip')

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
