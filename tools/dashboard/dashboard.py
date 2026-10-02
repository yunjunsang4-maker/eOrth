"""eOrth 작업 궤도 — 노트북에서 한 일·진행 중·할 일을 한 화면에 모아 보는 프로그램.

git 기록·작업트리, Claude 메모리(남은 일 표시), PLAN.md(내 계획)를 열 때마다 새로 읽는다.

  python tools/dashboard/dashboard.py                 # 창 실행(pywebview, 없으면 브라우저)
  python tools/dashboard/dashboard.py --browser       # 브라우저로
  python tools/dashboard/dashboard.py --export FILE   # 휴대폰용 정적 스냅샷(보기 전용) 저장
  python tools/dashboard/dashboard.py --check         # 파서 자가 점검
"""
import base64
import json
import re
import subprocess
import sys
import threading
import webbrowser
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).parent.resolve()
ROOT = HERE.parent.parent
PLAN = HERE / 'PLAN.md'
HIDDEN = HERE / 'hidden.txt'  # 자동 발견에서 숨긴 메모리 이름(한 줄에 하나)
TEMPLATE = HERE / 'dashboard.html'
LOGO = ROOT / 'assets' / 'logo-white.png'
# Claude Code 메모리 폴더: 프로젝트 경로의 영숫자 아닌 글자를 '-'로 바꾼 이름
MEMORY = Path.home() / '.claude' / 'projects' / re.sub(r'[^A-Za-z0-9]', '-', str(ROOT)) / 'memory'
MAIN_BRANCH = 'master'
DAYS = 14

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except Exception:
        pass

# 메모리 description에서 "아직 안 끝난 일"을 알아보는 표시. 순서가 곧 화면의 칩 순서다.
TAGS = [
    ('서버 반영', r'SQL 미실행|SQL[^,·]{0,12}(실행 )?(대기|필요)|재실행 필요|실행 대기|미배포|배포 필요'),
    ('새 빌드', r'새 빌드|재빌드'),
    ('미커밋', r'미커밋|미푸시'),
    ('미병합', r'미병합|병합 대기'),
    ('OTA 미발행', r'OTA 미발행|미발행'),
    ('실기기 검증', r'실기기 미검증|실기기 (검증 )?대기|검증 대기|실기기 0회'),
    ('추후·보류', r'추후|보류|미구현'),
    ('남은 일', r'남은 '),
]
COMMIT_RE = re.compile(r'^(\w+)(?:\(([^)]*)\))?!?:\s*(.*)$')
CHECK_RE = re.compile(r'^(\s*[-*] \[)([ xX])(\]\s*)(.*)$')
REF_RE = re.compile(r'\s*·?\s*\[\[([\w-]+)\]\]\s*$')
DATE_RE = re.compile(r'20\d\d-\d\d-\d\d')
# 릴리스 상태 칸에 고정으로 보여줄 메모리
RELEASE = ['eorth-testflight-build-log', 'eorth-play-store-launch', 'eorth-launch-checklist',
           'eorth-admob-application-rejected']


def git(*args):
    r = subprocess.run(['git', '-c', 'core.quotepath=false', *args], cwd=ROOT, capture_output=True,
                       text=True, encoding='utf-8', errors='replace')
    return r.stdout.rstrip() if r.returncode == 0 else ''  # 앞 공백은 status 코드(' M')라 남긴다


def parse_commit(line):
    h, when, subj = line.split('\x1f', 2)
    m = COMMIT_RE.match(subj)
    kind, scope, text = (m.group(1), m.group(2) or '', m.group(3)) if m else ('', '', subj)
    return {'h': h, 'd': when, 'type': kind.lower(), 'scope': scope, 'subj': text}


def tags_of(text):
    return [name for name, pat in TAGS if re.search(pat, text)]


def read_frontmatter(path):
    text = path.read_text(encoding='utf-8', errors='replace')
    meta = {}
    if text.startswith('---'):
        for line in text.split('---', 2)[1].splitlines():
            k, sep, v = line.partition(':')
            if sep and not line.startswith(' '):
                meta[k.strip()] = v.strip().strip('"').replace('\\"', '"')
    return meta


