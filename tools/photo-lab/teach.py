"""가르치기 — 사용자가 찍은 정답(사진별 컨셉)에서 라벨→컨셉 키워드를 배우고, 앱 표에 쓴다.

정답은 컨셉 7종 중 하나이거나 REJECT('reject', 수동 탈락)이다. 탈락은 학습에서 제외한다.

  python tools/photo-lab/teach.py learn      # data/teach.json → data/learned.json
  python tools/photo-lab/teach.py apply      # learned.json → src/services/photoAI/labelTaxonomy.ts (마커 구간 교체)

학습 규칙(설계 §학습):
- 라벨 L마다 컨셉별 신뢰도 합 S[L][C], 등장 사진 수 n[L].
- n[L] ≥ 2 이고 최다 컨셉 비율 p ≥ 0.6 이면 채택, weight = round(0.3 + 0.3·p, 2).
- 사진 한 장에서만 나온 라벨은 채택하지 않는다(과적합 방지).
가산만 한다 — 앱 표의 기존 항목을 빼는 학습은 없다(사람이 표에서 직접 지운다).
"""
import json
import re
import sys
import time
from collections import defaultdict
from pathlib import Path

LAB = Path(__file__).parent
DATA = LAB / 'data'
TEACH_PATH = DATA / 'teach.json'
LEARNED_PATH = DATA / 'learned.json'
TAXONOMY_PATH = LAB.parent.parent / 'src' / 'services' / 'photoAI' / 'labelTaxonomy.ts'

CONCEPTS = ('emotional', 'hip', 'fun', 'food', 'info', 'transit', 'activity')
# 수동 탈락 — 컴셉이 아니라 "이 사진은 골든셈에 넣지 않는다"는 사람의 표시다.
# CONCEPTS에 넣지 않는다 — 넣으면 판정 대상 컴셉으로 새어들어간다.
REJECT = 'reject'
MIN_PHOTOS = 2
MIN_RATIO = 0.6
MARK_START = '  // ── photo-lab 학습 시작 (tools/photo-lab 이 자동 생성 — 손으로 고쳐도 되지만 다음 [앱에 반영] 때 구간 전체가 교체된다) ──'
MARK_END = '  // ── photo-lab 학습 끝 ──'


# ─────────────────────────────────────────────
# teach.json
# ─────────────────────────────────────────────

def load_teach(path=TEACH_PATH):
    if not Path(path).exists():
        return {}
    return json.loads(Path(path).read_text('utf-8'))


def save_teach(teach, path=TEACH_PATH):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(teach, ensure_ascii=False, indent=1), 'utf-8')


def set_answer(teach, uri, concept, labels, dhash, trip):
    """concept=None 이면 답 삭제. 라벨을 함께 저장해 여행 폴더 없이도 학습한다."""
    if concept is None:
        teach.pop(uri, None)
        return teach
    if concept not in CONCEPTS and concept != REJECT:
        raise ValueError(f'모르는 컨셉: {concept}')
    teach[uri] = {
        'uri': uri, 'dhash': dhash, 'concept': concept, 'trip': trip,
        'labels': [{'label': l['label'], 'confidence': float(l['confidence'])} for l in (labels or [])],
        'at': int(time.time() * 1000),
    }
    return teach


# ─────────────────────────────────────────────
# 학습
# ─────────────────────────────────────────────

def learn(teach):
    """teach 사전 → [[keyword, concept, weight], …] (키워드 사전순)."""
    score = defaultdict(lambda: defaultdict(float))
    photos = defaultdict(int)
    for e in teach.values():
        # 수동 탈락 사진에서 키워드를 배우면 안 된다 — 흐림·무관·스크린샷의 라벨이
        # 그대로 컨셉 키워드가 되어 앱 표를 오염시킨다.
        if e.get('concept') == REJECT:
            continue
        seen = set()
        for l in e.get('labels', []):
            kw = l['label'].strip().lower()
            if not kw or l['confidence'] <= 0:
                continue
            score[kw][e['concept']] += l['confidence']
            if kw not in seen:
                photos[kw] += 1
                seen.add(kw)
    out = []
    for kw, by in score.items():
        if photos[kw] < MIN_PHOTOS:
            continue
        total = sum(by.values())
        best = max(by, key=by.get)
        p = by[best] / total if total else 0
        if p < MIN_RATIO:
            continue
        out.append([kw, best, round(0.3 + 0.3 * p, 2)])
    return sorted(out)


def write_learned(learned, path=LEARNED_PATH):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(learned, ensure_ascii=False, indent=0), 'utf-8')


# ─────────────────────────────────────────────
# 앱 표에 쓰기 — 문자열 치환(순수 함수)이라 검증 가능
# ─────────────────────────────────────────────

_ENTRY_RE = re.compile(r"\[\s*'([^']+)'\s*,\s*'(\w+)'\s*,\s*([0-9.]+)\s*\]")


def existing_pairs(ts_text):
    """앱 표(마커 구간 제외)에 이미 있는 (keyword, concept) 집합."""
    body = ts_text
    if MARK_START in body and MARK_END in body:
        body = body[:body.index(MARK_START)] + body[body.index(MARK_END) + len(MARK_END):]
    return {(m.group(1), m.group(2)) for m in _ENTRY_RE.finditer(body)}


def apply_to_taxonomy(ts_text, learned):
    """(새 텍스트, 쓴 항목 수). KEYWORD_AFFINITY 배열의 닫는 `];` 앞 마커 구간을 만들거나 교체한다."""
    have = existing_pairs(ts_text)
    rows = [f"  ['{kw}', '{c}', {w}]," for kw, c, w in learned if (kw, c) not in have]
    block = '\n'.join([MARK_START, *rows, MARK_END])
    if MARK_START in ts_text and MARK_END in ts_text:
        s = ts_text.index(MARK_START)
        e = ts_text.index(MARK_END) + len(MARK_END)
        return ts_text[:s] + block + ts_text[e:], len(rows)
    anchor = ts_text.index('const KEYWORD_AFFINITY')
    close = ts_text.index('\n];', anchor)
    return ts_text[:close] + '\n' + block + ts_text[close:], len(rows)


def apply(ts_path=TAXONOMY_PATH, learned_path=LEARNED_PATH):
    learned = json.loads(Path(learned_path).read_text('utf-8')) if Path(learned_path).exists() else []
    text = Path(ts_path).read_text('utf-8')
    new_text, n = apply_to_taxonomy(text, learned)
    if new_text != text:
        Path(ts_path).write_text(new_text, 'utf-8')
    return n


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'learn'
    if cmd == 'learn':
        t = load_teach()
        learned = learn(t)
        write_learned(learned)
        # 탈락은 정답이 아니다 — 같이 세면 '정답 N장'이 부풀려진다(학습에서도 제외된다).
        rejected = sum(1 for e in t.values() if e.get('concept') == REJECT)
        print(f'정답 {len(t) - rejected}장(탈락 {rejected}장 제외) → 학습 키워드 {len(learned)}개 → {LEARNED_PATH}')
    elif cmd == 'apply':
        print(f'앱 표에 {apply()}개 항목 반영 → {TAXONOMY_PATH}')
    else:
        print(__doc__)
        sys.exit(1)
