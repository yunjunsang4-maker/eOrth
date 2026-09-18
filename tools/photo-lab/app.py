"""eOrth 사진 AI 랩 — 바탕화면 아이콘으로 켜는 프로그램.

로컬 HTTP 서버(127.0.0.1, 임의 포트)를 띄우고 네이티브 창(pywebview)에 ui.html을 연다.
pywebview가 없으면 기본 브라우저로 같은 화면을 연다.

  python tools/photo-lab/app.py            # 창 실행
  python tools/photo-lab/app.py --browser  # 브라우저로
  python tools/photo-lab/app.py --serve    # 서버만(개발·검증용, 포트 출력)
"""
import json
import os
import subprocess
import sys
import threading
import traceback
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

os.environ.setdefault('KMP_DUPLICATE_LIB_OK', 'TRUE')  # Anaconda MKL + torch OpenMP 이중 로드 회피
LAB = Path(__file__).parent.resolve()
sys.path.insert(0, str(LAB))
import extract  # noqa: E402
import teach  # noqa: E402

ROOT = LAB.parent.parent
OUT = LAB / 'out'
DATA = LAB / 'data'
UI = LAB / 'ui.html'
REGISTER_URL = (LAB / 'register.mjs').as_uri()

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except Exception:
        pass

# ─────────────────────────────────────────────
# 상태
# ─────────────────────────────────────────────

progress = {'busy': False, 'step': '', 'done': 0, 'total': 0, 'message': '', 'error': None, 'trip': None}
lock = threading.Lock()
window = None  # pywebview 창(있으면 폴더 대화상자에 씀)


def trip_out(name):
    safe = Path(name).name
    if not safe or safe.startswith('.'):
        raise ValueError('여행 이름이 비었습니다')
    return OUT / safe


def run_pipeline(name):
    """node로 앱 JS 층 실행 → out/<name>/result.json. 학습 오버레이·정답을 같이 넘긴다."""
    out = trip_out(name)
    cmd = ['node', '--import', 'tsx', '--import', REGISTER_URL, str(LAB / 'report.ts'), str(out), '--json',
           '--overlay', str(teach.LEARNED_PATH), '--teach', str(teach.TEACH_PATH)]
    r = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8', errors='replace')
    if r.returncode != 0:
        raise RuntimeError(f'파이프라인 실패\n{r.stderr[-1500:]}')
    return json.loads((out / 'result.json').read_text('utf-8'))


def relearn():
    learned = teach.learn(teach.load_teach())
    teach.write_learned(learned)
    return learned