def memories():
    out = {}
    if not MEMORY.is_dir():
        return out
    for p in MEMORY.glob('*.md'):
        if p.name == 'MEMORY.md':
            continue
        meta = read_frontmatter(p)
        desc = meta.get('description', '')
        m = DATE_RE.search(desc)
        when = m.group(0) if m else date.fromtimestamp(p.stat().st_mtime).isoformat()
        out[p.stem] = {'slug': p.stem, 'desc': desc, 'date': when, 'tags': tags_of(desc)}
    return out


def parse_plan(text):
    """PLAN.md → [{title, items:[{i, done, text, ref}]}]. i는 파일의 줄 번호(토글용)."""
    sections = [{'title': '', 'items': []}]
    for i, line in enumerate(text.splitlines()):
        if line.startswith('## '):
            sections.append({'title': line[3:].strip(), 'items': []})
            continue
        m = CHECK_RE.match(line)
        if m:
            body = m.group(4)
            r = REF_RE.search(body)
            sections[-1]['items'].append({'i': i, 'done': m.group(2) != ' ',
                                          'text': body[:r.start()] if r else body,
                                          'ref': r.group(1) if r else ''})
    return [s for s in sections if s['title'] or s['items']]


def toggle_line(text, i):
    lines = text.split('\n')
    m = CHECK_RE.match(lines[i]) if 0 <= i < len(lines) else None
    if not m:
        raise ValueError('체크 항목이 아닌 줄입니다. PLAN.md가 바뀌었으면 새로고침하세요.')
    lines[i] = m.group(1) + (' ' if m.group(2) != ' ' else 'x') + m.group(3) + m.group(4)
    return '\n'.join(lines)


def add_line(text, item, ref=''):
    """첫 번째 '## ' 섹션 맨 위에 항목을 넣는다(섹션이 없으면 끝에)."""
    item = ' '.join(item.split())[:200]
    if not item:
        raise ValueError('내용이 비어 있습니다.')
    new = f'- [ ] {item}' + (f' · [[{ref}]]' if ref else '')
    lines = text.split('\n')
    at = next((k + 1 for k, l in enumerate(lines) if l.startswith('## ')), None)
    if at is None:
        return text.rstrip('\n') + '\n' + new + '\n'
    lines.insert(at, new)
    return '\n'.join(lines)


def collect(live):
    log = git('log', f'--since={DAYS} days ago', '--pretty=format:%h%x1f%ad%x1f%s',
              '--date=format:%Y-%m-%d %H:%M')
    status = []
    for line in git('status', '--porcelain').splitlines():
        status.append({'c': line[:2].strip() or '?', 'p': line[3:].strip('"')})
    branches = []
    for line in git('for-each-ref', f'--no-merged={MAIN_BRANCH}', '--sort=-committerdate',
                    '--format=%(refname:short)\x1f%(committerdate:short)', 'refs/heads').splitlines():
        n, d = line.split('\x1f')
        branches.append({'n': n, 'd': d})
    ahead = git('rev-list', '--count', '@{u}..HEAD')

    plan_text = PLAN.read_text(encoding='utf-8') if PLAN.exists() else ''
    plan = parse_plan(plan_text)
    in_plan = {it['ref'] for s in plan for it in s['items'] if it['ref']}
    hidden = set(HIDDEN.read_text(encoding='utf-8').split()) if HIDDEN.exists() else set()
    mems = memories()
    found = sorted((m for m in mems.values() if m['tags'] and m['slug'] not in in_plan | hidden),
                   key=lambda m: m['date'], reverse=True)
    return {
        'live': live,
        'generatedAt': datetime.now().strftime('%Y-%m-%d %H:%M'),
        'branch': git('branch', '--show-current'),
        'ahead': int(ahead) if ahead.isdigit() else None,
        'commits': [parse_commit(l) for l in log.splitlines() if l.count('\x1f') >= 2],
        'status': status,
        'shortstat': git('diff', '--shortstat', 'HEAD'),
        'branches': branches,
        'plan': plan,
        'found': found,
        'tagOrder': [name for name, _ in TAGS],
        'release': [mems[s] for s in RELEASE if s in mems],
        'memoryFound': MEMORY.is_dir(),
    }


