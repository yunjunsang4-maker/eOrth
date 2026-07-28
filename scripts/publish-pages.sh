#!/usr/bin/env bash
#
# 공개 문서(개인정보처리방침·이용약관)를 GitHub Pages에 게시한다.
#
# 왜 이 스크립트가 있나:
#   Pages 소스가 한때 오래된 기능 브랜치(chore/permissions-and-privacy)로 잡혀 있어
#   master의 방침을 고쳐도 공개 URL이 몇 주째 옛 버전이었다(2026-07-28 발견).
#   또 docs/ 전체를 서빙하면 내부 설계 문서(superpowers/specs·plans)까지 공개된다.
#   그래서 Pages 소스는 이 스크립트가 만드는 gh-pages 브랜치(공개 파일만)로 고정한다.
#
# 사용법:  bash scripts/publish-pages.sh
#   master의 docs/privacy-policy.html·terms.html을 gh-pages 루트로 옮겨 담고 푸시한다.
#   작업트리는 건드리지 않는다(plumbing만 사용) — 중간에 브랜치가 바뀌지 않는다.
#
# 방침·약관을 고쳤다면: master에 커밋·푸시한 뒤 이 스크립트를 실행할 것.
# 실행 후 반영까지 1~2분 걸리며, 아래 검증 출력으로 확인한다.
set -euo pipefail

REPO_SLUG="yunjunsang4-maker/eOrth"
SITE="https://yunjunsang4-maker.github.io/eOrth"
SRC_REF="${1:-master}"

cd "$(dirname "$0")/.."

echo "== $SRC_REF 의 docs/ 에서 공개 파일을 모읍니다"
PP=$(git rev-parse "$SRC_REF:docs/privacy-policy.html")
TM=$(git rev-parse "$SRC_REF:docs/terms.html")
NJ=$(git rev-parse "$SRC_REF:docs/.nojekyll")

# index.html 은 gh-pages 에만 있는 파일이라 기존 것을 그대로 승계한다.
# (없으면 방침 파일로 대체해 두고, 필요할 때 직접 만든다)
IDX=$(git rev-parse "refs/remotes/origin/gh-pages:index.html" 2>/dev/null || echo "$PP")

TREE=$(printf '100644 blob %s\tprivacy-policy.html\n100644 blob %s\tterms.html\n100644 blob %s\t.nojekyll\n100644 blob %s\tindex.html\n' \
  "$PP" "$TM" "$NJ" "$IDX" | git mktree)

PARENT=$(git rev-parse refs/remotes/origin/gh-pages 2>/dev/null || echo "")
if [ -n "$PARENT" ]; then
  COMMIT=$(git commit-tree "$TREE" -p "$PARENT" -m "chore(pages): 공개 문서 갱신 ($SRC_REF)")
else
  COMMIT=$(git commit-tree "$TREE" -m "chore(pages): 공개 문서 게시")
fi

git update-ref refs/heads/gh-pages "$COMMIT"
git push origin gh-pages
echo "== 푸시 완료: $COMMIT"

# Pages 는 소스 브랜치를 바꿔도 자동으로 다시 굽지 않는다 — 명시적으로 요청한다.
if command -v gh >/dev/null 2>&1; then
  gh api -X POST "repos/$REPO_SLUG/pages/builds" >/dev/null
  echo "== Pages 재빌드 요청함"
fi

echo "== 반영 확인 (최대 3분 대기)"
for i in $(seq 1 9); do
  sleep 20
  if curl -fsS --max-time 20 "$SITE/privacy-policy.html?v=$i" | grep -q "AdMob"; then
    echo "   OK — $SITE/privacy-policy.html 최신본 서빙 중"
    exit 0
  fi
  echo "   대기 중... ($i/9)"
done

echo "   아직 반영 안 됨. gh api repos/$REPO_SLUG/pages/builds 로 빌드 상태를 확인할 것." >&2
exit 1