def list_trips():
    trips = []
    if OUT.exists():
        for d in sorted(OUT.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            sig = d / 'signals.json'
            if not d.is_dir() or not sig.exists():
                continue
            try:
                s = json.loads(sig.read_text('utf-8'))
                trips.append({'name': d.name, 'sourceDir': s.get('sourceDir', ''), 'photos': len(s.get('photos', [])),
                              'hasResult': (d / 'result.json').exists()})
            except Exception:
                continue
    return trips


def taught_counts(t):
    """(정답 장수, 수동 탈락 장수). 탈락을 정답에 섞어 세면 '정답 N장'이 부풀려진다."""
    rejected = sum(1 for e in t.values() if e.get('concept') == teach.REJECT)
    return len(t) - rejected, rejected


def state():
    t = teach.load_teach()
    learned = json.loads(teach.LEARNED_PATH.read_text('utf-8')) if teach.LEARNED_PATH.exists() else []
    taught, rejected = taught_counts(t)
    return {'trips': list_trips(), 'taught': taught, 'rejected': rejected, 'learned': learned, 'progress': progress,
            'taxonomyPath': str(teach.TAXONOMY_PATH), 'modelReady': extract._MODEL is not None}


def analyze_worker(photo_dir, force):
    name = Path(photo_dir).name
    try:
        progress.update(busy=True, step='extract', error=None, trip=name, done=0, total=0, message='사진 찾는 중')

        def cb(done, total, msg):
            progress.update(done=done, total=total, message=msg)

        extract.extract(photo_dir, trip_out(name), force=force, progress=cb)
        progress.update(step='pipeline', message='앱 규칙으로 판정 중')
        run_pipeline(name)
        progress.update(step='done', message='완료')
    except Exception as e:
        progress.update(step='error', error=f'{e}\n{traceback.format_exc()[-800:]}')
    finally:
        progress['busy'] = False


def pick_folder():
    """pywebview 창이 있으면 그 대화상자, 없으면 tkinter. 취소면 None."""
    if window is not None:
        try:
            import webview
            res = window.create_file_dialog(webview.FileDialog.FOLDER)
            return res[0] if res else None
        except Exception:
            pass
    try:
        import tkinter
        from tkinter import filedialog
        root = tkinter.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        p = filedialog.askdirectory(title='여행 사진 폴더 선택')
        root.destroy()
        return p or None
    except Exception:
        return None


# ─────────────────────────────────────────────
# HTTP
# ─────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):  # 콘솔 소음 제거
        pass

    def _send(self, code, body, ctype='application/json; charset=utf-8'):
        data = body if isinstance(body, bytes) else json.dumps(body, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def _json(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}')

    def do_GET(self):
        path = unquote(urlparse(self.path).path)
        try:
            if path == '/':
                return self._send(200, UI.read_bytes(), 'text/html; charset=utf-8')
            if path == '/api/state':
                return self._send(200, state())
            if path == '/api/progress':
                return self._send(200, progress)
            if path.startswith('/api/trip/'):
                name = path[len('/api/trip/'):]
                # 열 때마다 다시 판정한다(2초) — 프로그램 밖에서 앱 파일·정답 데이터가 바뀌어도 화면이 낡지 않게
                result = run_pipeline(name)
                t = teach.load_teach()
                result['answers'] = {uri: e['concept'] for uri, e in t.items()}
                return self._send(200, result)
            if path.startswith('/out/'):
                rel = Path(path[len('/out/'):])
                f = (OUT / rel).resolve()
                if OUT.resolve() not in f.parents or not f.is_file():
                    return self._send(404, {'error': 'not found'})
                ctype = 'image/jpeg' if f.suffix.lower() in ('.jpg', '.jpeg') else 'application/octet-stream'
                return self._send(200, f.read_bytes(), ctype)
            return self._send(404, {'error': 'not found'})
        except Exception as e:
            return self._send(500, {'error': str(e), 'trace': traceback.format_exc()[-1200:]})

    def do_POST(self):
        path = unquote(urlparse(self.path).path)
        try:
            body = self._json()
            if path == '/api/pick':
                return self._send(200, {'dir': pick_folder()})
            if path == '/api/analyze':
                d = body.get('dir', '')
                if not d or not Path(d).is_dir():
                    return self._send(400, {'error': f'폴더가 없습니다: {d}'})
                with lock:
                    if progress['busy']:
                        return self._send(409, {'error': '이미 분석 중입니다'})
                    progress['busy'] = True
                threading.Thread(target=analyze_worker, args=(d, bool(body.get('force'))), daemon=True).start()
                return self._send(200, {'trip': Path(d).name})
            if path == '/api/teach':
                name, uri, concept = body['trip'], body['uri'], body.get('concept')
                out = trip_out(name)
                sig = json.loads((out / 'signals.json').read_text('utf-8'))
                photo = next((p for p in sig['photos'] if p['uri'] == uri), None)
                if photo is None:
                    return self._send(404, {'error': '사진을 찾지 못했습니다'})
                t = teach.load_teach()
                teach.set_answer(t, uri, concept, photo.get('signal', {}).get('sceneLabels', []),
                                 photo.get('signal', {}).get('dhash', ''), name)
                teach.save_teach(t)
                learned = relearn()
                result = run_pipeline(name)
                result['answers'] = {u: e['concept'] for u, e in t.items()}
                taught, rejected = taught_counts(t)
                return self._send(200, {'result': result, 'learned': learned,
                                        'taught': taught, 'rejected': rejected})
            if path == '/api/apply':
                learned = relearn()
                n = teach.apply()
                for trip in list_trips():
                    try:
                        run_pipeline(trip['name'])
                    except Exception:
                        pass
                return self._send(200, {'applied': n, 'learned': learned, 'path': str(teach.TAXONOMY_PATH)})
            if path == '/api/open-report':
                name = body['trip']
                out = trip_out(name)
                cmd = ['node', '--import', 'tsx', '--import', REGISTER_URL, str(LAB / 'report.ts'), str(out),
                       '--overlay', str(teach.LEARNED_PATH), '--teach', str(teach.TEACH_PATH)]
                subprocess.run(cmd, cwd=str(ROOT), capture_output=True)
                webbrowser.open((out / 'report.html').as_uri())
                return self._send(200, {'ok': True})
            if path == '/api/open-folder':
                p = body.get('path', '')
                if p and Path(p).exists():
                    os.startfile(p)
                return self._send(200, {'ok': True})
            return self._send(404, {'error': 'not found'})
        except Exception as e:
            return self._send(500, {'error': str(e), 'trace': traceback.format_exc()[-1200:]})


def serve():
    srv = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    global window
    DATA.mkdir(exist_ok=True)
    OUT.mkdir(exist_ok=True)
    srv = serve()
    url = f'http://127.0.0.1:{srv.server_port}/'
    if '--serve' in sys.argv:
        print(url, flush=True)
        try:
            threading.Event().wait()
        except KeyboardInterrupt:
            pass
        return
    if '--browser' not in sys.argv:
        try:
            import webview
            window = webview.create_window('eOrth 사진 AI 랩', url, width=1440, height=920, min_size=(900, 600))
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