def render(live):
    data = json.dumps(collect(live), ensure_ascii=False).replace('</', '<\\/')
    logo = 'data:image/png;base64,' + base64.b64encode(LOGO.read_bytes()).decode() if LOGO.exists() else ''
    return TEMPLATE.read_text(encoding='utf-8').replace('/*__DATA__*/null', data).replace('__LOGO__', logo)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        raw = body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path.split('?')[0] != '/':
            return self._send(404, '{}')
        head = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        self._send(200, head + render(live=True), 'text/html; charset=utf-8')

    def do_POST(self):
        # 같은 출처의 JSON 요청만 받는다(다른 사이트가 로컬 파일을 고치지 못하게).
        origin = self.headers.get('Origin')
        if self.path != '/api/plan' or self.headers.get('Content-Type') != 'application/json' or (
                origin and origin != f'http://{self.headers.get("Host")}'):
            return self._send(403, '{"error":"forbidden"}')
        try:
            req = json.loads(self.rfile.read(int(self.headers.get('Content-Length') or 0)) or b'{}')
            op = req.get('op')
            if op == 'hide':
                slug = str(req.get('ref', ''))
                if not re.fullmatch(r'[\w-]+', slug):
                    raise ValueError('잘못된 항목입니다.')
                with HIDDEN.open('a', encoding='utf-8') as f:
                    f.write(slug + '\n')
                return self._send(200, '{}')
            text = PLAN.read_text(encoding='utf-8') if PLAN.exists() else '# eOrth 계획\n\n## 이번 주\n'
            if op == 'toggle':
                text = toggle_line(text, int(req.get('i', -1)))
            elif op == 'add':
                ref = str(req.get('ref', ''))
                text = add_line(text, str(req.get('text', '')), ref if re.fullmatch(r'[\w-]*', ref) else '')
            else:
                raise ValueError('알 수 없는 요청입니다.')
            PLAN.write_text(text, encoding='utf-8')
            self._send(200, '{}')
        except (ValueError, TypeError) as e:
            self._send(400, json.dumps({'error': str(e)}, ensure_ascii=False))


def selftest():
    c = parse_commit('abc1234\x1f2026-10-03 09:00\x1fperf(store): 슬라이스 분리')
    assert (c['type'], c['scope'], c['subj']) == ('perf', 'store', '슬라이스 분리'), c
    assert parse_commit('abc\x1f2026-10-03 09:00\x1fMerge branch x')['type'] == ''
    assert tags_of('2026-10-02 구현, 미커밋·실기기 미검증') == ['미커밋', '실기기 검증']
    assert tags_of('실기기 검증·master 병합 완료') == []
    assert '서버 반영' in tags_of('미커밋·SQL 미실행·send-push 미배포')
    plan = '# 계획\n\n## 이번 주\n- [ ] 행사 데이터 파기 · [[eorth-event-mate-matching]]\n- [x] 끝난 일\n'
    p = parse_plan(plan)
    assert p[0]['title'] == '이번 주' and p[0]['items'][0]['ref'] == 'eorth-event-mate-matching'
    assert p[0]['items'][0]['text'] == '행사 데이터 파기' and p[0]['items'][1]['done']
    assert '- [x] 행사' in toggle_line(plan, 3) and '- [ ] 끝난' in toggle_line(plan, 4)
    assert add_line(plan, '  새   일 ', 'eorth-x').split('\n')[3] == '- [ ] 새 일 · [[eorth-x]]'
    for bad in (0, 99):
        try:
            toggle_line(plan, bad)
            raise AssertionError('제목 줄·범위 밖은 거부해야 함')
        except ValueError:
            pass
    print('자가 점검 통과')


def main():
    if '--check' in sys.argv:
        return selftest()
    if '--export' in sys.argv:
        out = Path(sys.argv[sys.argv.index('--export') + 1])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(render(live=False), encoding='utf-8')
        return print(f'스냅샷 저장: {out}')
    srv = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{srv.server_port}/'
    if '--browser' not in sys.argv:
        try:
            import webview
            webview.create_window('eOrth 작업 궤도', url, width=1440, height=940, min_size=(420, 600),
                                  background_color='#0A0A0F')
            webview.start()
            return
        except Exception as e:
            print(f'네이티브 창 실패, 브라우저로 엽니다: {e}', file=sys.stderr)
    webbrowser.open(url)
    print(f'브라우저에서 열림: {url}  (이 창을 닫으면 프로그램이 종료됩니다)')
    try:
        threading.Event().wait()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
